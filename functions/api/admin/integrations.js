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

  if (typeof body.googleClientId === 'string') {
    const cid = body.googleClientId.trim();
    if (cid && !/^[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com$/i.test(cid)) {
      return json(
        {
          error:
            'معرّف Google Client ID غير صحيح (يجب أن ينتهي بـ .apps.googleusercontent.com). اتركه فارغاً إذا كنت تريد فقط تفعيل مفتاح Gemini.'
        },
        400
      );
    }
    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('google_client_id', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
      .bind(cid)
      .run();
  }

  if (typeof body.geminiApiKey === 'string' && body.geminiApiKey.trim() !== '') {
    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('gemini_api_key', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
      .bind(body.geminiApiKey.trim())
      .run();
  }

  return json({ ok: true });
}
