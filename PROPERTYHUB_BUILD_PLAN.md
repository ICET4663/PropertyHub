# PropertyHub build plan

This adapts the *Tracko Landing Page and Mobile Build Guide* to PropertyHub. It keeps the same order (audit → scope → landing/web → core workflows → payments → live updates → mobile → security → acceptance → release) and swaps logistics ideas for property management ones.

Audit date: 2026-10-14, commit `8c51a3f` plus uncommitted Supabase work. Every status below comes from reading the code, not from earlier claims.

---

## 1. How Tracko maps to PropertyHub

| Tracko | PropertyHub | Notes |
|---|---|---|
| Customer | **Tenant** (`role: 'tenant'`) | Main mobile user. |
| Driver | **Caretaker** (`role: 'caretaker'`) | Field worker who carries out jobs. Vendors have records but cannot log in. |
| Dispatcher | **Manager** (`role: 'manager'`) | Assigns jobs, approves tenants, manages leases. |
| Truck owner | **Landlord / property owner**: *no role yet* | Decision D1. |
| Admin | **Super admin** (`role: 'super_admin'`) | |
| (none) | **Accountant** (`role: 'accountant'`) | Owns payment reconciliation. |
| KYC submission and review | Tenant onboarding + ID verification (`Tenant.identification`, `OnboardingDraft`) | |
| Truck selection | Unit allocation (location → property → block → unit) | |
| Booking a shipment | **Reporting a maintenance issue** (also rental applications / viewings, D2) | |
| Dispatch → pickup → delivery | Request `new → assigned → in_progress → resolved → closed` | |
| Delivery proof + customer confirmation | Completion photos + tenant confirms or disputes, then rates | |
| Paystack payment lifecycle | **Rent, service charge and deposit payments** through Paystack | |
| "Escrow" / payout release | Caution deposit held and refunded at move-out; vendor payouts | Only call it escrow if a real escrow arrangement exists. |
| Live GPS tracking | **Live status updates** (Supabase Realtime on requests and notifications) | GPS isn't central to property management (D3). |
| Background location | Not needed unless D3 says otherwise | Avoids store review friction. |
| Voice note + transcription | Optional voice note on "Report an issue" | Later. |
| Push notifications | Rent due, lease renewal, request updates, announcements | |

**Mobile scope, same split as Tracko:** tenants and caretakers get the full mobile app first. Managers, accountants and super admins keep using the web app. The screens already respond to screen size, so they will open on phones, but they aren't tuned for phones.

---

## 2. Current status matrix

Legend: ✅ verified working · 🟡 partial · 🔴 missing · ⚪ unverified

### Platform

| Area | Status | Evidence |
|---|---|---|
| Expo SDK | ✅ SDK 57, RN 0.86; all native packages on SDK-57 versions, `expo-doctor` 21/21 (2026-10-22) | `package.json` |
| Web dev server | ✅ runs at localhost:8081 | started 2026-10-14 |
| Routing | ✅ Expo Router (2026-10-22): one file per screen in `src/app/(auth)` and `src/app/(app)`, `Stack.Protected` by session, role check in `appRoute()`; URLs `/request?id=MR-2083`, scheme `propertyhub://` | `src/app/`, `src/screens/index.tsx`, `src/nav/router.tsx` |
| Data layer | 🔴 **local only**: whole app state in AsyncStorage, built from the seed | `src/store/AppContext.tsx:8,101` (`buildSeed`, `propertyhub_state_v3`) |
| Supabase schema | 🟡 written: 18 tables matching `src/types.ts` | `supabase/migrations/20261013000000_initial_schema.sql` |
| Supabase security | 🟡 written: RLS on every table, role helpers, column guards, private `documents` bucket + maintenance photo policies | `supabase/migrations/20261013000100_security.sql` |
| Migrations applied to the live project | ✅ all eight applied (2026-10-27, owner via SQL editor); access 8/8, uploads 12/12, workflow 21/21, push tokens 7/7, live updates 6/6, payment database rules 4/4 | `scripts/verify-*.mjs` |
| Supabase client | 🟡 set up with SecureStore sessions on native, but **no screen imports it** | `src/lib/supabase.ts`, `src/lib/authStorage.native.ts` |
| Seed script | 🟡 exists, run not confirmed | `scripts/seed-supabase.ts` (`npm run db:seed`) |
| Web hosting | 🟡 Vercel SPA config, no domain set | `vercel.json` |
| EAS | 🟡 project ID + updates URL set, `development` profile + `expo-dev-client` (2026-10-23). Name still "Agon Preview", no iOS `bundleIdentifier` / Android `package` (D6) | `app.json`, `eas.json` |

### Features

