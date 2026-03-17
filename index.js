import express from 'express';
import dotenv from 'dotenv';
import session from 'express-session';

import authRoutes from './routes/auth.js';
import communityRoutes from './routes/community.js';
import dashboardRoutes from './routes/dashboard.js';

dotenv.config();

const app = express();
const port = 3000;

// Serve static assets and parse form bodies
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// Session middleware: stores PKCE verifier and tokens in user's session
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // set `true` when using HTTPS in production
}));

// Routes
app.get("/", (req, res) => {
  res.render("index");
});

app.use('/auth', authRoutes);
app.use('/', communityRoutes);
app.use('/', dashboardRoutes);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
