// Paystack webhook. Checks x-paystack-signature (HMAC-SHA512 of the raw body with the secret key),
// logs every delivery, and settles charge.success by asking Paystack's verify API, so a forged or
// repeated event can't mark anything paid twice. Deploy with --no-verify-jwt.
import { admin, secretKey, settle } from '../_shared/paystack.ts';

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST.', { status: 405 });
  const raw = await req.text();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretKey()), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  if (!sameText(expected, (req.headers.get('x-paystack-signature') ?? '').toLowerCase())) {
    return new Response('Bad signature.', { status: 401 });
  }

  const body = JSON.parse(raw) as { event?: string; data?: { reference?: string } };
  const event = body.event ?? 'unknown';
  const reference = body.data?.reference ?? null;
  try {
    if (event === 'charge.success' && reference) await settle(reference, { name: event, payload: body });
    else {
      const { error } = await admin().rpc('paystack_record', { p_reference: reference ?? '', p_status: 'pending', p_event: event, p_payload: body });
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    // A non-2xx makes Paystack retry later, which is safe: settling is idempotent.
    return new Response(e instanceof Error ? e.message : 'Failed', { status: 500 });
  }
  return new Response('ok');
});
