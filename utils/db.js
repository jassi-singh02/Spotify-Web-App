import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// __dirname equivalent for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure the data directory exists (won't fail if it already does)
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Opens the database file (creates it if it doesn't exist)
const db = new Database(path.join(dataDir, 'app.db'));

// Enable WAL mode: better performance for concurrent reads/writes
db.pragma('journal_mode = WAL');

// Create tables on first run — IF NOT EXISTS means this is safe to run every time
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    spotify_id   TEXT    UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url   TEXT,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER REFERENCES users(id),
    guest_name    TEXT,
    title         TEXT    NOT NULL,
    body          TEXT    NOT NULL,
    snapshot_json TEXT,
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  -- Add guest_name column if upgrading from old schema
  CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY);

`);

// Migrate: add guest_name column if it doesn't exist yet
const columns = db.pragma('table_info(posts)').map(c => c.name);
if (!columns.includes('guest_name')) {
  db.exec(`ALTER TABLE posts ADD COLUMN guest_name TEXT;`);
}

export default db;
