/**
 * Loads AppState from Supabase and writes AppState changes back.
 *
 * The screens work on one in-memory AppState. After each change the store hands the old and new
 * state to pushChanges(), which inserts, updates or deletes only the rows that changed (updates are
 * immutable, so an unchanged row keeps the same object). Row level security decides what each
 * user can read and write; a rejected write throws, and the store reloads from the server.
 */
import { Platform } from 'react-native';
import type { AppState, MaintenanceRequest, RequestEvent, Role, Settings, User } from '../types';
import { supabase } from './supabase';

// camelCase fields <-> snake_case columns, plus the few renames the schema needed (reserved words).
const RENAMES: Record<string, string> = { where: 'room', start: 'start_date', end: 'end_date', by: 'by_name', user: 'user_name', id_: 'id_details' };
const UNRENAMES = Object.fromEntries(Object.entries(RENAMES).map(([k, v]) => [v, k]));
const toCol = (k: string) => RENAMES[k] ?? k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toField = (c: string) => UNRENAMES[c] ?? c.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());

type Row = Record<string, unknown>;

/** Database row -> app object. Nulls become missing fields, as the app types expect. */
function fromRow<T>(row: Row, omit: string[] = []): T {
  const obj: Row = {};
  for (const [c, v] of Object.entries(row)) if (v !== null && !omit.includes(c)) obj[toField(c)] = v;
  return obj as T;
}

function toRow(obj: object, omit: string[] = []): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && !omit.includes(k)) row[toCol(k)] = v;
  return row;
}

/** Changed fields only. A field the new object dropped is written as null. */
function diffRow(a: object, b: object, omit: string[] = []): Row {
  const patch: Row = {};
  const ra = a as Row, rb = b as Row;
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    if (k === 'id' || omit.includes(k)) continue;
    if (JSON.stringify(ra[k]) !== JSON.stringify(rb[k])) patch[toCol(k)] = rb[k] ?? null;
  }
  return patch;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Row level security hides rows you may not change, so a blocked update or delete "succeeds" on zero rows. */
function checkAffected(res: { data: unknown[] | null; error: { message: string } | null }) {
  if (!check(res)?.length) throw new Error('You don’t have permission to change this record.');
}

/** Every row of a table the user may see, a page at a time (PostgREST returns at most 1000 per request). */
async function all(table: string, orderBy = 'id', ascending = true): Promise<Row[]> {
  const rows: Row[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const data = check(await supabase.from(table).select('*').order(orderBy, { ascending }).range(from, from + page - 1)) as Row[];
    rows.push(...data);
    if (data.length < page) return rows;
  }
}

/** The newest `limit` rows of a feed. */
async function latest(table: string, limit: number): Promise<Row[]> {
  return check(await supabase.from(table).select('*').order('at', { ascending: false }).limit(limit)) as Row[];
}

export const DEFAULT_SETTINGS: Settings = {
  orgName: '', rcNumber: '', email: '', phone: '', address: '', currency: 'NGN', timezone: 'Africa/Lagos', dateFormat: 'DD MMM YYYY',
  response: { urgent: 1, high: 4, medium: 24, low: 72 }, selfReport: true, selfDocs: true, rateRepairs: false,
};

export function emptyState(): AppState {
  return {
    version: 1, sessionUserId: null, users: [], locations: [], properties: [], blocks: [], units: [], tenants: [], leases: [],
    requests: [], vendors: [], announcements: [], documents: [], notifications: [], payments: [], logs: [],
    settings: DEFAULT_SETTINGS, drafts: [], locationFilter: null,
  };
}

/** Everything the signed-in user is allowed to see. */
export async function loadAll(): Promise<Omit<AppState, 'sessionUserId' | 'locationFilter'>> {
  const [
    profiles, links, locations, properties, blocks, units, tenants, leases, payments, drafts, vendors,
    requests, events, announcements, documents, notifications, logs, settings,
  ] = await Promise.all([
    all('profiles'), all('profile_properties', 'profile_id'), all('locations'), all('properties'), all('blocks'), all('units'), all('tenants'),
    all('leases'), all('payments'), all('onboarding_drafts'), all('vendors'), all('maintenance_requests'),
    all('request_events', 'at'), all('announcements'), all('documents'),
    latest('notifications', 500), latest('activity_logs', 600), all('org_settings'),
  ]);

  const propertyIds = new Map<string, string[]>();
  for (const l of links) propertyIds.set(l.profile_id as string, [...(propertyIds.get(l.profile_id as string) ?? []), l.property_id as string]);
  const users = profiles.map((p) => {
    const u = fromRow<User>(p, ['legacy_id', 'created_at']);
    const ids = propertyIds.get(u.id);
    return ids ? { ...u, propertyIds: ids } : u;
  });

  const byRequest = new Map<string, RequestEvent[]>();
  for (const e of events) byRequest.set(e.request_id as string, [...(byRequest.get(e.request_id as string) ?? []), fromRow<RequestEvent>(e, ['request_id'])]);

  return {
    version: 1,
    users,
    locations: locations.map((r) => fromRow(r)),
    properties: properties.map((r) => fromRow(r)),
    blocks: blocks.map((r) => fromRow(r)),
    units: units.map((r) => fromRow(r)),
    tenants: tenants.map((r) => fromRow(r)),
    leases: leases.map((r) => fromRow(r)),
    payments: payments.map((r) => fromRow(r)),
    drafts: drafts.map((r) => fromRow(r)),
    vendors: vendors.map((r) => fromRow(r)),
    requests: requests.map((r) => ({ ...fromRow<MaintenanceRequest>(r), events: byRequest.get(r.id as string) ?? [] })),
    announcements: announcements.map((r) => fromRow(r)),
    documents: documents.map((r) => fromRow(r)),
    notifications: notifications.map((r) => fromRow(r)),
    logs: logs.map((r) => fromRow(r, ['actor_id'])),
    settings: settings[0] ? { ...DEFAULT_SETTINGS, ...fromRow<Settings>(settings[0], ['id']) } : DEFAULT_SETTINGS,
  };
}

