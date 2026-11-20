import { ensureSchema, getSubSettings, incrementStat, resolveEffectivePlan, todayUtc } from '../_lib/db.js';
import { getSecret, json, parseCookies, verifyToken } from '../_lib/crypto.js';
import { buildGeminiPrompt, CATEGORIES, fallbackGenerate } from '../_lib/prompts.js';

async function callGemini(apiKey, promptText, imageBase64, imageMime) {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  const parts = [{ text: promptText }];
  if (imageBase64 && imageMime) {
    parts.push({ inlineData: { mimeType: imageMime, data: imageBase64 } });
  }

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024
        }
      })
    });

    if (!res.ok) {
      if (res.status === 404) continue;
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${errText.slice(0, 160)}`);
    }

    const data = await res.json();
    const out =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts
        ? data.candidates[0].content.parts
            .map((p) => p.text || '')
            .join('')
            .trim()
        : '';

    if (out) {
      return out.replace(/^```[\w-]*\n?/i, '').replace(/\n?```$/i, '').trim();
    }
  }
  throw new Error('Empty Gemini response');
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return json({ error: 'قاعدة البيانات غير مربوطة بعد في إعدادات الاستضافة.' }, 503);
  }
  await ensureSchema(env.DB);

  const cookies = parseCookies(request);
  const session = await verifyToken(cookies.sp_user, getSecret(env));
  if (!session || !session.uid) {
    return json(
      { error: 'سجّل دخولك بإيميلك أولاً عشان تقدر تولّد برومتات.', code: 'auth_required' },
      401
    );
  }

  const user = await env.DB.prepare(
    'SELECT id, email, name, plan, plan_expires_at, status, custom_daily_limit, usage_count FROM users WHERE id = ?'
  )
    .bind(session.uid)
    .first();

  if (!user) {
    return json({ error: 'انتهت الجلسة، سجّل دخولك مرة ثانية.', code: 'auth_required' }, 401);
  }
  if (user.status === 'suspended') {
    return json({ error: 'تم إيقاف حسابك مؤقتاً، تواصل مع إدارة الموقع.' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'طلب غير صالح.' }, 400);
  }

  const idea = String(body.idea || '').trim();
  if (!idea) return json({ error: 'اكتب فكرتك أولاً.' }, 400);
  if (idea.length > 4000) return json({ error: 'النص طويل جداً، اختصره قليلاً.' }, 400);

  const catIndex = Math.max(0, Math.min(CATEGORIES.length - 1, Number(body.catIndex) || 0));
  const mode = Number(body.mode) === 1 ? 1 : 0;
  const settings = Array.isArray(body.settings) ? body.settings.slice(0, 6) : [];
  const imageBase64 = typeof body.imageBase64 === 'string' && body.imageBase64.length < 6_000_000 ? body.imageBase64 : '';
  const imageMime = typeof body.imageMime === 'string' && /^image\/(png|jpeg|jpg|webp|gif)$/i.test(body.imageMime) ? body.imageMime : '';

  const sub = await getSubSettings(env.DB);
  const effectivePlan = resolveEffectivePlan(user);
  const today = todayUtc();

  let dailyLimit = 0;
  if (user.custom_daily_limit !== null && user.custom_daily_limit !== undefined) {
    dailyLimit = Number(user.custom_daily_limit);
  } else if (sub.paid_mode) {
    dailyLimit = effectivePlan === 'pro' ? Number(sub.pro_daily_limit || 0) : Number(sub.free_daily_limit || 0);
  }

  if (sub.paid_mode && effectivePlan === 'free' && !sub.free_allow_images && imageBase64) {
    return json(
      {
        error: 'ميزة رفع الصور متاحة لمشتركي الباقة الاحترافية فقط.',
        code: 'limit_reached',
        upgrade_price: sub.upgrade_price,
        upgrade_link: sub.upgrade_link
      },
      402
    );
  }

  if (dailyLimit > 0 || (sub.paid_mode && effectivePlan === 'free' && sub.free_daily_limit === 0 && user.custom_daily_limit === null)) {
    const todayRow = await env.DB.prepare(
      `SELECT count FROM user_daily_usage WHERE user_id = ? AND day = ?`
    )
      .bind(user.id, today)
      .first();
    const todayUsed = Number(todayRow && todayRow.count) || 0;
    if (todayUsed >= dailyLimit) {
      return json(
        {
          error:
            dailyLimit === 0
              ? 'هذه الخدمة متاحة للمشتركين في الباقة الاحترافية فقط.'
              : `وصلت للحد اليومي (${dailyLimit} برومتات) في باقتك الحالية. قم بالترقية للاستخدام غير المحدود!`,
          code: 'limit_reached',
          upgrade_price: sub.upgrade_price,
          upgrade_link: sub.upgrade_link
        },
        402
      );
    }
  }

  const cat = CATEGORIES[catIndex];
  let result = '';
  let engine = 'template';

  let geminiKey = env.GEMINI_API_KEY || '';
  if (!geminiKey) {
    const kRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'gemini_api_key'`).first();
    if (kRow && kRow.value) geminiKey = kRow.value;
  }

  if (geminiKey) {
    try {
      const promptText = buildGeminiPrompt({
        catIndex,
        idea,
        mode,
        settings,
        hasImage: Boolean(imageBase64 && imageMime)
      });
      result = await callGemini(geminiKey, promptText, imageBase64, imageMime);
      engine = 'ai';
    } catch {
      result = await fallbackGenerate({ catIndex, idea, mode, settings });
      engine = 'template';
    }
  } else {
    result = await fallbackGenerate({ catIndex, idea, mode, settings });
    engine = 'template';
  }

  // Lightweight stats-only recording (no prompt text, no location stored!)
  await Promise.all([
    env.DB.prepare(
      `INSERT INTO user_category_stats (user_id, category_key, category_name, count, updated_at)
       VALUES (?, ?, ?, 1, datetime('now'))
       ON CONFLICT(user_id, category_key) DO UPDATE SET
         count = count + 1,
         category_name = excluded.category_name,
         updated_at = datetime('now')`
    )
      .bind(user.id, cat.key, cat.n)
      .run(),
    env.DB.prepare(
      `INSERT INTO user_daily_usage (user_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1`
    )
      .bind(user.id, today)
      .run(),
    env.DB.prepare('UPDATE users SET usage_count = usage_count + 1 WHERE id = ?')
      .bind(user.id)
      .run(),
    incrementStat(env.DB, 'gen', 1),
    incrementStat(env.DB, `gen-${cat.key}`, 1)
  ]);

  return json({
    prompt: result,
    engine,
    usage_count: (Number(user.usage_count) || 0) + 1
  });
}
