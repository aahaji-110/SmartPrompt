import { ensureSchema, getSubSettings, resolveEffectivePlan, todayUtc } from '../../_lib/db.js';
import { getSecret, json, parseCookies, verifyToken } from '../../_lib/crypto.js';

function isValidGoogleClientId(v) {
  return typeof v === 'string' && /^[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com$/i.test(v.trim());
}

export async function onRequestGet({ request, env }) {
  const cookies = parseCookies(request);
  const secret = getSecret(env);
  const adminPayload = await verifyToken(cookies.sp_admin, secret);
  const isAdmin = Boolean(adminPayload && adminPayload.role === 'admin');

  if (!env.DB) {
    const cid = isValidGoogleClientId(env.GOOGLE_CLIENT_ID) ? env.GOOGLE_CLIENT_ID.trim() : '';
    return json({ user: null, is_admin: isAdmin, db_ready: false, google_client_id: cid });
  }
  await ensureSchema(env.DB);

  const [gRow, sub] = await Promise.all([
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'google_client_id'`).first(),
    getSubSettings(env.DB)
  ]);

  const rawCid = ((gRow && gRow.value) || env.GOOGLE_CLIENT_ID || '').trim();
  const googleClientId = isValidGoogleClientId(rawCid) ? rawCid : '';

  const payload = await verifyToken(cookies.sp_user, secret);
  if (!payload || !payload.uid) {
    return json({
      user: null,
      is_admin: isAdmin,
      db_ready: true,
      google_client_id: googleClientId,
      sub: { paid_mode: sub.paid_mode, upgrade_price: sub.upgrade_price, upgrade_link: sub.upgrade_link }
    });
  }

  const user = await env.DB.prepare(
    'SELECT id, email, name, plan, plan_expires_at, status, custom_daily_limit, usage_count FROM users WHERE id = ?'
  )
    .bind(payload.uid)
    .first();

  if (!user) {
    return json({
      user: null,
      is_admin: isAdmin,
      db_ready: true,
      google_client_id: googleClientId,
      sub: { paid_mode: sub.paid_mode, upgrade_price: sub.upgrade_price, upgrade_link: sub.upgrade_link }
    });
  }

  const todayRow = await env.DB.prepare(
    `SELECT count FROM user_daily_usage WHERE user_id = ? AND day = ?`
  )
    .bind(user.id, todayUtc())
    .first();
  const todayUsed = Number(todayRow && todayRow.count) || 0;
  const effectivePlan = resolveEffectivePlan(user);

  let dailyLimit = 0;
  if (user.custom_daily_limit !== null && user.custom_daily_limit !== undefined) {
    dailyLimit = Number(user.custom_daily_limit);
  } else if (sub.paid_mode) {
    dailyLimit = effectivePlan === 'pro' ? Number(sub.pro_daily_limit || 0) : Number(sub.free_daily_limit || 0);
  }

  return json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name || '',
      plan: effectivePlan,
      plan_expires_at: user.plan_expires_at || '',
      status: user.status || 'active',
      usage_count: Number(user.usage_count) || 0,
      today_used: todayUsed,
      daily_limit: dailyLimit
    },
    is_admin: isAdmin,
    db_ready: true,
    google_client_id: googleClientId,
    sub: {
      paid_mode: sub.paid_mode,
      free_allow_images: sub.free_allow_images,
      upgrade_price: sub.upgrade_price,
      upgrade_link: sub.upgrade_link
    }
  });
}
