import { Router } from 'express';
import db from '../utils/db.js';

const router = Router();

// Fetch all posts joined with the author's display name, newest first
const getAllPosts = db.prepare(`
  SELECT
    posts.id,
    posts.title,
    posts.body,
    posts.snapshot_json,
    posts.created_at,
    users.display_name AS author_name,
    users.avatar_url   AS author_avatar
  FROM posts
  JOIN users ON posts.user_id = users.id
  ORDER BY posts.created_at DESC
`);

// Insert a new post
const insertPost = db.prepare(`
  INSERT INTO posts (user_id, title, body, snapshot_json)
  VALUES (@user_id, @title, @body, @snapshot_json)
`);

router.get("/community", (req, res) => {
  const posts = getAllPosts.all(); // .all() returns every matching row as an array
  res.render("community", { posts });
});

router.post("/community", (req, res) => {
  // Must be logged in to post
  if (!req.session.user_id) {
    return res.redirect('/auth/login');
  }

  const { title, body, snapshot_json } = req.body;

  if (title && body) {
    insertPost.run({
      user_id:       req.session.user_id,
      title,
      body,
      snapshot_json: snapshot_json || null
    });
  }

  res.redirect('/community');
});

export default router;
