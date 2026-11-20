import { ensureSchema, incrementStat } from '../_lib/db.js';
import { getGeo, getSecret, json, parseCookies, verifyToken } from '../_lib/crypto.js';
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
    'SELECT id, email, name, plan, usage_count FROM users WHERE id = ?'
  )
    .bind(session.uid)
    .first();

  if (!user) {
    return json({ error: 'انتهت الجلسة، سجّل دخولك مرة ثانية.', code: 'auth_required' }, 401);
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

  const cat = CATEGORIES[catIndex];
  let result = '';
  let engine = 'template';

  if (env.GEMINI_API_KEY) {
    try {
      const promptText = buildGeminiPrompt({
        catIndex,
        idea,
        mode,
        settings,
        hasImage: Boolean(imageBase64 && imageMime)
      });
      result = await callGemini(env.GEMINI_API_KEY, promptText, imageBase64, imageMime);
      engine = 'ai';
    } catch {
      result = await fallbackGenerate({ catIndex, idea, mode, settings });
      engine = 'template';
    }
  } else {
    result = await fallbackGenerate({ catIndex, idea, mode, settings });
    engine = 'template';
  }

  const { city, country } = getGeo(request);

  await Promise.all([
    env.DB.prepare(
      `INSERT INTO prompts (user_id, user_email, user_name, category_key, category_name, mode, idea, result, engine, city, country)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        user.id,
        user.email,
        user.name || '',
        cat.key,
        cat.n,
        mode,
        idea,
        result,
        engine,
        city,
        country
      )
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
