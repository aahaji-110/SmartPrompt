import { ensureSchema } from '../../_lib/db.js';
import { getGeo, getSecret, json, makeCookie, signToken, verifyPassword } from '../../_lib/crypto.js';

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

  if (!email || !password) {
    return json({ error: 'أدخل الإيميل وكلمة المرور.' }, 400);
  }

  const user = await env.DB.prepare(
    'SELECT id, email, name, password_hash, plan, usage_count FROM users WHERE email = ?'
  )
    .bind(email)
    .first();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: 'الإيميل أو كلمة المرور غير صحيحة.' }, 401);
  }

  const { city, country } = getGeo(request);
  await env.DB.prepare(
    `UPDATE users SET last_login = datetime('now'), city = ?, country = ? WHERE id = ?`
  )
    .bind(city, country, user.id)
    .run();

  const token = await signToken({ uid: user.id, email: user.email, role: 'user' }, getSecret(env));

  return json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name || '',
        plan: user.plan || 'free',
        usage_count: Number(user.usage_count) || 0
      }
    },
    200,
    { 'Set-Cookie': makeCookie('sp_user', token, 60 * 60 * 24 * 30, request) }
  );
}