// Parents before children, so inserts never point at a row that isn't there yet. Deletes run in reverse.
const SYNCED: Array<{ key: keyof AppState; table: string; omit?: string[]; insertOnly?: boolean }> = [
  { key: 'locations', table: 'locations' },
  { key: 'properties', table: 'properties' },
  { key: 'blocks', table: 'blocks' },
  { key: 'units', table: 'units' },
  { key: 'tenants', table: 'tenants' },
  { key: 'leases', table: 'leases' },
  { key: 'payments', table: 'payments' },
  { key: 'drafts', table: 'onboarding_drafts' },
  { key: 'vendors', table: 'vendors' },
  { key: 'requests', table: 'maintenance_requests', omit: ['events'] },
  { key: 'announcements', table: 'announcements' },
  { key: 'documents', table: 'documents' },
  { key: 'notifications', table: 'notifications' },
  { key: 'logs', table: 'activity_logs', insertOnly: true }, // the app trims old logs locally; never delete them
];

type WithId = { id: string };

/** Writes the difference between two states to Supabase. Throws on the first rejected write. */
export async function pushChanges(prev: AppState, next: AppState, me: { id: string; role: Role }) {
  const deletes: Array<{ table: string; ids: string[] }> = [];

  for (const { key, table, omit, insertOnly } of SYNCED) {
    const a = prev[key] as unknown as WithId[];
    const b = next[key] as unknown as WithId[];
    if (a !== b) {
      // Only staff may write the audit log; tenant actions are recorded through their notifications.
      if (key === 'logs' && me.role === 'tenant') continue;
      const before = new Map(a.map((x) => [x.id, x]));
      const inserts: Row[] = [];
      const updates: Array<{ id: string; patch: Row }> = [];
      for (const item of b) {
        const old = before.get(item.id);
        if (!old) inserts.push(key === 'logs' ? { ...toRow(item), actor_id: me.id } : toRow(item, omit));
        else if (old !== item && !insertOnly) {
          const patch = diffRow(old, item, omit);
          if (Object.keys(patch).length) updates.push({ id: item.id, patch });
        }
      }
      if (inserts.length) check(await supabase.from(table).insert(inserts));
      await Promise.all(updates.map(async (u) => check(await supabase.from(table).update(u.patch).eq('id', u.id))));
      if (!insertOnly) {
        const kept = new Set(b.map((x) => x.id));
        const gone = a.filter((x) => !kept.has(x.id)).map((x) => x.id);
        if (gone.length) deletes.push({ table, ids: gone });
      }
    }
    if (key === 'requests' && a !== b) await pushRequestEvents(prev.requests, next.requests);
  }

  if (prev.users !== next.users) await pushUsers(prev.users, next.users);
  if (prev.settings !== next.settings) {
    const patch = diffRow(prev.settings, next.settings);
    if (Object.keys(patch).length) check(await supabase.from('org_settings').update(patch).eq('id', true));
  }
  for (const d of deletes.reverse()) check(await supabase.from(d.table).delete().in('id', d.ids));
}

/** Request history lives in its own table; events are only ever appended. */
async function pushRequestEvents(prev: MaintenanceRequest[], next: MaintenanceRequest[]) {
  const before = new Map(prev.map((r) => [r.id, r]));
  const rows: Row[] = [];
  for (const r of next) {
    const old = before.get(r.id);
    if (old === r) continue;
    const seen = new Set(old?.events.map((e) => e.id));
    for (const e of r.events) if (!seen.has(e.id)) rows.push({ ...toRow(e), request_id: r.id });
  }
  if (rows.length) check(await supabase.from('request_events').insert(rows));
}

/** Profiles are tied to logins, so they can be edited here but not created. */
async function pushUsers(prev: User[], next: User[]) {
  const before = new Map(prev.map((u) => [u.id, u]));
  for (const u of next) {
    const old = before.get(u.id);
    if (!old) throw new Error('Inviting a team member needs the invite server function, which is not set up yet.');
    if (old === u) continue;
    const patch = diffRow(old, u, ['propertyIds']);
    if (Object.keys(patch).length) check(await supabase.from('profiles').update(patch).eq('id', u.id));
    if (JSON.stringify(old.propertyIds ?? []) !== JSON.stringify(u.propertyIds ?? [])) {
      check(await supabase.from('profile_properties').delete().eq('profile_id', u.id));
      if (u.propertyIds?.length) check(await supabase.from('profile_properties').insert(u.propertyIds.map((property_id) => ({ profile_id: u.id, property_id }))));
    }
  }
}

/** Next MR- / LS- / TN- code from the server sequences. */
export async function nextCode(kind: 'request' | 'lease' | 'tenant'): Promise<string> {
  return check(await supabase.rpc('next_code', { kind })) as string;
}

export const deviceLabel = Platform.OS === 'web' ? 'Web browser' : Platform.OS === 'ios' ? 'iOS app' : 'Android app';
