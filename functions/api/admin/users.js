import { ensureSchema, todayUtc } from '../../_lib/db.js';
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

  const today = todayUtc();
  const [usersRes, catRes] = await Promise.all([
    env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.plan, u.plan_expires_at, u.status, u.custom_daily_limit, u.notes,
              u.usage_count, u.created_at, u.last_login,
              COALESCE(d.count, 0) AS today_count
       FROM users u
       LEFT JOIN user_daily_usage d ON d.user_id = u.id AND d.day = ?
       ORDER BY u.usage_count DESC, u.id DESC
       LIMIT 300`
    )
      .bind(today)
      .all(),
    env.DB.prepare(
      `SELECT user_id, category_key, category_name, count
       FROM user_category_stats
       WHERE count > 0
       ORDER BY count DESC`
    ).all()
  ]);

  const byUser = {};
  for (const row of catRes.results || []) {
    if (!byUser[row.user_id]) byUser[row.user_id] = [];
    byUser[row.user_id].push({
      key: row.category_key,
      name: row.category_name,
      count: Number(row.count) || 0
    });
  }

  const users = (usersRes.results || []).map((u) => ({
    ...u,
    breakdown: byUser[u.id] || []
  }));

  return json({ ok: true, users });
}
