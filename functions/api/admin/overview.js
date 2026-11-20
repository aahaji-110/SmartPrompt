import { ensureSchema, getAdConfig, getAllStats } from '../../_lib/db.js';
import { getSecret, json, parseCookies, verifyToken } from '../../_lib/crypto.js';

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

  const [promptsRes, usersCountRow, statsMap, ad] = await Promise.all([
    env.DB.prepare(
      `SELECT id, user_email, user_name, category_key, category_name, mode, idea, result, engine, city, country, created_at
       FROM prompts
       ORDER BY id DESC
       LIMIT 5`
    ).all(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM users').first(),
    getAllStats(env.DB),
    getAdConfig(env.DB)
  ]);

  return json({
    ok: true,
    ai_enabled: Boolean(env.GEMINI_API_KEY),
    users_count: Number(usersCountRow && usersCountRow.count) || 0,
    stats: {
      visitors: statsMap.visitors || 0,
      visits: statsMap.visits || 0,
      gen: statsMap.gen || 0
    },
    last_prompts: promptsRes.results || [],
    ad
  });
}
