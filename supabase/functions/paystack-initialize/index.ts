// POST { paymentId, returnUrl } with the tenant's session → { reference, authorizationUrl }.
// The amount comes from the charge in the database (paystack_begin), never from the request.
import { admin, allowedReturnUrl, caller, cors, json, paystack } from '../_shared/paystack.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    const user = await caller(req);
    if (!user) return json({ error: 'Sign in again to pay.' }, 401);
    const { paymentId, returnUrl } = await req.json().catch(() => ({}));
    if (typeof paymentId !== 'string' || !paymentId) return json({ error: 'Choose a payment.' }, 400);
    if (!allowedReturnUrl(returnUrl)) return json({ error: 'This app address is not allowed to take payments.' }, 400);

    const db = admin();
    const { data: begun, error } = await db.rpc('paystack_begin', { p_user: user.id, p_payment_id: paymentId, p_return_url: returnUrl });
    if (error) return json({ error: error.message }, 400);
    const { reference, amount, currency, email, tenant_id } = begun as { reference: string; amount: number; currency: string; email: string; tenant_id: string };

    // Paystack sends the customer to paystack-return, which records the result and then opens the app.
    const back = `${Deno.env.get('SUPABASE_URL')}/functions/v1/paystack-return?reference=${encodeURIComponent(reference)}`;
    try {
      const init = await paystack<{ authorization_url: string }>('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
          email, amount: amount * 100, currency, reference, callback_url: back,
          metadata: { payment_id: paymentId, tenant_id, cancel_action: back },
        }),
      });
      return json({ reference, authorizationUrl: init.authorization_url });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.rpc('paystack_record', { p_reference: reference, p_status: 'failed', p_data: { gateway_response: message } });
      return json({ error: `Paystack couldn’t start the payment: ${message}` }, 502);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
