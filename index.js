import axios from 'axios';
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


app.use(express.static(path.join(__dirname, "Public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "Views")); 

app.get("/", (req, res) => res.render("index"));

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

