import { Router } from 'express';
import crypto from 'crypto';
import { base64url, sha256 } from '../utils/spotify.js';

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
