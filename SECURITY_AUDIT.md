# Security audit: 2026-10-28 (stage 10)

Scope: the live Supabase project (schema, row level security, storage, Auth settings), the app bundles, the Paystack Edge Functions and the repository. Every finding below was reproduced with an automated check before it was fixed.

**Result:** the core isolation the build plan asks for already held. Tenant A can't reach tenant B's records or files, a manager can't see or change another manager's properties, a caretaker can't work someone else's job, and an accountant can't write leases or charges. The audit found **one high, five medium and four low** issues. All ten are fixed in `supabase/migrations/20261028000000_security_hardening.sql`, which is **not yet applied to the live project**.

## How it was checked

| Check | Where | Result |
|---|---|---|
| RLS rules for every role, run against all 9 migrations in a throwaway Postgres | `npm run db:test` → `scripts/db-tests/security.mjs` (22 checks) + `payments.mjs` (13) | 35/35 pass with the fix; 11 security checks fail without it |
| Same holes on the live project | `scripts/verify-security.mjs` (4 checks) | 4/4 fail today, which confirms the issues are live. Rerun after applying the migration |
| Secrets in the web and Android bundles | Searched the exported bundles for `sb_secret_`, `sk_test_`/`sk_live_`, `service_role` and JWTs | None. Only the publishable key, which is meant to be public |
| Secrets in git | `.env.local` is ignored, `.env.example` holds placeholders, history searched | None |
| Auth settings (public endpoint) | `/auth/v1/settings` | Email confirmation **on** (needed: tenancies are linked by verified email), sign-up open (intended for tenants), email provider only |
| Edge Functions | Code review of `supabase/functions/paystack-*` | No issues (see below) |

## Findings

| # | Severity | Finding | Fix |
|---|---|---|---|
| S1 | **High** | Any signed-in account, including a brand-new self-sign-up with no tenancy, could post any text and link to the staff notification feed. Since stage 9, every post is pushed to managers' and admins' phones, so an outsider could send phishing pushes to staff. | Only staff and tenants with a tenancy may post to the staff feed. The server stamps who posted it and when. Tenants are limited to 20 staff posts an hour. |
| S2 | Medium | "Mark as read" allowed changing every column of a notification, so a tenant could reword their own notices (for example, fake a "Payment received"). Any staff member could also edit the shared staff feed. | Only `read` can change. |
| S3 | Medium | Caretakers could open tenants' ID and KYC files, list tenant document records, and read every charge and Paystack payment in their properties. | Caretakers see property papers only, and no charges or payments. Managers, accountants and admins are unchanged. |
| S4 | Medium | Every staff account could read the name, email and phone of **every** account, including tenants of properties they don't work on. | Staff still see all staff accounts, but only see tenant accounts for tenancies they can already see. Admins and accountants see all accounts. |
| S5 | Medium | Every manager could read and edit every onboarding draft. Drafts hold an applicant's ID number, contacts and next of kin. | Drafts are visible to admins, the manager who started them, and the managers of the property they allocate. |
| S10 | Medium | Deactivating a tenant tried to suspend their login with a profile update only admins may make. For managers it silently did nothing, so a moved-out tenant kept reading their old lease, charges and documents, and could still upload files and post to staff. | The database suspends the tenant's login itself when the tenancy ends, and restores it if the tenant is reactivated. |
| S6 | Low | Any manager could post, edit or delete announcements for properties they don't manage. | Managers post for their own properties or for everyone. Edits and deletes are limited to the author, the property's managers and admins. |
| S7 | Low | Activity-log entries could be back-dated or filed under someone else's name. | The server sets the actor, name and time. |
| S8 | Low | Anyone who could see a request (the tenant included) could upload into its `completion/` folder. That folder is what lets a caretaker mark a job fixed. | Completion photos are staff-only. Tenants still add photos to the request itself. |
| S9 | Low | A tenant could file a document record under any property. | Tenants can only file documents under their own home. |

## No change needed

- **Paystack functions:** a secret test key is required and live keys are refused unless `PAYSTACK_ALLOW_LIVE=true`. The secret key stays in function secrets. `paystack-initialize` checks the session, takes the amount from the database and only returns to allow-listed app addresses. `paystack-verify` only answers for payments the caller can see. `paystack-webhook` checks the HMAC-SHA512 signature with a constant-time compare and still confirms with Paystack before recording. Recording is idempotent, and attempts are capped at 5 per charge per 10 minutes.
- **Storage:** both buckets are private, files open through 10-minute signed URLs, and size and file-type limits are set (20 MB documents, 10 MB photos).
- **Server functions:** the workflow, payment and tenant-linking functions are `security definer` with `search_path = ''`, check the caller's role themselves, and are not callable without signing in. `register_tenant()` only links a tenancy to a **confirmed** email.
- **Signed-out access:** the publishable key reads nothing without a session.

## Owner actions

1. **Apply `20261028000000_security_hardening.sql`** in the SQL editor, then run `node --env-file=.env.local scripts/verify-security.mjs` (expect 4/4) and the other `verify-*.mjs` scripts.
2. **Auth rate limits and passwords** (Dashboard → Authentication): these aren't readable without a management token, so check them by hand. Keep the default rate limits on, and set a minimum password length of 8 to match the app.
3. **Never add `private` to the API's exposed schemas** (Project Settings → API). The helper functions there are only safe because the API can't reach them.
4. **Keep the secret key off shared machines.** `.env.local` holds it for the seed and verify scripts only.

## Not covered

- Penetration testing of the deployed web domain (not deployed yet, stage 12).
- Phone-side storage. The tenant/caretaker offline copy is in AsyncStorage, which isn't encrypted. It holds the same data the account can see and is deleted on sign-out. Sessions are in SecureStore.
- Supabase's own platform settings beyond the public Auth endpoint (backups, network restrictions, MFA for dashboard users).
