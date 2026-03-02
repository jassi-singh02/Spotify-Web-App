import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;
// check in + 3
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// In-memory storage for posts
const posts = [];

app.get("/", (req, res) => {
  res.render("index")
});

app.get("/community", (req, res) => {
  res.render("community", { posts });
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

