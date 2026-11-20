import { DEFAULT_AD, ensureSchema, getAdConfig } from '../_lib/db.js';
import { json } from '../_lib/crypto.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ad: DEFAULT_AD });
  await ensureSchema(env.DB);
  const ad = await getAdConfig(env.DB);
  return json({ ad });
}
