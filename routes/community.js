import { Router } from 'express';
import pool from '../utils/db.js';

const router = Router();

router.get('/community', async (req, res) => {
  try {
    const { rows: posts } = await pool.query(`
      SELECT
        posts.id,
        posts.title,
        posts.body,
        posts.snapshot_json,
        posts.created_at,
        COALESCE(users.display_name, posts.guest_name, 'Anonymous') AS author_name,
        users.avatar_url AS author_avatar
      FROM posts
      LEFT JOIN users ON posts.user_id = users.id
      ORDER BY posts.created_at DESC
    `);

    res.render('community', { posts, user: req.session.display_name || null });
  } catch (err) {
    console.error('Community fetch error:', err);
    res.status(500).render('error', { message: 'Failed to load community posts.' });
  }
});

router.post('/community', async (req, res) => {
  try {
    const { title, body, guest_name, snapshot_json } = req.body;

    if (title && body) {
      await pool.query(
        `INSERT INTO posts (user_id, guest_name, title, body, snapshot_json)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          req.session.user_id || null,
          req.session.user_id ? null : (guest_name?.trim() || 'Anonymous'),
          title,
          body,
          snapshot_json || null
        ]
      );
    }

    res.redirect('/community');
  } catch (err) {
    console.error('Community post error:', err);
    res.status(500).render('error', { message: 'Failed to save post.' });
  }
});

export default router;
