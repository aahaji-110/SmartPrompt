import { json, makeCookie } from '../../_lib/crypto.js';

export async function onRequestPost({ request }) {
  return json(
    { ok: true },
    200,
    { 'Set-Cookie': makeCookie('sp_admin', '', 0, request) }
  );
}
