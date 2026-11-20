import { ensureSchema } from '../../_lib/db.js';
import { getGeo, getSecret, json, makeCookie, signToken } from '../../_lib/crypto.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return json({ error: 'قاعدة البيانات غير مربوطة بعد.' }, 503);
  }
  await ensureSchema(env.DB);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'بيانات غير صالحة.' }, 400);
  }

  const credential = String(body.credential || '').trim();
  const accessToken = String(body.access_token || '').trim();

  if (!credential && !accessToken) {
    return json({ error: 'لم يتم استلام رمز الدخول من Google.' }, 400);
  }

  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'google_client_id'`).first();
  const configuredClientId = ((row && row.value) || env.GOOGLE_CLIENT_ID || '').trim();

  let email = '';
  let name = '';

  if (credential) {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    if (!res.ok) {
      return json({ error: 'فشل التحقق من حساب Google، حاول مرة أخرى.' }, 401);
    }
    const info = await res.json();
    if (configuredClientId && info.aud !== configuredClientId) {
      return json({ error: 'معرّف Google Client ID غير مطابق.' }, 401);
    }
    if (info.email_verified !== 'true' && info.email_verified !== true) {
      return json({ error: 'حساب Google غير مؤكد.' }, 401);
    }
    email = String(info.email || '').trim().toLowerCase();
    name = String(info.name || info.given_name || '').trim().slice(0, 80);
  } else if (accessToken) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      return json({ error: 'فشل جلب بيانات حساب Google.' }, 401);
    }
    const info = await res.json();
    email = String(info.email || '').trim().toLowerCase();
    name = String(info.name || info.given_name || '').trim().slice(0, 80);
  }

  if (!email) {
    return json({ error: 'لم نتمكن من قراءة الإيميل من حساب Google.' }, 400);
  }

  let user = await env.DB.prepare(
    'SELECT id, email, name, plan, usage_count FROM users WHERE email = ?'
  )
    .bind(email)
    .first();

  if (!user) {
    const ins = await env.DB.prepare(
      `INSERT INTO users (email, name, password_hash, plan, city, country)
       VALUES (?, ?, 'google_oauth', 'free', '', '')`
    )
      .bind(email, name)
      .run();
    const userId = ins.meta && ins.meta.last_row_id;
    user = { id: userId, email, name, plan: 'free', usage_count: 0 };
  } else {
    await env.DB.prepare(
      `UPDATE users SET last_login = datetime('now'), name = COALESCE(NULLIF(name, ''), ?) WHERE id = ?`
    )
      .bind(name, user.id)
      .run();
  }

  const token = await signToken({ uid: user.id, email: user.email, role: 'user' }, getSecret(env));

  return json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name || name || '',
        plan: user.plan || 'free',
        usage_count: Number(user.usage_count) || 0
      }
    },
    200,
    { 'Set-Cookie': makeCookie('sp_user', token, 60 * 60 * 24 * 30, request) }
  );
}