| Area | Status | Evidence |
|---|---|---|
| Sign in / sign up / forgot / reset / two-step screens | 🟡 UI done, **fake auth**: plain-text passwords in local state, fixed demo code `481093` | `src/screens/auth.tsx:29`, `AppContext.tsx:151-190` |
| Role routing and permissions | 🟡 checked in the UI only (`useCanAccess`, `useScope`). The matching rules exist in RLS but nothing uses them yet | `src/screens/index.tsx`, `AppContext.tsx` `useScope` |
| Landing page | 🟡 built 2026-10-28: web landing at `/welcome` (signed-out `/` opens it; phones skip to sign-in), privacy notice and terms at `/privacy`, `/terms`. Brand, domain and support email still pending D6 | `src/screens/public.tsx`, `src/app/welcome.tsx` |
| Phone layout for tenants and caretakers | 🟡 built 2026-10-22: bottom tabs, caretaker Today's jobs + Property contacts, tap-to-call, offline launch from an on-device copy, pull-to-refresh, keyboard handling. Web-checked at 390×844; not yet on real phones | `src/components/shell.tsx` (`BottomTabs`), `src/screens/staff/Caretaker.tsx`, `src/lib/cache.ts` |
| Properties / locations / blocks / units | 🟡 full screens, local data | `src/screens/staff/Properties.tsx`, `Portfolio.tsx` |
| Tenant onboarding + KYC | 🟡 multi-step flow, uploads are **simulated** (booleans) | `src/screens/staff/Tenants.tsx`, `OnboardingDraft.id_` |
| Leases (create, renew, terminate, reminders) | 🟡 local data, reminders not actually sent | `src/screens/staff/Leases.tsx` |
| Maintenance requests + vendors | 🟡 full lifecycle UI, photos are **just a count** | `Portal.tsx:357-421`, `Maintenance.tsx` |
| Completion proof + tenant confirmation | 🟡 built 2026-10-20 (completion photos, confirm + rating, dispute, server-enforced transitions); waiting on migrations `20261020000100/0200` | `supabase/migrations/20261020000200_maintenance_workflow.sql`, `src/lib/workflow.ts` |
| Payments | 🟡 built 2026-10-27 (test mode): tenant pays a charge from My lease through Paystack checkout; server-set amount, verify + signed webhook, idempotent on reference; receipts; staff Payments ledger with reconciliation and CSV. Waiting on migration `20261027000000`, the four `paystack-*` functions and a Paystack test key | `supabase/functions/paystack-*`, `src/lib/payments.ts`, `src/components/payments.tsx`, `src/screens/staff/Payments.tsx`, `PAYMENTS.md` |
| Announcements / notifications | 🟡 in-app only, local. Email/SMS/WhatsApp channels are labels | `Admin.tsx`, `Announcement.channels` |
| Live updates | 🟡 built 2026-10-22: Realtime on requests, history and notifications, catch-up after reconnect/background/online, offline banner, "Live · updated" tag; `verify-realtime.mjs` passes. Not yet tested on a phone | `src/store/AppContext.tsx` (live-updates effect), `src/components/shell.tsx` (`OfflineBanner`, `LiveTag`) |
| Push notifications | 🟡 built 2026-10-23: every `notifications` row is pushed by the server (pg_net → Expo push service) to the right phones; daily rent due / overdue and lease-ending reminders (pg_cron, each sent once); token registered after sign-in, removed on sign-out; taps open the linked screen, after sign-in if needed. Waiting on migration `20261023000000`, FCM/APNs credentials and a development build | `supabase/migrations/20261023000000_push_notifications.sql`, `src/lib/push.native.ts`, `src/nav/links.tsx` |
| Camera / file upload | 🟡 pickers installed and wired to private buckets (2026-10-20); needs the storage-policy fix migration applied and a device test | `src/lib/files.ts`, `src/components/files.tsx` |
| Reports / CSV export | 🟡 works on local data | `src/lib/export.ts`, `src/lib/stats.ts` |

**Smallest path to a real MVP:** connect Supabase (auth + data) → landing page → real uploads → maintenance lifecycle on the server → Paystack rent payments → Realtime → mobile polish → push → security → EAS builds.

---

## 3. Open decisions (owner)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Add a **landlord / property owner** role (read-only portfolio, income statements)? | Not for the MVP. Add after launch. |
| D2 | Do prospective tenants **apply or book viewings** in the app, or are they always invited by a manager? | Invite-only for the MVP (matches the existing invite code). |
| D3 | Any **location features** (caretaker check-in at a property)? | No GPS for the MVP. Use Realtime status updates instead. |
| D4 | **Paystack money flow:** rent straight to the org's account? Deposits held and refunded? Vendor payouts through Paystack Transfers? Who confirms refunds? | Rent and service charge through Paystack checkout to the org account. Refunds and vendor payouts recorded by hand for the MVP. **Stage 6 was built on this recommendation (2026-10-27); owner to confirm before live mode.** |
| D5 | ~~Move to Expo Router~~ **Done 2026-10-22** (required by `AGENTS.md`). | Screens keep navigating by route name through `src/nav/router.tsx`, so notification links stored as `{ name, params }` still work. |
| D6 | **Brand, domain and app IDs:** "PropertyHub"? domain? `com.<org>.propertyhub`? Apple/Google developer account owner? | Needed before stage 3 (landing) and stage 13 (EAS). |
| D7 | **SMS/WhatsApp provider** for codes and reminders (Termii, Twilio, etc.)? | Email code through Supabase for the MVP. SMS later. |

---

## 4. Stages and prompts

Send these one at a time. Check the completion line before moving on, then add a line to the progress log at the bottom.

