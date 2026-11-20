import { ensureSchema } from '../../_lib/db.js';
import { getGeo, getSecret, hashPassword, json, makeCookie, signToken } from '../../_lib/crypto.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return json({ error: 'قاعدة البيانات غير مربوطة بعد في إعدادات Cloudflare Pages (DB).' }, 503);
  }
  await ensureSchema(env.DB);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'بيانات غير صالحة.' }, 400);
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim().slice(0, 80);

  if (!EMAIL_RE.test(email)) {
    return json({ error: 'أدخل بريد إلكتروني صحيح.' }, 400);
  }
  if (password.length < 6) {
    return json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return json({ error: 'هذا الإيميل مسجّل مسبقاً، جرّب تسجيل الدخول.' }, 409);
  }

  const passwordHash = await hashPassword(password);

  const res = await env.DB.prepare(
    `INSERT INTO users (email, name, password_hash, plan, city, country)
     VALUES (?, ?, ?, 'free', '', '')`
  )
    .bind(email, name, passwordHash)
    .run();

  const userId = res.meta && res.meta.last_row_id;
  const token = await signToken({ uid: userId, email, role: 'user' }, getSecret(env));

  return json(
    {
      user: { id: userId, email, name, plan: 'free', usage_count: 0 }
    },
    201,
    { 'Set-Cookie': makeCookie('sp_user', token, 60 * 60 * 24 * 30, request) }
  );
}
