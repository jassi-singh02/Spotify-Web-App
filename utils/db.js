import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

// Pool manages multiple connections automatically.
// DATABASE_URL is set by Railway in production, and in your .env locally.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Create tables on first run — safe to run every time due to IF NOT EXISTS
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id           SERIAL PRIMARY KEY,
    spotify_id   TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url   TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS posts (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER REFERENCES users(id),
    guest_name    TEXT,
    title         TEXT NOT NULL,
    body          TEXT NOT NULL,
    snapshot_json TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )
`);

export default pool;
