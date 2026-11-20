import { ensureSchema } from '../../_lib/db.js';
import { getSecret, hashPassword, json, parseCookies, verifyPassword, verifyToken } from '../../_lib/crypto.js';

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

  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');

  if (!currentPassword || !newPassword) {
    return json({ error: 'أدخل كلمة المرور الحالية والجديدة.' }, 400);
  }
  if (newPassword.length < 6) {
    return json({ error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.' }, 400);
  }

  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'admin_password_hash'`).first();
  let currentValid = false;
  if (row && row.value) {
    currentValid = await verifyPassword(currentPassword, row.value);
  } else if (env.ADMIN_PASSWORD) {
    currentValid = currentPassword === env.ADMIN_PASSWORD;
  }

  if (!currentValid) {
    return json({ error: 'كلمة المرور الحالية غير صحيحة.' }, 401);
  }

  const newHash = await hashPassword(newPassword);
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('admin_password_hash', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  )
    .bind(newHash)
    .run();

  return json({ ok: true });
}
