import { ensureSchema, getAllStats, incrementStat } from '../_lib/db.js';
import { json } from '../_lib/crypto.js';
import { CATEGORIES } from '../_lib/prompts.js';

function formatStats(map) {
  const categories = {};
  for (const c of CATEGORIES) {
    categories[c.key] = map[`gen-${c.key}`] || 0;
  }
  return {
    visitors: map.visitors || 0,
    visits: map.visits || 0,
    gen: map.gen || 0,
    categories
  };
}

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return json({ ok: false, visitors: 0, visits: 0, gen: 0, categories: {} });
  }
  await ensureSchema(env.DB);
  const map = await getAllStats(env.DB);
  return json({ ok: true, ...formatStats(map) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return json({ ok: false, visitors: 0, visits: 0, gen: 0, categories: {} });
  }
  await ensureSchema(env.DB);

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tasks = [incrementStat(env.DB, 'visits', 1)];
  if (body.isNewVisitor) tasks.push(incrementStat(env.DB, 'visitors', 1));
  await Promise.all(tasks);

  const map = await getAllStats(env.DB);
  return json({ ok: true, ...formatStats(map) });
}
