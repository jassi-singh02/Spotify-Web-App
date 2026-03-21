import { Router } from 'express';
import { spotifyGet } from '../utils/spotify.js';

const router = Router();
// check in 
// Dashboard route: fetch user data and listening history from Spotify
router.get("/dashboard", async (req, res) => {
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

export default router;
