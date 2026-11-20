-- SmartPrompt (3dyat) Cloudflare D1 Schema (Lightweight Stats-Only)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_expires_at TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  custom_daily_limit INTEGER DEFAULT NULL,
  notes TEXT DEFAULT '',
  usage_count INTEGER NOT NULL DEFAULT 0,
  city TEXT DEFAULT '',
  country TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_category_stats (
  user_id INTEGER NOT NULL,
  category_key TEXT NOT NULL,
  category_name TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, category_key)
);

CREATE TABLE IF NOT EXISTS user_daily_usage (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS stats (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
