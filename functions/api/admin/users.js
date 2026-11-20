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
    `SELECT id, email, name, plan, usage_count, city, country, created_at, last_login
     FROM users
     ORDER BY id DESC
     LIMIT 200`
  ).all();

  return json({ ok: true, users: results || [] });
}
