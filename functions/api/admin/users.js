import { ensureSchema } from '../../_lib/db.js';
import { getSecret, json, parseCookies, verifyToken } from '../../_lib/crypto.js';

export async function onRequestGet({ request, env }) {
  const cookies = parseCookies(request);
  const payload = await verifyToken(cookies.sp_admin, getSecret(env));
  if (!payload || payload.role !== 'admin') {
    return json({ error: 'غير مصرح.' }, 401);
  }
  if (!env.DB) {
    return json({ error: 'قاعدة البيانات (DB) غير مربوطة.' }, 503);
  }
  await ensureSchema(env.DB);

  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.plan, u.plan_expires_at, u.status, u.custom_daily_limit, u.notes,
            u.usage_count, u.city, u.country, u.created_at, u.last_login,
            (SELECT COUNT(*) FROM prompts p WHERE p.user_id = u.id AND date(p.created_at) = date('now')) AS today_count
     FROM users u
     ORDER BY u.id DESC
     LIMIT 300`
  ).all();

  return json({ ok: true, users: results || [] });
}