### Stage 1: Audit ✅ (this document)

### Stage 2: Connect Supabase (auth and data). **Release blocker; everything depends on it**
```
Connect PropertyHub to Supabase; do not rebuild screens.
Confirm both migrations are applied to the project in .env.local and run npm run db:seed.
Replace the fake auth in AppContext (checkCredentials, registerTenant, resetPassword,
demo code 481093) with Supabase Auth: email+password, email OTP, password reset, sign out.
Remove the password field from User; load the profile and role from public.profiles.
Replace the AsyncStorage state with Supabase queries per table, keeping the Store
interface so screens change as little as possible. Each mutation writes to the server
first and updates local state only on success.
Let RLS enforce scope; keep useScope only as a UI filter.
Keep the seed only for db:seed, not as a runtime fallback.
Test each role (super_admin, manager, caretaker, accountant, tenant) with seeded logins.
Never print keys. Run tsc and lint.
```
Done when: each seeded role signs in against Supabase, sees only its RLS scope, and changes survive a reload on another device.

### Stage 3: Public landing page
```
Add a public landing page to PropertyHub's web build, as the first route for
signed-out visitors (sign-in stays reachable).
Header, value proposition for property managers and tenants, "Sign in" and
"I have an invite code" actions, how it works (managers / tenants / caretakers),
features, FAQ, support contact, footer with privacy and terms links.
Use the existing theme.ts tokens, Plus Jakarta Sans, and existing illustrations.
No invented testimonials, client logos, statistics, or store badges;
show "mobile app coming soon" until builds exist.
Set page title/meta, use proper headings and alt text, good contrast; test at 360px wide
and with keyboard navigation.
On native builds, skip the landing page and open sign-in.
```
Done when: every link leads somewhere real and the page reads well on a small phone.

### Stage 4: Real uploads for KYC, leases and documents
```
Add real file uploads with expo-image-picker and expo-document-picker
(install with npx expo install).
Upload to the private documents bucket using the folder paths the storage
policies expect (properties/<id>/..., tenants/<id>/..., requests/<id>/...).
Replace the simulated booleans in onboarding (id_.docUploaded, photoUploaded,
agreementUploaded), tenant documents, and maintenance photos with real files.
Check type and size (bucket limit) on the client; RLS enforces access.
Open files with short-lived signed URLs, never public URLs.
Manager KYC review: approve / reject with a reason / ask for re-upload.
Test that tenant A cannot read tenant B's files.
```
Done when: a tenant uploads an ID, a manager reviews it, and another tenant cannot open it.

### Stage 5: Maintenance lifecycle on the server (Tracko booking + dispatch + delivery proof)
```
Make maintenance requests a server-enforced workflow.
Allowed transitions: new → assigned → in_progress → resolved → closed, plus
resolved → disputed → in_progress, and cancellation by tenant while new.
Enforce them in a Postgres function or trigger, with the actor and timestamp
written to request_events. Block double submits (idempotency key on create).
Manager assigns a vendor and/or caretaker and a visit window; the caretaker
sees assigned jobs and marks start / complete with completion photos.
Tenant confirms (then rates) or disputes with a reason; disputes return to the manager.
Do not invent auto-close timeouts unless I approve one.
Test each role's allowed and blocked transitions.
```
Done when: one request goes from report to rating with full history, and invalid transitions fail on the server.

### Stage 6: Paystack rent payments (Tracko payment lifecycle)
```
Add Paystack for rent, service charge and deposits, in test mode only.
Supabase Edge Functions: initialize (amount computed on the server from the lease,
never trusted from the client), verify, and a webhook that checks the
x-paystack-signature HMAC and is idempotent on reference.
Payment status (pending / success / failed / abandoned / refunded) is separate
from lease status. Keep the secret key in function secrets only.
Tenant: "Pay rent" on My lease → Paystack checkout (web redirect / in-app browser
on native) → receipt once the server confirms.
Accountant: payments ledger, reconciliation view, CSV export.
Record how funds actually settle. Do not call deposits "escrow".
Show the full lifecycle with Paystack test cards.
```
Done when: only server-confirmed payments show as paid, and a repeated webhook doesn't double-count.

### Stage 7: Live updates (stands in for Tracko live tracking)
```
Add Supabase Realtime for maintenance_requests, request_events and notifications,
scoped by RLS. Tenants see their request status change live; staff dashboards
and the notification bell update without refresh. Handle reconnects and app
foreground/background; avoid duplicate events. Show a "last updated" time
and an offline banner.
```
Done when: a caretaker's status change shows up on the tenant's phone within seconds.

### Stage 8: Mobile experience for tenants and caretakers
```
Polish PropertyHub for phones for tenants and caretakers.
Tenant: home, my lease + pay rent, report issue (camera), my requests with
live status and confirmation, documents, notifications, profile.
Caretaker: today's jobs, job detail, start/complete with photos, property contacts.
Bottom tabs on native, safe areas, keyboard handling, loading/empty/offline states,
larger text, accessibility labels. Cache data per account and clear it on sign out.
Managers/accountants/admins: keep the web layout working on phones but list any
features that stay web-first.
Test on a small Android phone and an iPhone.
```

