// Shared by the paystack-* Edge Functions. Secrets (supabase secrets set ...):
//   PAYSTACK_SECRET_KEY   sk_test_... (a live key is refused unless PAYSTACK_ALLOW_LIVE=true)
//   PAYSTACK_RETURN_URLS  comma-separated prefixes the app may return to after checkout, e.g.
//                         https://app.example.com/,propertyhub://  (defaults below cover local development)
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const DEFAULT_RETURN_URLS = ['propertyhub://', 'exp://', 'http://localhost:8081/'];

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export function secretKey(): string {
  const key = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not set.');
  if (!key.startsWith('sk_test_') && Deno.env.get('PAYSTACK_ALLOW_LIVE') !== 'true') {
    throw new Error('Only Paystack test keys are allowed until live payments are approved.');
  }
  return key;
}

/** Service client: bypasses RLS, so only use it after checking who is asking. */
export function admin(): SupabaseClient {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  const key = (keys ? Object.values(JSON.parse(keys) as Record<string, string>)[0] : undefined) ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('No Supabase secret key in the function environment.');
  return createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The signed-in user behind the request's Authorization header, or null. */
export async function caller(req: Request): Promise<{ id: string; jwt: string } | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await admin().auth.getUser(jwt);
  return error || !data.user ? null : { id: data.user.id, jwt };
}

/** A return URL the app may be sent back to: one of the allowed prefixes, and nothing else. */
export function allowedReturnUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 500) return false;
  const extra = (Deno.env.get('PAYSTACK_RETURN_URLS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...DEFAULT_RETURN_URLS, ...extra].some((prefix) => url.startsWith(prefix));
}

export async function paystack<T = Record<string, unknown>>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false) throw new Error(body.message ?? `Paystack returned ${res.status}`);
  return body.data as T;
}

/** Paystack's verify statuses, reduced to the ones the ledger records. Anything in flight stays pending. */
function ledgerStatus(s: string): 'success' | 'failed' | 'abandoned' | 'pending' {
  if (s === 'success') return 'success';
  if (s === 'failed' || s === 'reversed') return 'failed';
  if (s === 'abandoned') return 'abandoned';
  return 'pending';
}

/**
 * Asks Paystack for the attempt's status and records it. Never trusts a status from the browser or the
 * webhook body alone. Returns the attempt's status afterwards.
 */
export async function settle(reference: string, event?: { name: string; payload: unknown }): Promise<string> {
  const data = await paystack<Record<string, unknown>>(`/transaction/verify/${encodeURIComponent(reference)}`);
  const { data: status, error } = await admin().rpc('paystack_record', {
    p_reference: reference,
    p_status: ledgerStatus(String(data.status)),
    p_data: data,
    p_event: event?.name ?? null,
    p_payload: event?.payload ?? null,
  });
  if (error) throw new Error(error.message);
  return status as string;
}
