import crypto from 'crypto';

// Utility: base64url-encode a buffer (used for PKCE)
export function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Utility: SHA256 digest of input (used for PKCE code_challenge)
export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

// Helper: check if access token is expired
export function isTokenExpired(req) {
  const expires_at = req.session.token_expires_at;
  if (!expires_at) return true;
  return Date.now() >= expires_at;
}

// Helper: refresh access token using stored refresh token (returns new access token or null)
export async function refreshAccessToken(req) {
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
export async function getValidAccessToken(req) {
  if (!req.session.access_token) return null;
  if (!isTokenExpired(req)) return req.session.access_token;
  return await refreshAccessToken(req);
}

// Helper: make an authenticated request to Spotify API
export async function spotifyGet(req, url) {
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
