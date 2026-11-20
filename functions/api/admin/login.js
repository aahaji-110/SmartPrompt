import { getSecret, json, makeCookie, signToken } from '../../_lib/crypto.js';

export async function onRequestPost({ request, env }) {
  const adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return json(
      { error: 'لم يتم تعيين كلمة مرور الأدمن (ADMIN_PASSWORD) في إعدادات Cloudflare Pages.' },
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'بيانات غير صالحة.' }, 400);
  }

  const password = String(body.password || '');
  if (!password || password !== adminPassword) {
    return json({ error: 'كلمة مرور الأدمن غير صحيحة.' }, 401);
  }

  const token = await signToken({ role: 'admin' }, getSecret(env), 60 * 60 * 24 * 7);
  return json(
    { ok: true },
    200,
    { 'Set-Cookie': makeCookie('sp_admin', token, 60 * 60 * 24 * 7, request) }
  );
}
