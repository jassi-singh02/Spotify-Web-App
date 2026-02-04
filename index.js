import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;

app.use(express.static("public"));
app.set("view engine", "ejs");

app.get("/", (req, res) => {
  res.render("index")
});

app.get("/community", (req, res) => {
  res.render("community")
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

