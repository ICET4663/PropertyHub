/**
 * Loads the demo dataset from src/data/seed.ts into Supabase.
 *
 *   npm run db:seed
 *
 * Needs EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local. The secret key bypasses
 * row level security, so it is only ever read here — never prefix it with EXPO_PUBLIC_.
 * Safe to re-run: rows are upserted and existing demo logins are reused.
 */
import { createClient } from '@supabase/supabase-js';
import { buildSeed } from '../src/data/seed';
import type { User } from '../src/types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.');
  process.exit(1);
}

const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const DEMO_PASSWORD = 'demo1234';

// camelCase fields -> snake_case columns, with the few renames the schema needed (reserved words).
const RENAMES: Record<string, string> = { where: 'room', start: 'start_date', end: 'end_date', by: 'by_name', user: 'user_name', id_: 'id_details' };
const snake = (k: string) => RENAMES[k] ?? k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
function toRow(obj: object, omit: string[] = []): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (omit.includes(k) || v === undefined) continue;
    row[snake(k)] = v;
  }
  return row;
}

async function upsert(table: string, rows: Record<string, unknown>[], onConflict = 'id') {
  for (let i = 0; i < rows.length; i += 500) {
    // defaultToNull: false -> fields a row leaves out get the column default, not null
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict, defaultToNull: false });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`  ${table.padEnd(22)} ${rows.length}`);
}

async function findAuthUserByEmail(email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit || data.users.length < 200) return hit ?? null;
  }
}

async function ensureLogin(u: Pick<User, 'name' | 'email' | 'phone'>): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email: u.email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { name: u.name, phone: u.phone },
  });
  if (data.user) return data.user.id;
  const existing = await findAuthUserByEmail(u.email);
  if (!existing) throw new Error(`Could not create login for ${u.email}: ${error?.message}`);
  return existing.id;
}

async function main() {
  const s = buildSeed();
  console.log(`Seeding ${url}`);

  // ---- logins: every staff user, plus the tenant demo account shown on the sign-in screen
  const demoTenant = s.tenants.find((t) => t.email === 'chidinma.okafor@mail.com')!;
  const people: User[] = [
    ...s.users,
    { id: 'u-chidinma', name: demoTenant.name, email: demoTenant.email, phone: demoTenant.phone, role: 'tenant', access: 'Own tenancy', tenantId: demoTenant.id, twoStep: false, lastActive: new Date().toISOString(), status: 'active' },
  ];
  const authId: Record<string, string> = {};
  for (const u of people) authId[u.id] = await ensureLogin(u);
  console.log(`  ${'auth logins'.padEnd(22)} ${people.length}`);
  const uuid = (legacy: string) => authId[legacy] ?? null;

  // ---- order matters: parents before children
  await upsert('profiles', people.map((u) => ({
    id: authId[u.id], legacy_id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, access: u.access,
    two_step: u.twoStep, last_active: u.lastActive, status: u.status, tenant_id: null,
  })));
  await upsert('locations', s.locations.map((l) => ({ ...toRow(l, ['managerId']), manager_id: uuid(l.managerId) })));
  await upsert('properties', s.properties.map((p) => ({ ...toRow(p, ['managerId']), manager_id: uuid(p.managerId) })));
  await upsert('profile_properties', s.users.flatMap((u) => (u.propertyIds ?? []).map((pid) => ({ profile_id: authId[u.id], property_id: pid }))), 'profile_id,property_id');
  await upsert('blocks', s.blocks.map((b) => toRow(b)));
  await upsert('units', s.units.map((u) => toRow(u)));
  await upsert('tenants', s.tenants.map((t) => toRow(t)));
  await upsert('profiles', [{ id: authId['u-chidinma'], tenant_id: demoTenant.id }]);

  // renewed_to / renewed_from point at other leases, so insert without them first, then link.
  await upsert('leases', s.leases.map((l) => toRow(l, ['renewedTo', 'renewedFrom'])));
  await upsert('leases', s.leases.filter((l) => l.renewedTo || l.renewedFrom).map((l) => ({
    ...toRow(l), renewed_to: l.renewedTo ?? null, renewed_from: l.renewedFrom ?? null,
  })));
  await upsert('payments', s.payments.map((p) => toRow(p)));
  await upsert('vendors', s.vendors.map((v) => toRow(v)));
  await upsert('maintenance_requests', s.requests.map((r) => toRow(r, ['events'])));
  await upsert('request_events', s.requests.flatMap((r) => r.events.map((e) => ({ ...toRow(e), request_id: r.id }))));
  await upsert('announcements', s.announcements.map((a) => toRow(a)));
  await upsert('documents', s.documents.map((d) => toRow(d)));
  await upsert('notifications', s.notifications.map((n) => toRow(n)));
  await upsert('activity_logs', s.logs.map((l) => toRow(l)));
  await upsert('org_settings', [{ id: true, ...toRow(s.settings) }]);

  console.log(`Done. Demo logins use the password "${DEMO_PASSWORD}".`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
