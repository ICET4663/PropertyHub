// POST { reference } with a session → { status }. Asks Paystack again and records the answer.
// Anyone who can see the attempt (RLS: the tenant, their managers, accountants, super admins) may check it.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { caller, cors, json, settle } from '../_shared/paystack.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    const user = await caller(req);
    if (!user) return json({ error: 'Sign in again.' }, 401);
    const { reference } = await req.json().catch(() => ({}));
    if (typeof reference !== 'string' || !reference) return json({ error: 'Missing payment reference.' }, 400);

    const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>)[0];
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${user.jwt}` } },
    });
    const { data: tx } = await asUser.from('paystack_transactions').select('reference').eq('reference', reference).maybeSingle();
    if (!tx) return json({ error: 'Payment not found.' }, 404);
    return json({ status: await settle(reference) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
