// Paystack's callback_url (and the checkout's cancel button). Records the result, then sends the browser
// back to the app address saved when the attempt started, with ?reference=... added.
// Deploy with --no-verify-jwt: Paystack calls this without a Supabase session.
import { admin, settle } from '../_shared/paystack.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const reference = url.searchParams.get('reference') ?? url.searchParams.get('trxref') ?? '';
  if (!reference) return new Response('Missing payment reference.', { status: 400 });

  const { data: tx } = await admin().from('paystack_transactions').select('return_url').eq('reference', reference).maybeSingle();
  if (!tx) return new Response('Unknown payment reference.', { status: 404 });
  try {
    await settle(reference);
  } catch {
    // The app checks again when it opens, and the webhook settles it in any case.
  }
  const back = tx.return_url as string;
  const target = `${back}${back.includes('?') ? '&' : '?'}reference=${encodeURIComponent(reference)}`;
  return new Response(null, { status: 302, headers: { Location: target } });
});
