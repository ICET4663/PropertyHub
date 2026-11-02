/**
 * Paying a charge through Paystack checkout (stage 6). The server decides the amount and records the
 * result (supabase/functions/paystack-*); the app only opens checkout and asks for the outcome.
 *
 * Web: the page goes to Paystack and comes back to /myLease?reference=... .
 * Phones: checkout opens in an in-app browser, which closes when Paystack returns to the app's own
 * address (propertyhub://myLease, or exp:// in Expo Go).
 */
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { PaystackStatus } from '../types';
import { supabase } from './supabase';

async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return data as T;
  const res = (error as { context?: Response }).context;
  let message: string | undefined;
  try {
    message = ((await res?.json()) as { error?: string } | undefined)?.error;
  } catch {
    // not our JSON: fall through
  }
  if (message) throw new Error(message);
  if (res?.status === 404) throw new Error('Online payments aren’t set up on the server yet.');
  // No response at all: offline, or (on the web) a function that isn't deployed, which fails the CORS check.
  if (!res || /failed to send|fetch|network/i.test(error.message)) {
    throw new Error('Can’t reach the payment service. Check your connection and try again. If it keeps happening, online payments may not be set up yet.');
  }
  throw new Error(error.message);
}

/** Where Paystack should send the payer back to. */
function returnUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/myLease`;
  return Linking.createURL('myLease');
}

/**
 * Opens Paystack checkout for one charge. On the web the page leaves for Paystack and this never
 * resolves usefully (returns null). On phones it resolves with the reference once checkout closes,
 * whether or not the tenant paid: ask checkPayment() what happened.
 */
export async function openCheckout(paymentId: string): Promise<string | null> {
  const back = returnUrl();
  const { reference, authorizationUrl } = await call<{ reference: string; authorizationUrl: string }>('paystack-initialize', { paymentId, returnUrl: back });
  if (Platform.OS === 'web') {
    window.location.assign(authorizationUrl);
    return null;
  }
  await WebBrowser.openAuthSessionAsync(authorizationUrl, back);
  return reference;
}

/** Asks the server to confirm an attempt with Paystack. */
export async function checkPayment(reference: string): Promise<PaystackStatus> {
  return (await call<{ status: PaystackStatus }>('paystack-verify', { reference })).status;
}