### Stage 9: Push notifications and deep links
```
(Do D5: move to Expo Router first, if approved.)
Add expo-notifications using the SDK 57 docs. Store push tokens per user in a
new table with RLS; remove the token on sign out.
Send from the server (Edge Function / database trigger) for: request assigned,
status changed, awaiting confirmation, rent due / overdue, payment received,
lease renewal reminder, announcements. Prevent duplicates; keep the in-app history.
Tapping a notification opens the right authorized screen; signed-out users go to
sign-in first. Test foreground / background / killed on real devices.
```

### Stage 10: Security audit
```
Audit PropertyHub security in the test project: secrets in the client bundle,
RLS on every table and the storage bucket, column guards, Edge Function auth,
Paystack webhook signature, upload limits, rate limits on auth, logs.
Write automated RLS tests: tenant A vs tenant B, a manager outside their
properties, a caretaker on unassigned requests, an accountant writing leases.
Report evidence, severity, files, and fixes; fix release blockers and retest.
```

### Stage 11: Acceptance run
Run the checklist in section 5 on staging web and on a mobile build. Record pass/fail by version, device and environment.

### Stage 12: Deploy the web MVP
```
Deploy the web build to Vercel (npx expo export --platform web → dist).
Set env vars in Vercel, Supabase Auth redirect URLs, the Paystack callback and
webhook URLs for the deployed domain. Keep Paystack in test mode until I approve live.
Write rollback steps, record the commit and URL, and write a short owner demo script.
```

### Stage 13: EAS builds and beta
```
Review app.json for release: name, slug, scheme, ios.bundleIdentifier,
android.package, icons/splash, permission strings (camera, photos, notifications),
runtimeVersion/updates. Add a development profile to eas.json plus preview and production.
Using the current EAS docs, build Android (internal testing) and iOS (TestFlight, cloud build
from Windows). Record build IDs and install results; test camera, push, Paystack,
and sessions on devices. A successful build or TestFlight upload is not store approval.
```

### Stage 14: Store submission and operations
```
Prepare store listings: screenshots, description, support URL, privacy policy,
reviewer demo accounts, data-safety / privacy disclosures that match what
PropertyHub actually collects (ID documents, phone, payments via Paystack),
and in-app account deletion. Submit only with my approval; track
uploaded / in review / rejected / approved / released separately.
Set up crash monitoring, Supabase backups, payment reconciliation, rollback.
```

### Close or resume a session
```
Update the progress log in PROPERTYHUB_BUILD_PLAN.md with verified changes, checks run,
blockers, files, commit, and the next task. When resuming, read this file and
check the code; skip verified work; continue from the earliest unfinished stage.
```

---

## 5. Acceptance checklist

- [ ] Each role signs in through Supabase. Password reset and email code work. Sign-out clears cached data.
- [ ] A manager sees only their properties. The accountant can read payments but cannot edit leases. A tenant sees only their own home.
- [ ] Invite code → tenant signs up → uploads ID → manager approves → tenant gets full access.
- [ ] KYC rejection → tenant re-uploads → approved.
- [ ] Unit allocation and a new lease. Renewal and termination update the unit status.
- [ ] Tenant reports an issue with real photos. Manager assigns. Caretaker completes with photos. Tenant confirms and rates.
- [ ] Dispute path returns the request to the manager. Invalid transitions are rejected by the server.
- [ ] Rent payment with a Paystack test card shows as paid only after server confirmation. Failed and abandoned payments show correctly. A repeated webhook doesn't change totals.
- [ ] Realtime: a status change appears on the other role's device. An offline banner shows when offline.
- [ ] Push: a notification tap opens the correct screen in foreground, background and killed states.
- [ ] Camera/photo permission denied → clear message, app still usable.
- [ ] Landing page links work. Privacy and terms pages exist. Usable at 360px and by keyboard.
- [ ] Cross-tenant access tests (data and files) all fail as expected.

---

## 6. Progress log

