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

  const id = Number(body.id);
  if (!id) return json({ error: 'معرّف المستخدم غير صالح.' }, 400);

  if (body.action === 'delete') {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return json({ ok: true, deleted: true });
  }

  const plan = body.plan === 'pro' ? 'pro' : 'free';
  const status = body.status === 'suspended' ? 'suspended' : 'active';
  const planExpiresAt = String(body.plan_expires_at || '').trim().slice(0, 20);
  const notes = String(body.notes || '').trim().slice(0, 200);
  const rawLimit = body.custom_daily_limit;
  const customLimit =
    rawLimit === '' || rawLimit === null || rawLimit === undefined
      ? null
      : Math.max(0, Math.min(10000, Number(rawLimit) || 0));

  await env.DB.prepare(
    `UPDATE users
     SET plan = ?, plan_expires_at = ?, status = ?, custom_daily_limit = ?, notes = ?
     WHERE id = ?`
  )
    .bind(plan, planExpiresAt, status, customLimit, notes, id)
    .run();

  return json({ ok: true });
}
