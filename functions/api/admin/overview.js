import { ensureSchema, getAdConfig, getAllStats, getSubSettings } from '../../_lib/db.js';
import { getSecret, json, parseCookies, verifyToken } from '../../_lib/crypto.js';
import { CATEGORIES } from '../../_lib/prompts.js';

async function requireAdmin(request, env) {
  const cookies = parseCookies(request);
  const payload = await verifyToken(cookies.sp_admin, getSecret(env));
  return Boolean(payload && payload.role === 'admin');
}

export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) {
    return json({ error: 'غير مصرح.' }, 401);
  }
  if (!env.DB) {
    return json({ error: 'قاعدة البيانات (DB) غير مربوطة.' }, 503);
  }
  await ensureSchema(env.DB);

  const [usersCountRow, proCountRow, statsMap, ad, subSettings, gRow, kRow] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM users').first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM users WHERE plan = 'pro' AND status = 'active'`).first(),
    getAllStats(env.DB),
    getAdConfig(env.DB),
    getSubSettings(env.DB),
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'google_client_id'`).first(),
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'gemini_api_key'`).first()
  ]);

  const hasGeminiKey = Boolean((kRow && kRow.value) || env.GEMINI_API_KEY);
  const rawCid = ((gRow && gRow.value) || env.GOOGLE_CLIENT_ID || '').trim();
  const googleClientId = /^[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com$/i.test(rawCid) ? rawCid : '';

  const categoryTotals = CATEGORIES.map((c) => ({
    key: c.key,
    name: c.n,
    count: statsMap[`gen-${c.key}`] || 0
  }));

  return json({
    ok: true,
    ai_enabled: hasGeminiKey,
    google_client_id: googleClientId,
    users_count: Number(usersCountRow && usersCountRow.count) || 0,
    pro_count: Number(proCountRow && proCountRow.count) || 0,
    stats: {
      visitors: statsMap.visitors || 0,
      visits: statsMap.visits || 0,
      gen: statsMap.gen || 0
    },
    category_totals: categoryTotals,
    ad,
    sub_settings: subSettings
  });
}
