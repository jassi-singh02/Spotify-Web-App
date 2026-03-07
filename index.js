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

  req.session.code_verifier = code_verifier; // save verifier for token exchange

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
    show_dialog: 'true'
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// OAuth callback: exchange authorization code + verifier for tokens
app.get("/auth/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect('/');

  const code_verifier = req.session.code_verifier;
  if (!code || !code_verifier) return res.redirect('/');

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
    console.error('Token error', tokenData);
    return res.redirect('/');
  }

  // store tokens in session (consider persisting in DB for production)
  req.session.access_token = tokenData.access_token;
  req.session.refresh_token = tokenData.refresh_token;
  req.session.token_expires_at = Date.now() + (tokenData.expires_in || 3600) * 1000;

  res.redirect('/community');
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

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

