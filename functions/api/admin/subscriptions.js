import { ensureSchema } from '../../_lib/db.js';
import { getSecret, json, parseCookies, verifyToken } from '../../_lib/crypto.js';

export async function onRequestPost({ request, env }) {
  const cookies = parseCookies(request);
  const payload = await verifyToken(cookies.sp_admin, getSecret(env));
  if (!payload || payload.role !== 'admin') {
    return json({ error: 'غير مصرح.' }, 401);
  }
  if (!env.DB) {
    return json({ error: 'قاعدة البيانات (DB) غير مربوطة.' }, 503);
  }
  await ensureSchema(env.DB);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'بيانات غير صالحة.' }, 400);
  }

  const subSettings = {
    paid_mode: Boolean(body.paid_mode),
    free_daily_limit: Math.max(0, Math.min(1000, Number(body.free_daily_limit) || 0)),
    pro_daily_limit: Math.max(0, Math.min(10000, Number(body.pro_daily_limit) || 0)),
    free_allow_images: Boolean(body.free_allow_images),
    upgrade_price: String(body.upgrade_price || '29 ريال / شهرياً').trim().slice(0, 80),
    upgrade_link: String(body.upgrade_link || '').trim().slice(0, 300)
  };

  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('sub_settings', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  )
    .bind(JSON.stringify(subSettings))
    .run();

  return json({ ok: true, sub_settings: subSettings });
}
