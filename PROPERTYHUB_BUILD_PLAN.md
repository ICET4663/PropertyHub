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
| Expo SDK | ✅ SDK 57, RN 0.86 | `package.json` |
| Web dev server | ✅ runs at localhost:8081 | started 2026-10-14 |
| Routing | 🟡 custom hash router, **not Expo Router** | `src/nav/router.tsx`, `src/screens/index.tsx`. `AGENTS.md` calls for Expo Router in `src/app/` (D5) |
| Data layer | 🔴 **local only**: whole app state in AsyncStorage, built from the seed | `src/store/AppContext.tsx:8,101` (`buildSeed`, `propertyhub_state_v3`) |
| Supabase schema | 🟡 written: 18 tables matching `src/types.ts` | `supabase/migrations/20261013000000_initial_schema.sql` |
| Supabase security | 🟡 written: RLS on every table, role helpers, column guards, private `documents` bucket + maintenance photo policies | `supabase/migrations/20261013000100_security.sql` |
| Migrations applied to the live project | ⚪ not checked | `.env.local` exists |
| Supabase client | 🟡 set up with SecureStore sessions on native, but **no screen imports it** | `src/lib/supabase.ts`, `src/lib/authStorage.native.ts` |
| Seed script | 🟡 exists, run not confirmed | `scripts/seed-supabase.ts` (`npm run db:seed`) |
| Web hosting | 🟡 Vercel SPA config, no domain set | `vercel.json` |
| EAS | 🟡 project ID + updates URL set. Name still "Agon Preview", no iOS `bundleIdentifier` / Android `package`, no `development` profile | `app.json`, `eas.json` |

### Features

| Area | Status | Evidence |
|---|---|---|
| Sign in / sign up / forgot / reset / two-step screens | 🟡 UI done, **fake auth**: plain-text passwords in local state, fixed demo code `481093` | `src/screens/auth.tsx:29`, `AppContext.tsx:151-190` |
| Role routing and permissions | 🟡 checked in the UI only (`useCanAccess`, `useScope`). The matching rules exist in RLS but nothing uses them yet | `src/screens/index.tsx`, `AppContext.tsx` `useScope` |
| Landing page | 🔴 none: the app opens on sign-in | `AUTH` table in `src/screens/index.tsx` |
| Properties / locations / blocks / units | 🟡 full screens, local data | `src/screens/staff/Properties.tsx`, `Portfolio.tsx` |
| Tenant onboarding + KYC | 🟡 multi-step flow, uploads are **simulated** (booleans) | `src/screens/staff/Tenants.tsx`, `OnboardingDraft.id_` |
| Leases (create, renew, terminate, reminders) | 🟡 local data, reminders not actually sent | `src/screens/staff/Leases.tsx` |
| Maintenance requests + vendors | 🟡 full lifecycle UI, photos are **just a count** | `Portal.tsx:357-421`, `Maintenance.tsx` |
| Completion proof + tenant confirmation | 🟡 rating exists. No proof upload, no dispute flow | `MaintenanceRequest.rating` |
| Payments | 🔴 display-only records, **no payment provider** | `Payment` type, no Paystack code |
| Announcements / notifications | 🟡 in-app only, local. Email/SMS/WhatsApp channels are labels | `Admin.tsx`, `Announcement.channels` |
| Live updates | 🔴 none | |
| Push notifications | 🔴 `expo-notifications` not installed | `package.json` |
| Camera / file upload | 🔴 no `expo-image-picker` / `expo-document-picker` | `package.json` |
| Reports / CSV export | 🟡 works on local data | `src/lib/export.ts`, `src/lib/stats.ts` |

**Smallest path to a real MVP:** connect Supabase (auth + data) → landing page → real uploads → maintenance lifecycle on the server → Paystack rent payments → Realtime → mobile polish → push → security → EAS builds.

---

## 3. Open decisions (owner)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Add a **landlord / property owner** role (read-only portfolio, income statements)? | Not for the MVP. Add after launch. |
| D2 | Do prospective tenants **apply or book viewings** in the app, or are they always invited by a manager? | Invite-only for the MVP (matches the existing invite code). |
| D3 | Any **location features** (caretaker check-in at a property)? | No GPS for the MVP. Use Realtime status updates instead. |
| D4 | **Paystack money flow:** rent straight to the org's account? Deposits held and refunded? Vendor payouts through Paystack Transfers? Who confirms refunds? | Rent and service charge through Paystack checkout to the org account. Refunds and vendor payouts recorded by hand for the MVP. |
| D5 | **Move to Expo Router** (required by `AGENTS.md`, best for push deep links and web URLs) or keep the custom router? | Move before the push/deep-link stage (stage 9). It's mostly a file move, because screens are already split by route name. |
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