| Date | Stage | Result | Commit / build | Next |
|---|---|---|---|---|
| 2026-10-14 | 1 Audit | Status matrix written. Found that the app runs on local seed data only; Supabase schema and RLS written but not connected | `8c51a3f` + uncommitted Supabase files | Owner answers D4–D6, then stage 2 |
| 2026-10-19 | 2 Supabase | Supabase Auth and per-table data in place; all five roles sign in; `scripts/verify-access.mjs` passes. Real-inbox email delivery not yet tested | `4d28875`, `a448cc6` | SMTP + six-digit code templates (AUTHENTICATION.md) |
| 2026-10-20 | 4 Uploads | `expo-image-picker` + `expo-document-picker`; real uploads for onboarding ID/photo/agreement, tenant and unit documents, documents library, lease agreements, request photos (report + attach later); files open through 10-minute signed URLs; KYC review: mark verified / ask for a new ID with a reason, tenant re-uploads from Documents. `scripts/verify-uploads.mjs` found that the `tenants/<id>/` storage policies never matched (unqualified `name` resolved to `tenants.name`); fix in `20261020000000_fix_storage_policies.sql` (also limits bucket file types). Before the fix: cross-tenant blocking and request photos pass; tenant/manager/accountant reads of tenant files fail. tsc clean, lint unchanged (66 pre-existing errors), web export OK | uncommitted | Apply the 2026-10-20 migration in the SQL editor, rerun `verify-uploads.mjs`, test on a phone |
| 2026-10-20 | 5 Maintenance workflow | New statuses `disputed`, `cancelled` (`20261020000100`, run alone first). `20261020000200`: `create_request` (idempotent on `client_key`), `assign_request` (vendor and/or caretaker + visit), `request_transition` (role-checked moves; caretaker needs a `<id>/completion/` photo to resolve; tenant dispute needs a reason; manager close/cancel needs a reason; no auto-close); direct inserts, status edits and forged `created/status/vendor` history refused; `request_events.actor_id` + server time. App: action buttons per role (`src/lib/workflow.ts` mirrors the server), assign dialog with caretaker, caretaker "My jobs" tab, completion photos, dispute/cancel flows for tenants, removed the false "closes in 7 days" text. `scripts/verify-workflow.mjs` (21 checks) fails all 21 before the migration, as expected; tsc clean, lint unchanged (66 pre-existing errors), web export OK. **The app's request create/assign/status actions need these migrations.** | uncommitted | Apply `20261020000000`, `…0100`, `…0200` in order; rerun both verify scripts; then stage 6 (needs D4) or 7 |
| 2026-10-22 | 7 Live updates | No migration needed: the three tables were already in `supabase_realtime` (`security.sql`). Store subscribes while signed in to `maintenance_requests`, `request_events` (insert) and `notifications`; groups bursts for 400 ms, waits for the user's own queued writes, then reloads only the changed requests (`loadRequest`) and the feed; reloads run one at a time and are idempotent, so repeated events change nothing. Full catch-up (`loadRequests` + feed) on every (re)subscribe, on return from more than 30 s in the background, and when the browser comes back online. Offline banner under the top bar with the last update time; `LiveTag` on Maintenance overview, Maintenance requests and My requests. `scripts/verify-realtime.mjs` (6 checks: tenant hears own request and notifications, not staff-only notes; manager hears own-property changes but not tenant notifications; another tenant hears nothing) all pass. Also reran `verify-uploads.mjs` (5 fail) and `verify-workflow.mjs` (21 fail): **the 2026-10-20 migrations are still not applied**. tsc clean, lint unchanged (66 pre-existing errors), web export OK | uncommitted | Apply the three 2026-10-20 migrations and rerun the verify scripts; test live updates on two phones; then stage 6 (needs D4) or stage 3 (needs D6) |
| 2026-10-22 | 8 Mobile (tenants, caretakers) | Bottom tabs on phone widths for tenants (Home · Requests · Report · Lease · More) and caretakers (Jobs · Requests · Contacts · Units · More); More opens the existing drawer. Caretakers now start on **Today's jobs** (`src/screens/staff/Caretaker.tsx`): in progress / due today / coming up / waiting on tenant, visit time (late in red), access notes, tap-to-call tenant, Start work / Mark as fixed straight from the card (completion photos still required). New **Property contacts** screen (office, manager, other caretakers, vendors, all tap-to-call). `CallButton` in `ui.tsx`; tenant home and request detail use it. Removed the made-up fallback caretaker "John Eze" and the placeholder 24-hour number (`+234 1 700 2299`): tenant screens now show the org phone from Settings as "Management office". **Offline launch:** tenants/caretakers on iOS/Android keep the last loaded data in AsyncStorage (`src/lib/cache.ts`, one account, deleted on sign-out together with the old `propertyhub_state_v3` key); with no signal the app opens on that copy with the offline banner and reloads everything (re-checking the account) once Realtime reconnects. Staff roles and web never cache. Pull-to-refresh on every page (native), iOS keyboard avoidance in pages and dialogs, safe-area padding under bottom-sheet dialogs, notices stack their buttons on phones, labels on top-bar icon buttons and tabs. Checked: tsc clean, lint unchanged (66 pre-existing errors), web + Android bundles export, web build driven at 390×844 in Edge as caretaker and tenant (Jobs, Contacts, More drawer, tenant Home, My requests): no page errors. **Not checked:** a job card with real jobs (John Eze has none assigned, and assigning needs the 2026-10-20 migrations); offline launch, pull-to-refresh and keyboard on real phones. Web-first for now (usable on phones, not tuned): dashboard and reports charts, data tables (properties, units, tenants, leases, requests list), onboarding wizard, users/settings/logs, communications | uncommitted | Apply the three 2026-10-20 migrations; assign a job to John Eze and test the job card on an Android phone and an iPhone (Expo Go is enough: no new native modules); then stage 9 (do D5 first) or stage 6 (needs D4) |
| 2026-10-22 | Fix + D5 Expo Router | **Fixed:** 10 packages were on versions Expo SDK 57 doesn't ship (AsyncStorage 3.x and gesture-handler 3.x were major-version mismatches, which Expo Go can't load); `npx expo install --fix` put them on SDK versions, added the `react-native-worklets` peer Reanimated 4 needs, and `cache.ts` uses the AsyncStorage 2 API. `expo-doctor` 21/21. **D5:** moved from the custom hash router to Expo Router. `main` is `expo-router/entry`; `App.tsx`/`index.ts` replaced by `src/app/_layout.tsx` (providers, guards). Each route name is a file (`src/app/(auth)/signIn.tsx`, `src/app/(app)/request.tsx`, …) calling `authRoute()`/`appRoute()` in `src/screens/index.tsx`, which pick the tenant or staff screen and send other roles home. `Stack.Protected` keeps signed-out users out of the app and signed-in users out of sign-in; the navigator waits for the saved session so links and refreshes open the right screen. `src/nav/router.tsx` keeps the old `navigate(name, params)` API on top of Expo Router; tabs and sidebar use `go()` (back to the screen if open, else push), so Android Back and browser Back walk back through tabs. `app.json`: `scheme: propertyhub`, `web.output: single` (matches `vercel.json`). Also: caretaker Requests tab now highlights and its breadcrumbs start at My jobs; card headings wrap instead of squeezing. Checked: tsc clean, lint unchanged (66 pre-existing errors), web export, 18 route checks in Edge (signed-out link → sign-in; caretaker/manager/tenant land on their homes; tab and sidebar moves; deep link `/request?id=…`; refresh keeps the screen; other roles' screens redirect home; Back after tabs and after sign-out) all pass with no page errors | uncommitted | Native: try Android hardware Back and `npx uri-scheme open propertyhub://request?id=MR-2028` on a dev build. Then stage 9 (push), which can now deep-link with `hrefFor(name, params)`; links opened while signed out still land on home after sign-in (handle in stage 9) |
| 2026-10-23 | 9 Push + deep links | **Server** (`20261023000000_push_notifications.sql`, run after the three 2026-10-20 migrations): `push_tokens` (RLS: read/delete own; written only through `register_push_token`, which moves a token to whoever signs in on that phone last). An `after insert` trigger on `notifications` pushes each row once through Expo's push service with `pg_net` (≤100 per request, never blocks the insert, skips rows older than an hour so seed history isn't pushed). Recipients: tenant rows → that tenant's account; staff rows → managers of the linked property (super admins if it has none), the caretaker on the job for request links, accountants for rent. So the request workflow, KYC, lease and announcement notifications all reach phones with no extra code. Daily `pg_cron` at 08:00 Lagos: rent due within 7 days, overdue rent (tenant + staff), lease ending in 60/30/7 days (tenant + staff); `private.reminders_sent` makes each one go out once; it never edits payments or leases. "Payment received" fires when a payment *changes* to `paid` (stage 6 should insert pending, then mark paid). Hourly job drops tokens Expo reports as `DeviceNotRegistered`. **App:** `expo-notifications`, `expo-device`, `expo-dev-client` (via `npx expo install`); `src/lib/push.native.ts` (Android channel, permission once, token → server, removed on sign-out before the session ends; skipped on simulators, in Expo Go on Android and on the web, `src/lib/push.ts`); `src/nav/links.tsx` opens a tapped notification's link (cold start, background, foreground), marks it read, falls back to the notification feed, and keeps links opened **while signed out** (push or URL) until sign-in, closing the gap noted in the D5 entry; `appRoute()` still sends a role that may not open a screen home. `app.json` plugin, `eas.json` `development` profile. Checked: tsc clean, lint unchanged (66 pre-existing errors), `expo-doctor` 21/21, web + Android export, migration parses (pglast: 27 statements, 6 PL/pgSQL bodies), 4 browser checks on the web build at 390×844 (signed-out `/request?id=…` → sign in → that request, breadcrumb home; signed-out tenant-only link → manager lands on dashboard; plain sign-in → dashboard; refresh keeps the request) all pass. `scripts/verify-push.mjs` (7 token checks) fails 5 before the migration, as expected. Reran `verify-workflow.mjs` (21 fail) and `verify-uploads.mjs` (5 fail): **the 2026-10-20 migrations are still not applied**. **Not checked:** any real push delivery or tap (needs the migration, credentials and a dev build); recipients and reminders only parse-checked, not run. Known gap: signing out with no signal leaves the token on the server until the next sign-in on that phone moves it | uncommitted | Owner: apply `20261020000000`, `…0100`, `…0200`, then `20261023000000` in the SQL editor; rerun the four verify scripts. Decide D6 (app IDs), then `npx eas-cli@latest credentials` for FCM V1 + APNs and `npx eas-cli@latest build --profile development` for Android and iOS; test push in foreground / background / killed and `propertyhub://request?id=…`. Next stage: 6 (needs D4) or 3 (needs D6) |
| 2026-10-27 | 6 Paystack payments | Built on the D4 recommendation, **test mode only**. **Server** (`20261027000000_paystack_payments.sql`, run after `20261023000000`): `payments.paid_at` + `reference`; `paystack_transactions` (one row per attempt, status pending / success / failed / abandoned / refunded, kept apart from charge and lease status; RLS read like payments, no write policies); `private.paystack_events` logs every webhook delivery. `paystack_begin()` (service role only) checks the tenant owns an unpaid charge, takes the amount from it, limits 5 attempts per charge per 10 min. `paystack_record()` (service role only, idempotent on reference): success needs amount ×100 and currency to match (otherwise failed + staff notice), marks the charge paid once (`payments_received` tells the tenant), and a second success on a paid charge becomes a "Paid twice: refund needed" staff notice instead of being counted; success is never undone. A trigger stops app users setting `reference`/`paid_at` or changing or deleting Paystack-paid charges; managers can still record cash by hand. Payments + attempts added to Realtime. **Edge Functions** (`supabase/functions/`, Deno, deploy `--no-verify-jwt`): `paystack-initialize` (checks the session, allow-listed return URL, refuses live keys unless `PAYSTACK_ALLOW_LIVE=true`), `paystack-return` (callback + cancel: verify, record, 302 back to the app), `paystack-verify` (RLS-scoped re-check), `paystack-webhook` (HMAC-SHA512 `x-paystack-signature`, constant-time compare, settles `charge.success` through the verify API). **App:** `expo-web-browser` (in Expo Go; `npx expo install`); `src/lib/payments.ts` (web: full-page redirect back to `/myLease?reference=`; phones: `openAuthSessionAsync` back to `propertyhub://myLease`); tenant **To pay** card at the top of My lease (due/overdue badges, result notice that a live update replaces, inline errors, warning against paying twice while an attempt is waiting), "Pay now" notice and accurate rent badge on Home, receipts in Payment history; staff **Payments** (accountant, manager, super admin): tiles, Charges / Paystack payments / Needs checking (paid twice, success not reflected, stuck > 1 h, amount mismatch) with Check-with-Paystack buttons and CSV export. Missing `paystack_transactions` table is tolerated so the app keeps working before the migration; payments use their own Realtime channel. Setup in `PAYMENTS.md`. **Checks:** tsc clean; lint 0 errors (50 warnings, none in new files; `supabase/functions` excluded from ESLint as Deno code); new `npm run db:test` applies all 8 migrations to PGlite with Supabase stand-ins and passes 13 payment scenarios; webhook HMAC matches Node's `createHmac`; web export; Edge at 390×844 and 1366×900 against the live project (temporary charge added and removed): tenant Home "Pay now", My lease To pay, Pay with functions not deployed shows a clear inline error and stays in the app, `?reference=` cleared; accountant and manager ledger, tabs, empty states; caretaker sent away from /payments; no page errors. Found and fixed: an undeployed function surfaced as the raw "Failed to send a request to the Edge Function". `scripts/verify-payments.mjs` (8 checks) fails all 8 before the migration and deploy, as expected, and cleans up. **Not checked:** a real Paystack checkout, webhook or receipt (needs deploy + test key); the Edge Functions were not type-checked (no Deno here); phone checkout. Re-running `db:seed` after a tenant pays would reset seeded charges' status without clearing `reference` | uncommitted | Owner: apply the five pending migrations in order, set `PAYSTACK_SECRET_KEY` (test), deploy the four functions, set the Paystack test webhook URL (`PAYMENTS.md`), run `verify-payments.mjs`, then pay with a test card on web and a dev build. Confirm D4. Next stage: 3 (needs D6) or 10 (security audit) |
| 2026-10-27 | Migrations applied | Owner applied `20261027000000`, then `20261020000000`, `…0100`, `…0200`, `20261023000000` (the payments one first; this order was checked on PGlite and works). Reran every verify script on the live project: access 8/8, uploads 12/12, workflow 21/21, push tokens 7/7, payments 4/8 (the 4 failures are the undeployed `paystack-*` functions). Live updates 6/6 on three reruns, but the first run after the project sat idle failed the two tenant checks (no event within the wait), both before and after these migrations: looks like Realtime warm-up, not a regression; watch for it on phones | uncommitted | Owner: set `PAYSTACK_SECRET_KEY` (test) and deploy the four functions (`PAYMENTS.md` steps 2–4); then rerun `verify-payments.mjs` and pay with a test card |
| 2026-10-28 | 10 Security audit | Report in `SECURITY_AUDIT.md`. Core isolation already held (tenant A vs B, manager outside their properties, caretaker on another's job, accountant writing leases, signed-out key, RLS on every table). Found and fixed 1 high, 5 medium, 4 low in `20261028000000_security_hardening.sql`: S1 any account (even a fresh sign-up) could post to the staff feed, which is pushed to staff phones → staff/tenants with a tenancy only, server-stamped, 20/h for tenants; S2 notifications could be reworded → only `read` changes; S3 caretakers read tenant ID files, tenant documents and charges → removed; S4 staff read every profile → tenant profiles only for visible tenancies; S5 onboarding drafts open to all managers → author, property managers, admins; S10 deactivating a tenant never suspended their login (manager's profile write silently refused) → trigger suspends/restores; S6 announcements of other properties; S7 activity log back-dating; S8 tenants could upload `completion/` photos; S9 tenant documents under any property. No secrets in bundles or git; email confirmation on. New: `scripts/db-tests/security.mjs` (22 checks; 11 fail without the fix), `scripts/verify-security.mjs` (4 live checks: all fail today, confirming the issues are live). `npm run db:test` 35/35, tsc clean, lint 0 errors. Incident during the live check: the reword probe changed the title of demo notification `tn-1`, because the hole is still open; restored from the seed, and the script now restores what it touches. Its two test posts to the staff feed were deleted; no push tokens are registered, so no pushes went out | uncommitted | Owner: apply `20261028000000`, run `verify-security.mjs` (expect 4/4) and the other verify scripts; check Auth rate limits and password length in the dashboard; Paystack steps 2–4 still pending. Next stage: 3 (needs D6) or 11 acceptance run |
| 2026-10-28 | 3 Landing page | Built while waiting on the owner for `20261028000000` (rechecked: `verify-security.mjs` still 4/4 fail, so it is **not yet applied**). New public routes outside the auth guards, open signed in or out: `/welcome` (header with section links, hero with Sign in + "I have an invite code", how it works for managers / tenants / caretakers, 8 features, 6-question FAQ, support, footer), `/privacy` and `/terms` (written from what the app actually stores: ID files, next of kin, payments via Paystack without card data, push tokens, phone cache; no in-app deletion yet, so it points to the management office). Signed-out `/` opens the landing page on the web and sign-in on phones (`/welcome` also redirects on phones). Signed-in visitors see "Open PropertyHub". Real `<a href>` links, h1/h2/h3 headings, `<title>` + meta description via `expo-router/head`, cityscape hidden from screen readers. No testimonials, logos, statistics or store badges; "apps coming soon". Support email comes from `EXPO_PUBLIC_SUPPORT_EMAIL` (added to `.env.example`); without it visitors are pointed to their management office. Also: sign-in/sign-up footer Privacy, Terms and Help now go somewhere (Help → `/welcome?section=faq`), sign-up's Terms/Privacy links work, sign-in has a "PropertyHub home" link on the web, `/signUp?invite=CODE` fills in the invite code. **Checks:** tsc clean, lint 0 errors (50 warnings, unchanged), web + Android export; 21 browser checks in Edge on the web build at 360×740 and 1366×900, all pass (landing on `/`, title/meta, one h1, nothing wider than 360 px, footer anchors, FAQ expand, Tab reaches controls, invite → sign up, prefilled code, terms ↔ privacy, Help → FAQ, header nav scroll, manager sign-in → dashboard → `/welcome` shows Open PropertyHub, privacy while signed in, no page errors). First sign-in attempt took over 8 s (project idle), passed on retry. **Not checked:** screen reader pass; real-phone browser. Known: signing out on the web now lands on the landing page, not sign-in | uncommitted | Owner: apply `20261028000000` and rerun the verify scripts; decide D6 (name, domain, support email, app IDs) and get the privacy notice and terms reviewed before launch. Next stage: 11 acceptance run, or 12 deploy (needs D6) |
| 2026-10-28 | 14 (part) Account deletion | Both stores require in-app deletion, and this needed no owner decision. **Server** (`20261028000100_account_deletion.sql`, run after `20261028000000`): `delete_my_account()` deletes the caller's `auth.users` row; the cascade removes the profile, push tokens and property links, and requests, events, notices, logs and Paystack attempts keep their history with the person set to null. Tenancy records (tenant row, leases, charges, payments, documents) are kept for the organisation. Staff get a notice (tenant: links to the tenant record, says when there is no lease so it can be removed; staff: says how many open jobs lost their caretaker). The last active super admin is refused. The cascade runs with the caller's identity cleared so the stage-10 update guards don't block it. Logged as "Deleted own account". **App:** shared `AccountSecurityCard` (`src/components/account.tsx`): change password (real: rules as sign-up, signs out everywhere), sign out everywhere (real global sign-out with confirm), delete account (password re-checked on a separate client, role-specific explanation, "can't be undone"). Tenant Profile uses it, replacing invented rows ("Last changed 3 months ago", fake two-step "Manage", "2 active sessions", a change-password toast that sent nothing). New staff **My account** screen (`/account`, `src/screens/staff/Account.tsx`): name, role, email, phone, access, properties, security; tenants opening `/account` get Profile. **Fixed:** "Account settings" in the user menu and the sidebar footer sent managers, caretakers and accountants to Settings, which only super admins may open, so they bounced home; both now open My account. Privacy notice says how to delete. Test harness `auth.uid()` now reads the JWT `sub` claim like Supabase. **Checks:** `npm run db:test` 44/44 (9 new in `scripts/db-tests/accounts.mjs`); tsc clean; lint 0 errors (50 warnings, unchanged); web export; 14 browser checks (manager menu → My account, password rules and mismatch, caretaker delete dialog at 390 px: empty and wrong password refused, before the migration a clear "server isn't updated" message and still signed in; tenant Profile shows the card; tenant `/account` → Profile; no page errors). New `scripts/verify-account-deletion.mjs` (5 live checks with a temporary account): 4 fail before the migration, as expected; it cleans up. **Not checked:** a real deletion on the live project (needs the migration). Whether the live project lets a `security definer` function delete from `auth.users` is confirmed only by that script | uncommitted | Owner: apply `20261028000000` then `20261028000100`; run `verify-security.mjs` (expect 4/4) and `verify-account-deletion.mjs` (expect 5/5). Then D6, stage 11 or 12 |
