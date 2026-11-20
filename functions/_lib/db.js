// Cloudflare D1 database helper with automatic schema bootstrap

let schemaReady = false;

export const DEFAULT_AD = {
  on: true,
  type: 'image',
  img: '/imeges/banner.png',
  link: 'https://3dyat.com/',
  text: 'ثرديات موقع يحقق أحلامك',
  code: ''
};

export async function ensureSchema(db) {
  if (!db || schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      usage_count INTEGER NOT NULL DEFAULT 0,
      city TEXT DEFAULT '',
      country TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_email TEXT NOT NULL,
      user_name TEXT DEFAULT '',
      category_key TEXT NOT NULL,
      category_name TEXT NOT NULL,
      mode INTEGER NOT NULL DEFAULT 0,
      idea TEXT NOT NULL,
      result TEXT NOT NULL,
      engine TEXT NOT NULL DEFAULT 'ai',
      city TEXT DEFAULT '',
      country TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS stats (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_prompts_created_at ON prompts(created_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`)
  ]);
  schemaReady = true;
}

export async function incrementStat(db, key, by = 1) {
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO stats (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = value + ?`
    )
    .bind(key, by, by)
    .run();
}

export async function getAllStats(db) {
  if (!db) return {};
  const { results } = await db.prepare(`SELECT key, value FROM stats`).all();
  const map = {};
  for (const row of results || []) map[row.key] = Number(row.value) || 0;
  return map;
}

export async function getAdConfig(db) {
  if (!db) return DEFAULT_AD;
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'ad_config'`).first();
  if (!row || !row.value) return DEFAULT_AD;
  try {
    return { ...DEFAULT_AD, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_AD;
  }
}
