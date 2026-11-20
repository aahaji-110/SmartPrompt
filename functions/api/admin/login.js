import { ensureSchema } from '../../_lib/db.js';
import { getSecret, json, makeCookie, signToken, verifyPassword } from '../../_lib/crypto.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'بيانات غير صالحة.' }, 400);
  }

  const password = String(body.password || '');
  if (!password) {
    return json({ error: 'أدخل كلمة مرور الأدمن.' }, 400);
  }

  let valid = false;
  let customHash = null;

  if (env.DB) {
    await ensureSchema(env.DB);
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'admin_password_hash'`).first();
    if (row && row.value) customHash = row.value;
  }

  if (customHash) {
    valid = await verifyPassword(password, customHash);
  } else if (env.ADMIN_PASSWORD) {
    valid = password === env.ADMIN_PASSWORD;
  } else {
    return json(
      { error: 'لم يتم تعيين كلمة مرور الأدمن (ADMIN_PASSWORD) في إعدادات Cloudflare Pages.' },
      503
    );
  }

  if (!valid) {
    return json({ error: 'كلمة مرور الأدمن غير صحيحة.' }, 401);
  }

  const token = await signToken({ role: 'admin' }, getSecret(env), 60 * 60 * 24 * 7);
  return json(
    { ok: true },
    200,
    { 'Set-Cookie': makeCookie('sp_admin', token, 60 * 60 * 24 * 7, request) }
  );
}
