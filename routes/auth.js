import { Router } from 'express';
import crypto from 'crypto';
import { base64url, sha256 } from '../utils/spotify.js';
import pool from '../utils/db.js';

const router = Router();

// Start Spotify OAuth PKCE flow: generate code_verifier + code_challenge and redirect
router.get("/login", (req, res) => {
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
router.get("/callback", async (req, res) => {
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

    // Fetch Spotify profile so we can save it to the database
    const profileResp = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await profileResp.json();

    // Upsert: insert the user if they're new, update their name/avatar if they've logged in before.
    // ON CONFLICT targets the unique spotify_id column.
    await pool.query(
      `INSERT INTO users (spotify_id, display_name, avatar_url)
       VALUES ($1, $2, $3)
       ON CONFLICT(spotify_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         avatar_url   = EXCLUDED.avatar_url`,
      [profile.id, profile.display_name || 'Unknown', profile.images?.[0]?.url || null]
    );

    // Read back the row to get our internal DB id
    const { rows } = await pool.query('SELECT id FROM users WHERE spotify_id = $1', [profile.id]);
    const dbUser = rows[0];

    // Save our DB user id and display name to session for use in other routes
    req.session.user_id = dbUser.id;
    req.session.display_name = profile.display_name;

    // Clear sensitive session values after successful use
    delete req.session.code_verifier;
    delete req.session.oauth_state;

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Auth callback error:', err);
    res.status(500).render('error', { message: 'An error occurred during authentication.' });
  }
});

export default router;
