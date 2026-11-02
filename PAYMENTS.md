# Online payments (Paystack)

Tenants pay rent, service charge and deposits from **My lease** in the app. Accountants, managers and super admins follow them in **Payments**. Paystack runs in **test mode** until the owner approves live payments.

## How it works

- A **charge** (`public.payments`) is what a tenant owes or has paid. A **Paystack attempt** (`public.paystack_transactions`) is one try at paying a charge. Each has its own status:
  - charge: due / overdue / paid
  - attempt: waiting / successful / failed / not completed (abandoned) / refunded
- The server takes the amount from the charge. The app never sends an amount.
- A charge becomes **paid only after Paystack confirms**: the return page and the webhook both ask Paystack's verify API before recording anything. Recording is idempotent on the reference, so a repeated webhook changes nothing.
- If a tenant pays a charge that is already paid (for example, cash was recorded at the same time), the money is kept as a successful attempt. Staff get a "Paid twice: refund needed" notice, and the attempt shows under **Payments → Needs checking**.
- Money settles straight into the organisation's Paystack account. Refunds and vendor payouts are made by hand (in the Paystack dashboard or by bank transfer) for the MVP. Caution deposits are held by the organisation; they are **not** in escrow.
- Managers can still record cash or bank payments by hand. Nobody signed in to the app can mark a charge as paid by Paystack, or change or delete one Paystack paid.

Flow: **Pay ₦…** → `paystack-initialize` (checks the session and the charge, starts a Paystack checkout) → Paystack checkout (full-page redirect on the web, in-app browser on phones) → `paystack-return` (verifies, records, sends the tenant back to the app) → the app shows the result and the receipt. `paystack-webhook` records the same result even if the tenant closes the browser early.

## Set up (owner, once)

1. **Apply the database migration.** Apply all earlier migrations first (see the build plan), then run `supabase/migrations/20261027000000_paystack_payments.sql` in the Supabase SQL editor.
2. **Set the function secrets.** Project Settings → Edge Functions → Secrets, or with the CLI:
   ```bash
   npx supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxx
   npx supabase secrets set PAYSTACK_RETURN_URLS=https://<your-web-domain>/
   ```
   - Use the **test** secret key from the Paystack dashboard (Settings → API Keys & Webhooks). The functions refuse a live key unless `PAYSTACK_ALLOW_LIVE=true` is also set; only set that after approving live payments.
   - `PAYSTACK_RETURN_URLS` lists the addresses the app may return to after checkout. `propertyhub://`, `exp://` (Expo Go) and `http://localhost:8081/` are always allowed.
   - Never put the secret key in `.env.local` with an `EXPO_PUBLIC_` prefix, or anywhere in the app.
3. **Deploy the functions.** None of them use Supabase's built-in JWT check: `paystack-return` and `paystack-webhook` are called by Paystack, and the other two check the session themselves.
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase functions deploy paystack-initialize --no-verify-jwt
   npx supabase functions deploy paystack-verify --no-verify-jwt
   npx supabase functions deploy paystack-return --no-verify-jwt
   npx supabase functions deploy paystack-webhook --no-verify-jwt
   ```
4. **Point Paystack's webhook at the function.** Paystack dashboard → Settings → API Keys & Webhooks → Test Webhook URL:
   `https://<project-ref>.supabase.co/functions/v1/paystack-webhook`
5. **Check it.** `node --env-file=.env.local scripts/verify-payments.mjs` should pass all 8 checks.

## Try a payment (test mode)

1. As a manager, make sure the tenant has a due charge, or use a seeded overdue one (Zainab Bello, Adamu Garba and others have arrears; the demo tenant login is Chidinma Okafor).
2. Sign in as the tenant → **My lease** → **To pay** → **Pay ₦…**.
3. On the Paystack test checkout, use a test card from Paystack's docs (Payments → Test payments). Try a successful card, a declined card, and closing the checkout without paying.
4. Back in the app: success shows "Payment received" and a **Receipt** in Payment history. A declined card shows "Payment failed". Closing checkout shows "Payment not completed". The charge stays due in both cases.
5. As the accountant → **Payments**: the charge is "Paid online", the attempt is under **Paystack payments** with the fee and channel, and **Export CSV** downloads the ledger.
6. To check idempotency, resend the webhook from the Paystack dashboard (Transactions → the payment → Resend webhook): totals don't change.

## Tests

- `npm run db:test`: applies every migration to an in-memory Postgres and runs `scripts/db-tests/payments.mjs` (13 scenarios: amounts, idempotency, mismatches, paid twice, rate limit, RLS, the guard on hand-recorded charges). Needs no Supabase project.
- `scripts/verify-payments.mjs`: the same rules plus the deployed functions, against the real project.
