import { Router } from 'express';
import db from '../utils/db.js';

const router = Router();

// Fetch all posts, newest first. LEFT JOIN so guest posts (no user_id) still appear.
const getAllPosts = db.prepare(`
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

// Insert a new post
const insertPost = db.prepare(`
  INSERT INTO posts (user_id, guest_name, title, body, snapshot_json)
  VALUES (@user_id, @guest_name, @title, @body, @snapshot_json)
`);

router.get("/community", (req, res) => {
  const posts = getAllPosts.all();
  res.render("community", { posts, user: req.session.display_name || null });
});

router.post("/community", (req, res) => {
  const { title, body, guest_name, snapshot_json } = req.body;

  if (title && body) {
    insertPost.run({
      user_id:       req.session.user_id || null,
      guest_name:    req.session.user_id ? null : (guest_name?.trim() || 'Anonymous'),
      title,
      body,
      snapshot_json: snapshot_json || null
    });
  }

  res.redirect('/community');
});

export default router;
