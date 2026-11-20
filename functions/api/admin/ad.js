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

  let imgUrl = String(body.img || '').trim();

  // Optional direct banner image upload (compressed base64 <= ~750KB)
  if (body.uploadBase64 && body.uploadMime) {
    if (body.uploadBase64.length > 900_000) {
      return json({ error: 'حجم صورة البنر كبير جداً بعد الضغط، اختر صورة أصغر.' }, 400);
    }
    const imgPayload = JSON.stringify({
      mime: String(body.uploadMime),
      data: String(body.uploadBase64)
    });
    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('ad_image_data', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
      .bind(imgPayload)
      .run();
    imgUrl = `/api/ad-image?v=${Date.now()}`;
  }

  const adConfig = {
    on: Boolean(body.on),
    type: ['image', 'text', 'code'].includes(body.type) ? body.type : 'image',
    img: imgUrl,
    link: String(body.link || '').trim(),
    text: String(body.text || '').trim(),
    code: String(body.code || '').trim()
  };

  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('ad_config', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  )
    .bind(JSON.stringify(adConfig))
    .run();

  return json({ ok: true, ad: adConfig });
}
