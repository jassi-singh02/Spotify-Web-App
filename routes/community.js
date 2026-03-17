import { Router } from 'express';

const router = Router();

// In-memory storage for posts (replace with DB in production)
const posts = [];

router.get("/community", (req, res) => {
  // Render community view with current posts
  res.render("community", { posts });
});

router.post("/community", (req, res) => {
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

export default router;
