import { ensureSchema } from '../../_lib/db.js';
import { getSecret, json, parseCookies, verifyToken } from '../../_lib/crypto.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ user: null, db_ready: false, google_client_id: env.GOOGLE_CLIENT_ID || '' });
  await ensureSchema(env.DB);

  const gRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'google_client_id'`).first();
  const googleClientId = ((gRow && gRow.value) || env.GOOGLE_CLIENT_ID || '').trim();

  const cookies = parseCookies(request);
  const payload = await verifyToken(cookies.sp_user, getSecret(env));
  if (!payload || !payload.uid) {
    return json({ user: null, db_ready: true, google_client_id: googleClientId });
  }

  const user = await env.DB.prepare(
    'SELECT id, email, name, plan, usage_count FROM users WHERE id = ?'
  )
    .bind(payload.uid)
    .first();

  if (!user) return json({ user: null, db_ready: true, google_client_id: googleClientId });
  return json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name || '',
      plan: user.plan || 'free',
      usage_count: Number(user.usage_count) || 0
    },
    db_ready: true,
    google_client_id: googleClientId
  });
}
