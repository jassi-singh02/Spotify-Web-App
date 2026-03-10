import express from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import crypto from 'crypto';

dotenv.config();

const app = express();
const port = 3000;
// serve static assets and parse form bodies
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// Session middleware: stores PKCE verifier and tokens in user's session
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // set `true` when using HTTPS in production
})); 

// In-memory storage for posts (replace with DB in production)
const posts = [];

// Utility: base64url-encode a buffer (used for PKCE)
function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Utility: SHA256 digest of input (used for PKCE code_challenge)
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

// Helper: check if access token is expired
function isTokenExpired(req) {
  const expires_at = req.session.token_expires_at;
  if (!expires_at) return true;
  return Date.now() >= expires_at;
}

// Helper: refresh access token using stored refresh token (returns new access token or null)
async function refreshAccessToken(req) {
  const refresh_token = req.session.refresh_token;
  if (!refresh_token) return null;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token,
    client_id: process.env.SPOTIFY_CLIENT_ID
  });

  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  const data = await resp.json();
  if (data.access_token) {
    req.session.access_token = data.access_token;
    req.session.token_expires_at = Date.now() + (data.expires_in || 3600) * 1000;
    return data.access_token;
  }
  return null;
}

// Helper: get a valid access token (refresh if needed)
async function getValidAccessToken(req) {
  if (!req.session.access_token) return null;
  if (!isTokenExpired(req)) return req.session.access_token;
  return await refreshAccessToken(req);
}

// Helper: make an authenticated request to Spotify API
async function spotifyGet(req, url) {
  const token = await getValidAccessToken(req);
  if (!token) throw new Error('No valid access token');

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    throw new Error(`Spotify API error: ${resp.status}`);
  }

  return resp.json();
}

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/community", (req, res) => {
  // Render community view with current posts
  res.render("community", { posts });
});

// Start Spotify OAuth PKCE flow: generate code_verifier + code_challenge and redirect
app.get("/auth/login", (req, res) => {
  const code_verifier = base64url(crypto.randomBytes(64)); // one-line: random PKCE verifier
  const code_challenge = base64url(sha256(code_verifier)); // one-line: derived code_challenge
  const state = base64url(crypto.randomBytes(32)); // generate random state for CSRF protection

  req.session.code_verifier = code_verifier; // save verifier for token exchange
  req.session.oauth_state = state; // save state for validation

  const scope = [
    'user-read-private',
    'user-read-email',
    'user-top-read',
    'user-read-recently-played'
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge,
    state, // include state parameter
    show_dialog: 'true'
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// OAuth callback: validate state, exchange authorization code + verifier for tokens
app.get("/auth/callback", async (req, res) => {
  try {
    const { code, error, state } = req.query;
    
    // Check for Spotify errors
    if (error) {
      return res.status(400).render('error', { message: `Spotify authorization failed: ${error}` });
    }

    // Validate state parameter (CSRF protection)
    if (!state || state !== req.session.oauth_state) {
      return res.status(400).render('error', { message: 'Invalid OAuth state.' });
    }

    const code_verifier = req.session.code_verifier;
    if (!code || !code_verifier) {
      return res.status(400).render('error', { message: 'Missing authorization code or PKCE verifier.' });
    }

    // Exchange authorization code for tokens
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      client_id: process.env.SPOTIFY_CLIENT_ID,
      code_verifier
    });

    const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const tokenData = await tokenResp.json();
    if (tokenData.error) {
      console.error('Token error:', tokenData);
      return res.status(400).render('error', { message: 'Failed to exchange authorization code for tokens.' });
    }

    // Store tokens in session
    req.session.access_token = tokenData.access_token;
    req.session.refresh_token = tokenData.refresh_token;
    req.session.token_expires_at = Date.now() + (tokenData.expires_in || 3600) * 1000;

    // Clear sensitive session values after successful use
    delete req.session.code_verifier;
    delete req.session.oauth_state;

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Auth callback error:', err);
    res.status(500).render('error', { message: 'An error occurred during authentication.' });
  }
});

app.post("/community", (req, res) => {
  const { title, body, author, snapshotUrl } = req.body;
  
  if (title && body) {
    const newPost = {
      title,
      body,
      author: author || "Anonymous",
      snapshotUrl: snapshotUrl || null,
      createdAt: new Date().toLocaleString()
    };
    
    posts.unshift(newPost); // Add to beginning so newest posts appear first
  }
  
  res.render("community", { posts });
});

// Dashboard route: fetch user data and listening history from Spotify
app.get("/dashboard", async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.session.access_token) {
      return res.redirect('/auth/login');
    }

    // Fetch user profile and listening data from Spotify
    const user = await spotifyGet(req, 'https://api.spotify.com/v1/me');
    const recentlyPlayed = await spotifyGet(req, 'https://api.spotify.com/v1/me/player/recently-played?limit=10');
    const topTracks = await spotifyGet(req, 'https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=10');
    const topArtists = await spotifyGet(req, 'https://api.spotify.com/v1/me/top/artists?time_range=long_term&limit=10');

    res.render('dashboard', {
      user,
      recent: recentlyPlayed.items || [],
      topTracks: topTracks.items || [],
      topArtists: topArtists.items || []
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).render('error', { message: 'Failed to load dashboard. Please try login again.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

