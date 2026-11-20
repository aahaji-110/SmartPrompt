// Cloudflare D1 database helper with automatic schema bootstrap & migrations (Lightweight Stats-Only)

let schemaReady = false;

export const DEFAULT_AD = {
  on: true,
  type: 'image',
  img: '/imeges/banner.png',
  link: 'https://3dyat.com/',
  text: 'ثرديات موقع يحقق أحلامك',
  code: ''
};

export const DEFAULT_SUB_SETTINGS = {
  paid_mode: false,
  free_daily_limit: 3,
  pro_daily_limit: 0,
  free_allow_images: true,
  upgrade_price: '29 ريال / شهرياً',
  upgrade_link: 'https://3dyat.com/'
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
      plan_expires_at TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      custom_daily_limit INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      usage_count INTEGER NOT NULL DEFAULT 0,
      city TEXT DEFAULT '',
      country TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_category_stats (
      user_id INTEGER NOT NULL,
      category_key TEXT NOT NULL,
      category_name TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, category_key)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_daily_usage (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
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
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`)
  ]);

  const migrations = [
    `ALTER TABLE users ADD COLUMN plan_expires_at TEXT DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE users ADD COLUMN custom_daily_limit INTEGER DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN notes TEXT DEFAULT ''`
  ];
  for (const sql of migrations) {
    try {
      await db.prepare(sql).run();
    } catch {
      // Column already exists
    }
  }

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

export async function getSubSettings(db) {
  if (!db) return DEFAULT_SUB_SETTINGS;
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'sub_settings'`).first();
  if (!row || !row.value) return DEFAULT_SUB_SETTINGS;
  try {
    return { ...DEFAULT_SUB_SETTINGS, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_SUB_SETTINGS;
  }
}

export function resolveEffectivePlan(user) {
  if (!user || user.plan !== 'pro') return 'free';
  if (user.plan_expires_at) {
    const exp = Date.parse(user.plan_expires_at + (user.plan_expires_at.length === 10 ? 'T23:59:59Z' : ''));
    if (!Number.isNaN(exp) && exp < Date.now()) return 'free';
  }
  return 'pro';
}

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}
