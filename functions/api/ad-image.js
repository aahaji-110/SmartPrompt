import { ensureSchema } from '../_lib/db.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return new Response('Not found', { status: 404 });
  await ensureSchema(env.DB);

  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'ad_image_data'`).first();
  if (!row || !row.value) return new Response('Not found', { status: 404 });

  try {
    const { mime, data } = JSON.parse(row.value);
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': mime || 'image/png',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch {
    return new Response('Invalid image data', { status: 500 });
  }
}
