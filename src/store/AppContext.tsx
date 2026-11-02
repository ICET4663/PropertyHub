import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState, Platform } from 'react-native';
import type {
  ActivityLog, Announcement, AppNotification, AppState, Block, Category, DocFile, Lease, Location,
  MaintenanceRequest, OnboardingDraft, PaystackStatus, Priority, Property, Role, Settings,
  Tenant, Unit, User, Vendor,
} from '../types';
import { supabase, createSignupClient, isSupabaseConfigured } from '../lib/supabase';
import { deviceLabel, emptyState, loadAll, loadNotifications, loadPayments, loadRequest, loadRequests, nextCode, pushChanges, rpc } from '../lib/db';
import { checkPayment as confirmPayment, openCheckout } from '../lib/payments';
import { TRANSITION_TO, type Transition } from '../lib/workflow';
import { kindOf, removeFiles, uploadFile, type PickedFile } from '../lib/files';
import { cacheable, clearCache, isNetworkError, readCache, saveCache } from '../lib/cache';
import { unregisterPush } from '../lib/push';
import { addDays, addMonths, fmtDate, leaseStatus, naira, toISODate, todayISO, uid } from '../utils';

export type AuthResult = { ok: true } | { ok: false; error: string };
/** What an emailed code is for. `signin` and `twoStep` both finish by signing in. */
export type CodePurpose = 'signin' | 'twoStep' | 'signup' | 'reset';

export interface NewPropertyInput {
  name: string; type: Property['type']; description: string; address: string; locationId: string; city: string; state: string;
  blocks: string[]; managerId: string; amenities: string[];
}

export interface NewRequestInput {
  tenantId: string; category: Category; title: string; description: string; where: string;
  urgency: 'low' | 'medium' | 'urgent'; photos: PickedFile[]; caretakerAccess: boolean; access: string;
  /** Generated once per form; resubmitting with the same key returns the same request. */
  clientKey: string;
}

export interface AssignInput { vendorId?: string; caretakerId?: string; visit?: { date: string; window: string }; note: string; tellTenant: boolean }

export interface TransitionInput { note?: string; rating?: number; /** Completion photos, uploaded before the request is marked fixed. */ photos?: PickedFile[] }

/** Files picked during onboarding; they are uploaded once the tenant record exists. */
export interface OnboardingFiles { idFront?: PickedFile; idBack?: PickedFile; photo?: PickedFile; agreement?: PickedFile }

export type NewDocument = Pick<DocFile, 'folder' | 'linkedTo' | 'tenantId' | 'propertyId' | 'expires'> & { name?: string }

export interface RenewInput { start: string; end: string; rent: number; serviceCharge: number; notifyTenant: boolean; scheduleReminders: boolean }

export interface CreateUserInput { name: string; email: string; password: string; role: Role; access: string; propertyIds?: string[] }

export interface SignUpInput { name: string; email: string; phone: string; password: string; invite: string }

/** The live feed of request and notification changes. `updatedAt` is the last successful refresh. */
export interface LiveStatus { connection: 'connecting' | 'live' | 'offline'; updatedAt: string | null }

interface Store {
  state: AppState;
  hydrated: boolean;
  me: User | null;
  myTenant: Tenant | null;
  live: LiveStatus;
  /** Last failed server write, already rolled back. Shown as a toast, then cleared. */
  syncError: string | null;
  clearSyncError: () => void;
  // auth
  signIn: (email: string, password: string) => Promise<{ ok: true; needsTwoStep: boolean } | { ok: false; error: string }>;
  signUp: (input: SignUpInput) => Promise<{ ok: true; needsCode: boolean } | { ok: false; error: string }>;
  sendCode: (email: string, purpose: CodePurpose) => Promise<AuthResult>;
  verifyCode: (email: string, code: string, purpose: CodePurpose) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  /** Opens the app for an account that is signed in but still on the sign-up screens. */
  enter: () => void;
  signOut: () => Promise<void>;
  /** Ends every session of this account (other phones and browsers too), then signs out here. */
  signOutEverywhere: () => Promise<void>;
  /** Checks the current password, then removes this account's sign-in for good (delete_my_account) and signs out. */
  deleteAccount: (password: string) => Promise<AuthResult>;
  // global
  setLocationFilter: (id: string | null) => void;
  /** Reloads everything this account may see (pull to refresh). False when the server can't be reached. */
  refresh: () => Promise<boolean>;
  // portfolio
  addLocation: (l: Omit<Location, 'id'>) => string;
  updateLocation: (id: string, patch: Partial<Location>) => void;
  deleteLocation: (id: string) => boolean;
  addProperty: (p: NewPropertyInput) => string;
  updateProperty: (id: string, patch: Partial<Property>) => void;
  addBlock: (propertyId: string, name: string, floors: number) => string;
  addUnit: (u: Omit<Unit, 'id' | 'features' | 'deposit'> & { features?: string[] }) => string;
  updateUnit: (id: string, patch: Partial<Unit>) => void;
  // tenants & onboarding
  saveDraft: (d: OnboardingDraft) => void;
  discardDraft: (id: string) => void;
  /** Creates the tenant, then uploads the picked files. Resolves with the tenant id and any upload problem. */
  submitOnboarding: (d: OnboardingDraft, approveNow: boolean, files: OnboardingFiles) => Promise<{ id: string; uploadError?: string }>;
  approveTenant: (tenantId: string) => void;
  /** KYC rejection: the tenant is told why and asked to upload a new ID. */
  requestNewId: (tenantId: string, reason: string) => void;
  updateTenant: (id: string, patch: Partial<Tenant>) => void;
  deactivateTenant: (id: string) => void;
  moveTenant: (id: string, unitId: string) => void;
  // leases
  renewLease: (leaseId: string, input: RenewInput) => Promise<string>;
  terminateLease: (leaseId: string) => void;
  sendLeaseReminder: (leaseIds: string[]) => number;
  setTenantIntent: (leaseId: string, intent: 'renew' | 'move_out') => void;
  /** Stores the signed agreement and marks the lease signed. */
  uploadLeaseAgreement: (leaseId: string, file: PickedFile) => Promise<void>;
  // payments
  /** Opens Paystack checkout for a charge. Phones: the outcome once checkout closes. Web: null, as the page leaves for Paystack. */
  payOnline: (paymentId: string) => Promise<{ status: PaystackStatus; reference: string } | null>;
  /** Asks the server to confirm a Paystack attempt, then reloads payments. */
  checkPayment: (reference: string) => Promise<PaystackStatus>;
  // maintenance
  createRequest: (input: NewRequestInput) => Promise<string>;
  /** Assigns a vendor and/or caretaker through the server; new requests become assigned. */
  assignRequest: (id: string, input: AssignInput) => Promise<void>;
  /** Moves a request along the workflow. The server checks the role and the step; errors are thrown. */
  transitionRequest: (id: string, t: Transition, input?: TransitionInput) => Promise<void>;
  setRequestPriority: (id: string, p: Priority) => void;
  addComment: (id: string, text: string, shared: boolean) => void;
  // vendors, comms, docs
  addVendor: (v: Omit<Vendor, 'id' | 'completed' | 'avgDays' | 'rating' | 'ratingCount' | 'spendThisMonth'>) => void;
  setVendorStatus: (id: string, status: Vendor['status']) => void;
  sendAnnouncement: (a: Omit<Announcement, 'id' | 'sentAt' | 'readPct' | 'by'>) => void;
  /** Uploads the file, then records it. Throws with a readable message if either step fails. */
  addDocument: (d: NewDocument, file: PickedFile) => Promise<DocFile>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (audience: string) => void;
  // admin
  createUser: (u: CreateUserInput) => Promise<AuthResult>;
  saveUserRole: (id: string, role: Role, propertyIds: string[], access: string) => Promise<AuthResult>;
  refreshUsers: () => Promise<void>;
  updateUser: (id: string, patch: Partial<User>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

const Ctx = createContext<Store | null>(null);

/** Supabase auth messages, in the app's voice. */
function authError(message: string): string {
  // Without .env.local the client points at localhost, which looks like a network failure.
  if (!isSupabaseConfigured) return 'This copy of the app isn’t connected to a server yet. Copy .env.example to .env.local, fill in the Supabase URL and publishable key, then restart with npx expo start -c.';
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password don’t match. Try again or reset your password.';
  if (m.includes('email') && m.includes('invalid')) return 'The email provider rejected this address. Use a real email address. For demo accounts, use password sign-in rather than an emailed code.';
  if (m.includes('email not confirmed')) return 'Confirm your email address first. Sign up again to get a new code.';
  if (m.includes('signups not allowed')) return 'We couldn’t find an account with that email.';
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('expired') || (m.includes('invalid') && m.includes('token'))) return 'That code isn’t right or has expired. Request a new one.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Can’t reach the server. Check your connection and try again.';
  return message;
}

/** The list with one request replaced, added (newest first) or, when it is gone or hidden, removed. */
function withRequest(list: MaintenanceRequest[], id: string, req: MaintenanceRequest | null): MaintenanceRequest[] {
  if (!req) return list.filter((r) => r.id !== id);
  return list.some((r) => r.id === id) ? list.map((r) => (r.id === id ? req : r)) : [req, ...list];
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveStatus>({ connection: 'connecting', updatedAt: null });
  const stateRef = useRef(state); // kept current by setNow, the only way state changes
  const writes = useRef<Promise<void>>(Promise.resolve());
  /** Opened from the on-device copy with no connection: reload everything once the server is back. */
  const stale = useRef(false);

  const setNow = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /**
   * Loads what this account may see. Tenants are linked to their tenancy first (no-op once linked).
   * `enter: false` loads the data but stays on the auth screens (used after sign-up).
   */
  const open = useCallback(async (userId: string, enter = true): Promise<AuthResult & { offline?: boolean }> => {
    try {
      const { data: profile, error } = await supabase.from('profiles').select('role, tenant_id, status').eq('id', userId).single();
      if (error || !profile) throw new Error(error?.message ?? 'Your profile is missing. Contact your property manager.');
      if (profile.status === 'suspended') {
        await supabase.auth.signOut();
        return { ok: false, error: 'This account has been suspended. Contact your administrator.' };
      }
      if (profile.role === 'tenant' && !profile.tenant_id) {
        const { error: linkError } = await supabase.rpc('register_tenant');
        if (linkError) throw new Error(linkError.message);
      }
      const data = await loadAll();
      stale.current = false;
      setNow({ ...data, sessionUserId: enter ? userId : null, locationFilter: null });
      if (enter) {
        void supabase.from('profiles').update({ last_active: new Date().toISOString() }).eq('id', userId).then(() => {});
        const me = data.users.find((u) => u.id === userId);
        if (me && me.role !== 'tenant') {
          void supabase.from('activity_logs').insert({ user_name: me.name, actor_id: userId, action: 'Signed in', record: '—', area: 'Security', device: deviceLabel }).then(() => {});
        }
      }
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: authError(message), offline: isNetworkError(message) };
    }
  }, [setNow]);

  // Restore a saved session on launch; clear everything when the session ends.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase calls this inside its auth lock, so defer any further Supabase calls.
      if (event === 'INITIAL_SESSION') {
        setTimeout(async () => {
          if (session) {
            const r = await open(session.user.id);
            // No signal: open on the last copy saved on this phone and catch up when the server is back.
            const cached = !r.ok && r.offline ? await readCache(session.user.id) : null;
            if (cached) {
              stale.current = true;
              setNow({ ...emptyState(), ...cached.data, sessionUserId: session.user.id, locationFilter: null });
              setLive({ connection: 'offline', updatedAt: cached.savedAt });
            } else if (!r.ok) setSyncError(r.error);
          }
          setHydrated(true);
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        void clearCache();
        setNow(emptyState());
      }
    });
    return () => data.subscription.unsubscribe();
  }, [open, setNow]);

  const me = state.sessionUserId ? state.users.find((u) => u.id === state.sessionUserId) ?? null : null;
  const myTenant = me?.tenantId ? state.tenants.find((t) => t.id === me.tenantId) ?? null : null;

  const actorName = useCallback(() => {
    const s = stateRef.current;
    return s.users.find((u) => u.id === s.sessionUserId)?.name ?? 'System';
  }, []);

  /**
   * Apply a change on screen straight away, append an audit-log entry, and queue the server write.
   * If the server rejects it, reload from the server (undoing the change) and report the error.
   */
  const mutate = useCallback((fn: (s: AppState) => AppState, log?: { action: string; record: string; area: ActivityLog['area'] }) => {
    const prev = stateRef.current;
    let next = fn(prev);
    if (next === prev) return;
    const user = prev.users.find((u) => u.id === prev.sessionUserId);
    if (log) {
      const entry: ActivityLog = { id: uid('lg'), at: new Date().toISOString(), user: user?.name ?? 'System', ...log, device: deviceLabel };
      next = { ...next, logs: [entry, ...next.logs].slice(0, 600) };
    }
    setNow(next);
    if (!user) return;
    writes.current = writes.current
      .then(() => pushChanges(prev, next, { id: user.id, role: user.role }))
      .catch(async (e: unknown) => {
        setSyncError(`Couldn’t save that change: ${e instanceof Error ? e.message : String(e)}`);
        try {
          const data = await loadAll();
          setNow({ ...stateRef.current, ...data });
        } catch {
          // offline: keep what is on screen; the next successful load corrects it
        }
      });
  }, [setNow]);

  const notify = (s: AppState, n: Omit<AppNotification, 'id' | 'at' | 'read'>): AppState => ({
    ...s,
    notifications: [{ ...n, id: uid('n'), at: new Date().toISOString(), read: false }, ...s.notifications],
  });

  /** Pulls a request (and the notification feed) back from the server after a workflow function ran. */
  const refreshRequest = useCallback(async (id: string) => {
    const [req, notifications] = await Promise.all([loadRequest(id), loadNotifications()]);
    const s = stateRef.current;
    setNow({ ...s, requests: withRequest(s.requests, id, req), notifications });
  }, [setNow]);

  /**
   * While signed in, follow changes to requests, their history and notifications (Realtime applies
   * each user's RLS). One workflow step writes several rows, so changes are gathered for a moment and
   * then the affected requests and the feed are reloaded. Reloading is idempotent, so a repeated
   * event changes nothing. After a gap (reconnect, back from the background, browser back online)
   * the whole request list and feed are reloaded instead.
   */
  useEffect(() => {
    const userId = state.sessionUserId;
    if (!userId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = Promise.resolve();
    const ids = new Set<string>();
    let feed = false, everything = false;

    const flush = async () => {
      const want = [...ids], full = everything, withFeed = feed || everything;
      ids.clear(); feed = false; everything = false;
      try {
        await writes.current; // this user's own queued changes land first
        if (full && stale.current) {
          // Started from the saved copy: everything may be old, not just requests. open() also re-checks the account.
          const r = await open(userId);
          if (!r.ok && r.offline) throw new Error(r.error);
          if (!r.ok) setSyncError(r.error);
          stale.current = false;
          if (!stopped) setLive({ connection: 'live', updatedAt: new Date().toISOString() });
          return;
        }
        const [requests, changed, notifications] = await Promise.all([
          full ? loadRequests() : null,
          full ? [] : Promise.all(want.map(async (id) => [id, await loadRequest(id)] as const)),
          withFeed ? loadNotifications() : null,
        ]);
        const s = stateRef.current;
        if (stopped || s.sessionUserId !== userId) return;
        const next = requests ?? changed.reduce((list, [id, req]) => withRequest(list, id, req), s.requests);
        setNow({ ...s, requests: next, ...(notifications ? { notifications } : {}) });
        setLive({ connection: 'live', updatedAt: new Date().toISOString() });
      } catch {
        // Unreachable: catch up on everything once the connection is back.
        everything = true;
        if (!stopped) setLive((l) => ({ ...l, connection: 'offline' }));
      }
    };
    // Flushes run one at a time so an older reload never lands after a newer one.
    const queue = (what: { id?: string; feed?: boolean; full?: boolean }) => {
      if (what.id) ids.add(what.id);
      if (what.feed) feed = true;
      if (what.full) everything = true;
      if (!timer) timer = setTimeout(() => { timer = null; running = running.then(flush); }, 400);
    };
    const offline = () => setLive((l) => ({ ...l, connection: 'offline' }));

    const channel = supabase.channel(`live-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_requests' }, (p) => {
        const row = (p.eventType === 'DELETE' ? p.old : p.new) as { id?: string };
        if (row.id) queue({ id: row.id });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'request_events' }, (p) => {
        const requestId = (p.new as { request_id?: string }).request_id;
        if (requestId) queue({ id: requestId });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => queue({ feed: true }))
      .subscribe((status) => {
        // Also fires after every automatic rejoin; the first one covers changes made since sign-in loaded.
        if (status === 'SUBSCRIBED') queue({ full: true });
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') offline();
      });

    // Phones pause the connection in the background; catch up when the app comes back after a while.
    let hiddenAt = 0;
    const appState = RNAppState.addEventListener('change', (s) => {
      if (s !== 'active') hiddenAt ||= Date.now();
      else if (hiddenAt) { if (Date.now() - hiddenAt > 30_000) queue({ full: true }); hiddenAt = 0; }
    });
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    const online = () => queue({ full: true });
    if (web) { window.addEventListener('offline', offline); window.addEventListener('online', online); }

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
      appState.remove();
      if (web) { window.removeEventListener('offline', offline); window.removeEventListener('online', online); }
      setLive({ connection: 'connecting', updatedAt: null });
    };
  }, [state.sessionUserId, setNow, open]);

  const refreshPayments = useCallback(async () => {
    const userId = stateRef.current.sessionUserId;
    await writes.current;
    const p = await loadPayments();
    const s = stateRef.current;
    if (s.sessionUserId === userId) setNow({ ...s, ...p });
  }, [setNow]);

  /**
   * Charges and Paystack attempts have their own channel, so a server that doesn't have the payments
   * migration yet can't break the request feed. A receipt shows up as soon as the server confirms.
   */
  useEffect(() => {
    const userId = state.sessionUserId;
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (!timer) timer = setTimeout(() => { timer = null; refreshPayments().catch(() => {}); }, 400);
    };
    const channel = supabase.channel(`payments-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paystack_transactions' }, reload)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [state.sessionUserId, refreshPayments]);

  // Keep the on-device copy current for tenants and caretakers (see lib/cache.ts).
  const cacheOwner = me && cacheable(me.role) ? me.id : null;
  useEffect(() => {
    if (!cacheOwner || state.sessionUserId !== cacheOwner) return;
    const t = setTimeout(() => {
      const { sessionUserId: _s, locationFilter: _l, ...data } = stateRef.current;
      void saveCache(cacheOwner, data).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [state, cacheOwner]);

  /** Staff actions done by server functions still go in the activity log. */
  const logAction = useCallback((action: string, record: string) => {
    const s = stateRef.current;
    const user = s.users.find((u) => u.id === s.sessionUserId);
    if (!user || user.role === 'tenant') return;
    const entry: ActivityLog = { id: uid('lg'), at: new Date().toISOString(), user: user.name, action, record, area: 'Maintenance', device: deviceLabel };
    setNow({ ...s, logs: [entry, ...s.logs].slice(0, 600) });
    void supabase.from('activity_logs').insert({ id: entry.id, user_name: entry.user, actor_id: user.id, action, record, area: entry.area, device: entry.device }).then(() => {});
  }, [setNow]);

  /** The extension of a picked file, for naming the stored copy. */
  const ext = (f: PickedFile) => (f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.')) : '');

  /** Upload first, then record. A record the server rejects takes its file with it. */
  const addDocument = useCallback(async (d: NewDocument, file: PickedFile): Promise<DocFile> => {
    const folder = d.tenantId ? `tenants/${d.tenantId}` : d.propertyId ? `properties/${d.propertyId}` : null;
    if (!folder) throw new Error('Link the document to a property or tenant first.');
    const storagePath = await uploadFile('documents', folder, file);
    const s0 = stateRef.current;
    const meNow = s0.users.find((u) => u.id === s0.sessionUserId);
    const doc: DocFile = {
      id: uid('doc'), name: d.name?.trim() || file.name, kind: kindOf(file), folder: d.folder, linkedTo: d.linkedTo, tenantId: d.tenantId, propertyId: d.propertyId,
      expires: d.expires, uploadedBy: meNow?.name ?? 'System', date: todayISO(), sizeKb: Math.max(1, Math.round(file.size / 1024)), storagePath,
    };
    mutate((s) => {
      const next = { ...s, documents: [doc, ...s.documents] };
      // A tenant sending a new ID needs someone to review it.
      return meNow?.role === 'tenant' && d.folder === 'Tenant ID and KYC'
        ? notify(next, { audience: 'staff', category: 'Tenants', title: 'New ID to review', body: `${meNow.name} uploaded ${doc.name}.`, meta: 'Tenants · KYC', tone: 'purple', link: { name: 'tenant', params: { id: d.tenantId! } } })
        : next;
    }, { action: 'Uploaded document', record: doc.name, area: d.tenantId ? 'Tenants' : 'Properties' });
    await writes.current;
    if (!stateRef.current.documents.some((x) => x.id === doc.id)) {
      await removeFiles('documents', [storagePath]).catch(() => {});
      throw new Error(`${doc.name} uploaded, but the record couldn’t be saved. Try again.`);
    }
    return doc;
  }, [mutate]);

  const uploadLeaseAgreement = useCallback(async (leaseId: string, file: PickedFile) => {
    const s0 = stateRef.current;
    const l = s0.leases.find((x) => x.id === leaseId);
    if (!l) throw new Error('This lease no longer exists.');
    const where = `${s0.properties.find((p) => p.id === l.propertyId)?.short ?? ''} ${s0.units.find((u) => u.id === l.unitId)?.code ?? ''}`.trim();
    const doc = await addDocument({ name: `${l.id} signed agreement${ext(file)}`, folder: 'Lease agreements', linkedTo: `${l.id} · ${where}`, tenantId: l.tenantId, propertyId: l.propertyId }, file);
    mutate((s) => ({ ...s, leases: s.leases.map((x) => (x.id === leaseId ? { ...x, agreement: doc.storagePath!, signed: true } : x)) }), { action: 'Uploaded signed agreement', record: leaseId, area: 'Leases' });
    await writes.current;
  }, [addDocument, mutate]);

  const store = useMemo<Store>(() => ({
    state, hydrated, me, myTenant, live, syncError,
    clearSyncError: () => setSyncError(null),

    // ---------------- auth ----------------
    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { ok: false, error: authError(error.message) };
      const { data: profile } = await supabase.from('profiles').select('two_step').eq('id', data.user.id).single();
      if (profile?.two_step) {
        // Second step: the password was right; now prove access to the inbox with an emailed code.
        await supabase.auth.signOut();
        const sent = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
        if (sent.error) return { ok: false, error: authError(sent.error.message) };
        return { ok: true, needsTwoStep: true };
      }
      const r = await open(data.user.id);
      return r.ok ? { ok: true, needsTwoStep: false } : r;
    },
    signUp: async ({ name, email, phone, password, invite }) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password, options: { data: { name: name.trim(), phone: phone.trim(), invite: invite.trim().toUpperCase() } },
      });
      if (error) return { ok: false, error: authError(error.message) };
      // With email confirmation on, an existing address comes back as a user with no identities.
      if (data.user && data.user.identities?.length === 0) return { ok: false, error: 'An account with this email already exists. Try signing in.' };
      if (data.session) {
        const r = await open(data.session.user.id, false);
        return r.ok ? { ok: true, needsCode: false } : r;
      }
      return { ok: true, needsCode: true };
    },
    sendCode: async (email, purpose) => {
      const e = email.trim();
      const { error } = purpose === 'signup'
        ? await supabase.auth.resend({ type: 'signup', email: e })
        : purpose === 'reset'
          ? await supabase.auth.resetPasswordForEmail(e)
          : await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: false } });
      return error ? { ok: false, error: authError(error.message) } : { ok: true };
    },
    verifyCode: async (email, code, purpose) => {
      const type = purpose === 'signup' ? 'signup' : purpose === 'reset' ? 'recovery' : 'email';
      const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type });
      if (error || !data.user) return { ok: false, error: authError(error?.message ?? 'That code isn’t right or has expired.') };
      if (purpose === 'reset') return { ok: true }; // signed in just long enough to set a new password
      return open(data.user.id, purpose !== 'signup');
    },
    updatePassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { ok: false, error: authError(error.message) };
      await supabase.auth.signOut({ scope: 'global' });
      return { ok: true };
    },
    enter: () => {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) setNow({ ...stateRef.current, sessionUserId: data.session.user.id });
      });
    },
    signOut: async () => {
      await unregisterPush(); // stop pushes to this phone first, while the session can still remove the token
      await clearCache();
      await supabase.auth.signOut();
      setNow(emptyState());
    },
    signOutEverywhere: async () => {
      await unregisterPush();
      await clearCache();
      await supabase.auth.signOut({ scope: 'global' });
      setNow(emptyState());
    },
    deleteAccount: async (password) => {
      const email = me?.email;
      if (!email) return { ok: false, error: 'Sign in first.' };
      // Check the password on a separate client, so this session isn't replaced.
      const check = createSignupClient();
      const { error: authErr } = await check.auth.signInWithPassword({ email, password });
      if (authErr) return { ok: false, error: authErr.message.toLowerCase().includes('invalid login credentials') ? 'That password isn’t right.' : authError(authErr.message) };
      await check.auth.signOut({ scope: 'local' });
      try {
        await rpc('delete_my_account', {});
      } catch (e) {
        return { ok: false, error: authError(e instanceof Error ? e.message : String(e)) };
      }
      // The server has removed the account and its push tokens; clear this device too.
      await unregisterPush();
      await clearCache();
      await supabase.auth.signOut({ scope: 'local' });
      setNow(emptyState());
      return { ok: true };
    },

    // ---------------- global ----------------
    setLocationFilter: (id) => setNow({ ...stateRef.current, locationFilter: id }),
    refresh: async () => {
      const userId = stateRef.current.sessionUserId;
      if (!userId) return true;
      await writes.current;
      if (stale.current) {
        const r = await open(userId);
        if (!r.ok && !r.offline) setSyncError(r.error);
        if (r.ok) setLive({ connection: 'live', updatedAt: new Date().toISOString() });
        return r.ok || !r.offline;
      }
      try {
        const data = await loadAll();
        const s = stateRef.current;
        if (s.sessionUserId === userId) setNow({ ...s, ...data });
        setLive({ connection: 'live', updatedAt: new Date().toISOString() });
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!isNetworkError(message)) { setSyncError(message); return true; }
        setLive((l) => ({ ...l, connection: 'offline' }));
        return false;
      }
    },


    // ---------------- portfolio ----------------
    addLocation: (l) => {
      const id = uid('loc');
      mutate((s) => ({ ...s, locations: [...s.locations, { ...l, id }] }), { action: 'Created location', record: l.name, area: 'Properties' });
      return id;
    },
    updateLocation: (id, patch) => mutate((s) => ({ ...s, locations: s.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)) }), { action: 'Updated location', record: patch.name ?? id, area: 'Properties' }),
    deleteLocation: (id) => {
      if (stateRef.current.properties.some((p) => p.locationId === id)) return false;
      mutate((s) => ({ ...s, locations: s.locations.filter((l) => l.id !== id) }), { action: 'Deleted location', record: id, area: 'Properties' });
      return true;
    },
    addProperty: (p) => {
      const id = uid('prop');
      const palettes = [{ bg: '#DCE7E1', a: '#2F5D4B', b: '#8A6A34' }, { bg: '#DCE3ED', a: '#3E4F6E', b: '#2F5D4B' }, { bg: '#ECE3D2', a: '#8A6A34', b: '#3E4F6E' }];
      const property: Property = {
        id, name: p.name, short: p.name.split(' ').slice(0, 2).join(' '), type: p.type, locationId: p.locationId, address: p.address, managerId: p.managerId,
        addedAt: todayISO(), description: p.description, amenities: p.amenities, art: palettes[stateRef.current.properties.length % 3], status: 'active',
      };
      const blocks: Block[] = p.blocks.map((b) => ({ id: uid('blk'), propertyId: id, name: b.toLowerCase().startsWith('block') ? b : `Block ${b}`, floors: 4 }));
      mutate((s) => ({ ...s, properties: [...s.properties, property], blocks: [...s.blocks, ...blocks] }), { action: 'Created property', record: p.name, area: 'Properties' });
      return id;
    },
    updateProperty: (id, patch) => mutate((s) => ({ ...s, properties: s.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), { action: 'Updated property', record: patch.name ?? id, area: 'Properties' }),
    addBlock: (propertyId, name, floors) => {
      const id = uid('blk');
      mutate((s) => ({ ...s, blocks: [...s.blocks, { id, propertyId, name: name.toLowerCase().startsWith('block') ? name : `Block ${name}`, floors }] }), { action: `Added block ${name}`, record: stateRef.current.properties.find((p) => p.id === propertyId)?.short ?? '', area: 'Properties' });
      return id;
    },
    addUnit: (u) => {
      const id = uid('unit');
      mutate((s) => ({ ...s, units: [...s.units, { ...u, id, deposit: Math.round(u.rent / 10), features: u.features ?? ['Fitted kitchen', 'Prepaid meter'], vacantSince: u.status === 'vacant' ? todayISO() : undefined }] }), { action: 'Added unit', record: `Unit ${u.code}`, area: 'Properties' });
      return id;
    },
    updateUnit: (id, patch) => mutate((s) => ({
      ...s,
      units: s.units.map((u) => (u.id === id ? { ...u, ...patch, vacantSince: patch.status === 'vacant' && u.status !== 'vacant' ? todayISO() : patch.status === 'occupied' ? undefined : (patch.vacantSince ?? u.vacantSince) } : u)),
    }), { action: patch.status ? `Marked unit as ${patch.status === 'maintenance' ? 'under maintenance' : patch.status}` : patch.rent ? `Changed rent to ${naira(patch.rent)}` : 'Updated unit', record: `Unit ${stateRef.current.units.find((u) => u.id === id)?.code}`, area: 'Properties' }),

    // ---------------- tenants ----------------
    saveDraft: (d) => mutate((s) => ({ ...s, drafts: [{ ...d, savedAt: new Date().toISOString() }, ...s.drafts.filter((x) => x.id !== d.id)] })),
    discardDraft: (id) => mutate((s) => ({ ...s, drafts: s.drafts.filter((d) => d.id !== id) })),
    submitOnboarding: async (d, approveNow, files) => {
      const [code, leaseId] = await Promise.all([nextCode('tenant'), nextCode('lease')]);
      const s0 = stateRef.current;
      const unit = s0.units.find((u) => u.id === d.allocation.unitId)!;
      const tenantId = uid('ten');
      const tenant: Tenant = {
        id: tenantId, code, name: d.personal.name, email: d.personal.email, phone: d.personal.phone, dob: d.personal.dob, gender: d.personal.gender,
        address: d.personal.address, unitId: unit.id, propertyId: unit.propertyId, status: approveNow ? 'active' : 'pending', onboarding: approveNow ? 'approved' : 'pending',
        joinedAt: todayISO(), language: 'English', nextOfKin: d.kin, employment: d.employment,
        identification: { type: d.id_.type, number: d.id_.number, verified: approveNow },
        prefs: { smsUpdates: true, emailAnnouncements: true, whatsapp: false },
      };
      const months = Math.max(1, Math.round((new Date(d.lease.end).getTime() - new Date(d.lease.start).getTime()) / (30.4 * 86400000)));
      const lease: Lease = {
        id: leaseId, tenantId, unitId: unit.id, propertyId: unit.propertyId, start: d.lease.start, end: d.lease.end, rent: unit.rent, serviceCharge: unit.serviceCharge,
        deposit: unit.deposit, termMonths: months, noticeMonths: 3, paymentCycle: 'Annually, in advance', createdBy: actorName(),
        agreement: `${leaseId}-tenancy-agreement.pdf`, signed: d.lease.agreementUploaded, draft: !approveNow, reminders: [],
      };
      // No login is created here: the tenant signs up with this email and is linked to this record (register_tenant).
      const prop = s0.properties.find((p) => p.id === unit.propertyId)!;
      mutate((s) => notify({
        ...s,
        tenants: [tenant, ...s.tenants],
        leases: [lease, ...s.leases],
        units: approveNow ? s.units.map((u) => (u.id === unit.id ? { ...u, status: 'occupied' as const, vacantSince: undefined } : u)) : s.units,
        drafts: s.drafts.filter((x) => x.id !== d.id),
        payments: approveNow ? [{ id: uid('pay'), tenantId, leaseId, label: 'Rent + service charge', amount: unit.rent + unit.serviceCharge, date: d.lease.start, method: 'Bank transfer', status: 'pending' as const }, ...s.payments] : s.payments,
      }, approveNow
        ? { audience: 'staff', category: 'Tenants', title: 'Onboarding complete', body: `${tenant.name} was approved for ${prop.short} ${unit.code}. They can sign up for the tenant portal with ${tenant.email}.`, meta: 'Tenants', tone: 'success', link: { name: 'tenant', params: { id: tenantId } } }
        : { audience: 'staff', category: 'Tenants', title: 'Tenant awaiting approval', body: `${tenant.name} completed onboarding for ${prop.short} ${unit.code}.`, meta: 'Tenants · Approval', tone: 'purple', link: { name: 'tenant', params: { id: tenantId } } }),
      { action: approveNow ? 'Approved new tenant' : 'Submitted tenant for approval', record: tenant.name, area: 'Tenants' });
      await writes.current;
      if (!stateRef.current.tenants.some((x) => x.id === tenantId)) throw new Error('The server didn’t accept the new tenant.');

      // The storage policy checks that the tenant exists, so files go up only now.
      const linkedTo = `${prop.short} · ${unit.code}`;
      const idType = d.id_.type.split(' (')[0];
      const kyc: [PickedFile | undefined, string][] = [
        [files.idFront, `${idType} (front) – ${tenant.name}`],
        [files.idBack, `${idType} (back) – ${tenant.name}`],
        [files.photo, `Passport photo – ${tenant.name}`],
      ];
      const failed: string[] = [];
      for (const [f, name] of kyc) {
        if (!f) continue;
        try { await addDocument({ name: name + ext(f), folder: 'Tenant ID and KYC', linkedTo, tenantId, propertyId: unit.propertyId }, f); } catch { failed.push(f.name); }
      }
      if (files.agreement) {
        try { await uploadLeaseAgreement(leaseId, files.agreement); } catch { failed.push(files.agreement.name); }
      }
      return failed.length
        ? { id: tenantId, uploadError: `The tenant was saved, but ${failed.join(', ')} didn’t upload. Add ${failed.length > 1 ? 'them' : 'it'} from the tenant’s profile.` }
        : { id: tenantId };
    },
    approveTenant: (tenantId) => {
      // A tenant without a lease gets a 12-month one, which needs a code from the server first.
      const s0 = stateRef.current;
      const t0 = s0.tenants.find((x) => x.id === tenantId);
      const needsLease = !!t0?.unitId && !s0.leases.some((l) => l.tenantId === tenantId);
      (needsLease ? nextCode('lease') : Promise.resolve('')).then((newLeaseId) => mutate((s) => {
      const t = s.tenants.find((x) => x.id === tenantId);
      if (!t) return s;
      const hasLease = s.leases.some((l) => l.tenantId === tenantId);
      const unit = s.units.find((u) => u.id === t.unitId);
      let leases = s.leases.map((l) => (l.tenantId === tenantId && l.draft ? { ...l, draft: false } : l));
      if (!hasLease && unit && newLeaseId) {
        const id = newLeaseId;
        const start = todayISO();
        const end = toISODate(addDays(addMonths(new Date(), 12), -1));
        leases = [{ id, tenantId, unitId: unit.id, propertyId: unit.propertyId, start, end, rent: unit.rent, serviceCharge: unit.serviceCharge, deposit: unit.deposit, termMonths: 12, noticeMonths: 3, paymentCycle: 'Annually, in advance', createdBy: s.users.find((u) => u.id === s.sessionUserId)?.name ?? 'System', agreement: `${id}-tenancy-agreement.pdf`, signed: false, reminders: [] }, ...leases];
      }
      return notify({
        ...s,
        leases,
        tenants: s.tenants.map((x) => (x.id === tenantId ? { ...x, status: 'active' as const, onboarding: 'approved' as const, identification: { ...x.identification, verified: true } } : x)),
        units: unit ? s.units.map((u) => (u.id === unit.id ? { ...u, status: 'occupied' as const, vacantSince: undefined } : u)) : s.units,
      }, { audience: tenantId, category: 'Tenants', title: 'Your account is approved.', body: 'Welcome to PropertyHub. Your lease and home details are now available.', meta: 'Account', tone: 'success' });
    }, { action: 'Approved tenant application', record: t0?.name ?? '', area: 'Tenants' }))
        .catch((e: unknown) => setSyncError(`Couldn’t approve the tenant: ${e instanceof Error ? e.message : String(e)}`));
    },
    requestNewId: (tenantId, reason) => mutate((s) => {
      const t = s.tenants.find((x) => x.id === tenantId);
      if (!t) return s;
      return notify({
        ...s,
        tenants: s.tenants.map((x) => (x.id === tenantId ? { ...x, identification: { ...x.identification, verified: false } } : x)),
      }, { audience: tenantId, category: 'Tenants', title: 'Please upload a new ID.', body: reason, meta: 'Account · Identification', tone: 'warning', link: { name: 'myDocuments' } });
    }, { action: 'Asked tenant for a new ID', record: stateRef.current.tenants.find((t) => t.id === tenantId)?.name ?? '', area: 'Tenants' }),
    updateTenant: (id, patch) => mutate((s) => ({
      ...s,
      tenants: s.tenants.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      users: s.users.map((u) => (u.tenantId === id ? { ...u, name: patch.name ?? u.name, email: patch.email ?? u.email, phone: patch.phone ?? u.phone } : u)),
    }), { action: 'Updated tenant details', record: stateRef.current.tenants.find((t) => t.id === id)?.name ?? '', area: 'Tenants' }),
    deactivateTenant: (id) => mutate((s) => {
      const t = s.tenants.find((x) => x.id === id);
      if (!t) return s;
      return {
        ...s,
        tenants: s.tenants.map((x) => (x.id === id ? { ...x, status: 'deactivated' as const, unitId: undefined } : x)),
        leases: s.leases.map((l) => (l.tenantId === id && !l.renewedTo && !l.terminated ? { ...l, terminated: true } : l)),
        units: s.units.map((u) => (u.id === t.unitId ? { ...u, status: 'vacant' as const, vacantSince: todayISO(), vacantNote: 'Listed' as const } : u)),
        users: s.users.map((u) => (u.tenantId === id ? { ...u, status: 'suspended' as const } : u)),
      };
    }, { action: 'Deactivated tenant', record: stateRef.current.tenants.find((t) => t.id === id)?.name ?? '', area: 'Tenants' }),
    moveTenant: (id, unitId) => mutate((s) => {
      const t = s.tenants.find((x) => x.id === id);
      const target = s.units.find((u) => u.id === unitId);
      if (!t || !target) return s;
      return {
        ...s,
        tenants: s.tenants.map((x) => (x.id === id ? { ...x, unitId, propertyId: target.propertyId } : x)),
        units: s.units.map((u) => (u.id === t.unitId ? { ...u, status: 'vacant' as const, vacantSince: todayISO(), vacantNote: 'Listed' as const } : u.id === unitId ? { ...u, status: 'occupied' as const, vacantSince: undefined } : u)),
        leases: s.leases.map((l) => (l.tenantId === id && !l.renewedTo && !l.terminated ? { ...l, unitId, propertyId: target.propertyId, rent: target.rent, serviceCharge: target.serviceCharge } : l)),
      };
    }, { action: 'Moved tenant to a new unit', record: stateRef.current.tenants.find((t) => t.id === id)?.name ?? '', area: 'Tenants' }),

    // ---------------- leases ----------------
    renewLease: async (leaseId, input) => {
      const newId = await nextCode('lease');
      mutate((s) => {
        const old = s.leases.find((l) => l.id === leaseId);
        if (!old) return s;
        const t = s.tenants.find((x) => x.id === old.tenantId);
        const months = Math.max(1, Math.round((new Date(input.end).getTime() - new Date(input.start).getTime()) / (30.4 * 86400000)));
        const endD = new Date(input.end + 'T00:00:00');
        const reminders = input.scheduleReminders
          ? [90, 60, 30].map((d) => ({ label: `${d}-day renewal reminder`, channels: d === 30 ? 'Email · SMS' : 'Email', date: toISODate(addDays(endD, -d)), status: 'Scheduled' as const }))
          : [];
        const fresh: Lease = { ...old, id: newId, start: input.start, end: input.end, rent: input.rent, serviceCharge: input.serviceCharge, termMonths: months, renewedFrom: old.id, renewedTo: undefined, tenantIntent: undefined, agreement: `${newId}-renewal.pdf`, signed: false, reminders, createdBy: s.users.find((u) => u.id === s.sessionUserId)?.name ?? 'System' };
        let next: AppState = { ...s, leases: [fresh, ...s.leases.map((l) => (l.id === old.id ? { ...l, renewedTo: newId } : l))] };
        if (input.notifyTenant && t) next = notify(next, { audience: t.id, category: 'Leases', title: 'Your lease has been renewed.', body: `New lease ${newId} runs ${fmtDate(input.start)} – ${fmtDate(input.end)} at ${naira(input.rent)} a year.`, meta: 'Lease', tone: 'success', link: { name: 'myLease' } });
        return next;
      }, { action: 'Renewed lease', record: `${leaseId} → ${newId}`, area: 'Leases' });
      return newId;
    },
    terminateLease: (leaseId) => mutate((s) => {
      const l = s.leases.find((x) => x.id === leaseId);
      if (!l) return s;
      return {
        ...s,
        leases: s.leases.map((x) => (x.id === leaseId ? { ...x, terminated: true } : x)),
        tenants: s.tenants.map((t) => (t.id === l.tenantId ? { ...t, status: 'former' as const, unitId: undefined } : t)),
        units: s.units.map((u) => (u.id === l.unitId ? { ...u, status: 'vacant' as const, vacantSince: todayISO(), vacantNote: 'Listed' as const } : u)),
      };
    }, { action: 'Terminated lease', record: leaseId, area: 'Leases' }),
    sendLeaseReminder: (ids) => {
      mutate((s) => {
        let next = s;
        ids.forEach((id) => {
          const l = next.leases.find((x) => x.id === id);
          if (!l) return;
          next = {
            ...next,
            leases: next.leases.map((x) => (x.id === id ? { ...x, reminders: [{ label: 'Manual renewal reminder', channels: 'Email · SMS', date: todayISO(), status: 'Delivered' as const }, ...x.reminders] } : x)),
          };
          next = notify(next, { audience: l.tenantId, category: 'Leases', title: 'Your lease is ending soon.', body: `Your lease ends on ${fmtDate(l.end)}. Let us know if you plan to renew or move out.`, meta: 'Lease', tone: 'warning', link: { name: 'myLease' } });
        });
        return next;
      }, { action: `Sent renewal reminders (${ids.length})`, record: ids.length === 1 ? ids[0] : 'Bulk', area: 'Communications' });
      return ids.length;
    },
    setTenantIntent: (leaseId, intent) => mutate((s) => {
      const l = s.leases.find((x) => x.id === leaseId);
      const t = s.tenants.find((x) => x.id === l?.tenantId);
      if (!l || !t) return s;
      const unit = s.units.find((u) => u.id === l.unitId);
      return notify({ ...s, leases: s.leases.map((x) => (x.id === leaseId ? { ...x, tenantIntent: intent } : x)) }, {
        audience: 'staff', category: 'Leases', title: intent === 'renew' ? 'Tenant plans to renew' : 'Tenant plans to move out',
        body: `${t.name} (${s.properties.find((p) => p.id === l.propertyId)?.short} ${unit?.code}) ${intent === 'renew' ? 'wants to renew' : 'plans to move out at the end of the lease'}.`, meta: 'Leases', tone: intent === 'renew' ? 'success' : 'warning', link: { name: 'lease', params: { id: leaseId } },
      });
    }, { action: intent === 'renew' ? 'Tenant confirmed intent to renew' : 'Tenant gave notice to move out', record: leaseId, area: 'Leases' }),

    uploadLeaseAgreement,

    // ---------------- payments ----------------
    payOnline: async (paymentId) => {
      const reference = await openCheckout(paymentId);
      if (!reference) return null;
      const status = await confirmPayment(reference);
      await refreshPayments().catch(() => {});
      return { status, reference };
    },
    checkPayment: async (reference) => {
      const status = await confirmPayment(reference);
      await refreshPayments().catch(() => {});
      return status;
    },

    // ---------------- maintenance ----------------
    createRequest: async (input) => {
      await writes.current;
      const s0 = stateRef.current;
      const priority: Priority = input.urgency === 'urgent' ? 'urgent' : input.urgency === 'medium' ? 'medium' : 'low';
      const id = await rpc<string>('create_request', { p: {
        client_key: input.clientKey, tenant_id: input.tenantId, category: input.category, title: input.title, description: input.description,
        room: input.where, priority, access: input.access, caretaker_access: input.caretakerAccess, photos: input.photos.length,
      } });
      // Photos live under the request id, which the storage policy checks, so they follow the request.
      // A retried submission returns the same id; its photos are already there.
      const already = s0.requests.some((r) => r.id === id);
      const results = already ? [] : await Promise.allSettled(input.photos.map((f) => uploadFile('maintenance-photos', id, f)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) setSyncError(`Request ${id} was sent, but ${failed} of ${input.photos.length} photos didn’t upload. Add them from the request.`);
      await refreshRequest(id);
      if (!already) logAction('Submitted maintenance request', id);
      return id;
    },
    assignRequest: async (id, input) => {
      await writes.current;
      await rpc('assign_request', {
        p_id: id, p_vendor_id: input.vendorId ?? null, p_caretaker_id: input.caretakerId ?? null,
        p_visit: input.visit ?? null, p_note: input.note.trim() || null, p_tell_tenant: input.tellTenant,
      });
      await refreshRequest(id);
      const s = stateRef.current;
      const who = [s.vendors.find((v) => v.id === input.vendorId)?.name, s.users.find((u) => u.id === input.caretakerId)?.name].filter(Boolean).join(' and ');
      logAction(`Assigned ${who}`, id);
    },
    transitionRequest: async (id, t, input = {}) => {
      await writes.current;
      if (input.photos?.length) {
        // Completion photos go in their own folder so they stay apart from the tenant's.
        const results = await Promise.allSettled(input.photos.map((f) => uploadFile('maintenance-photos', `${id}/completion`, f)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed === input.photos.length) throw new Error('The completion photos didn’t upload. Check your connection and try again.');
        if (failed) setSyncError(`${failed} of ${input.photos.length} completion photos didn’t upload.`);
      }
      try {
        await rpc('request_transition', { p_id: id, p_to: TRANSITION_TO[t], p_note: input.note?.trim() || null, p_rating: input.rating ?? null });
      } finally {
        await refreshRequest(id).catch(() => {});
      }
      const label: Record<Transition, string> = { start: 'Started work', complete: 'Marked request fixed', confirm: 'Confirmed request fixed', dispute: 'Disputed fix', reopen: 'Reopened disputed request', cancel: 'Cancelled request', close: 'Closed request' };
      logAction(label[t], id);
    },
    setRequestPriority: (id, p) => mutate((s) => ({
      ...s,
      requests: s.requests.map((x) => (x.id === id ? { ...x, priority: p, events: [...x.events, { id: uid('ev'), kind: 'priority' as const, text: `Priority set to ${p[0].toUpperCase() + p.slice(1)}`, by: s.users.find((u) => u.id === s.sessionUserId)?.name ?? 'System', at: new Date().toISOString() }] } : x)),
    }), { action: `Set priority to ${p[0].toUpperCase() + p.slice(1)}`, record: id, area: 'Maintenance' }),
    addComment: (id, text, shared) => mutate((s) => {
      const me_ = s.users.find((u) => u.id === s.sessionUserId);
      const isTenant = me_?.role === 'tenant';
      return {
        ...s,
        requests: s.requests.map((x) => (x.id === id ? { ...x, updatedAt: new Date().toISOString(), events: [...x.events, { id: uid('ev'), kind: 'comment' as const, text, by: me_?.name ?? 'System', at: new Date().toISOString(), internal: !shared && !isTenant, shared: shared || isTenant }] } : x)),
      };
    }, { action: 'Commented on request', record: id, area: 'Maintenance' }),

    // ---------------- vendors, comms, docs ----------------
    addVendor: (v) => mutate((s) => ({ ...s, vendors: [...s.vendors, { ...v, id: uid('ven'), completed: 0, avgDays: 0, rating: 0, ratingCount: 0, spendThisMonth: 0 }] }), { action: 'Added vendor', record: v.name, area: 'Maintenance' }),
    setVendorStatus: (id, status) => mutate((s) => ({ ...s, vendors: s.vendors.map((v) => (v.id === id ? { ...v, status } : v)) }), { action: status === 'paused' ? 'Paused vendor' : 'Reactivated vendor', record: stateRef.current.vendors.find((v) => v.id === id)?.name ?? '', area: 'Maintenance' }),
    sendAnnouncement: (a) => mutate((s) => {
      const who = s.users.find((u) => u.id === s.sessionUserId)?.name ?? 'System';
      const ann: Announcement = { ...a, id: uid('ann'), sentAt: a.scheduledFor ?? new Date().toISOString(), readPct: 0, by: who };
      if (a.status !== 'sent') return { ...s, announcements: [ann, ...s.announcements] };
      const targets = s.tenants.filter((t) => t.status === 'active' && (!a.propertyId || t.propertyId === a.propertyId));
      const notifs: AppNotification[] = targets.map((t) => ({ id: uid('n'), audience: t.id, category: 'Announcement', title: `${a.subject}.`, body: a.message.replace('{first_name}', t.name.split(' ')[0]).replace('{property}', s.properties.find((p) => p.id === t.propertyId)?.name ?? '').split('\n').filter(Boolean).slice(0, 2).join(' '), meta: `Announcement · ${s.properties.find((p) => p.id === t.propertyId)?.name}`, at: new Date().toISOString(), read: false, tone: 'purple' }));
      return { ...s, announcements: [ann, ...s.announcements], notifications: [...notifs, ...s.notifications] };
    }, { action: a.status === 'scheduled' ? 'Scheduled announcement' : a.status === 'template' ? 'Saved announcement template' : 'Sent announcement', record: a.subject, area: 'Communications' }),
    addDocument,
    markNotificationRead: (id) => mutate((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n)) })),
    markAllNotificationsRead: (audience) => mutate((s) => ({ ...s, notifications: s.notifications.map((n) => (n.audience === audience && !n.read ? { ...n, read: true } : n)) })),

    // ---------------- admin ----------------
    // Accounts use public sign-up; only the signed-in administrator can assign roles through RLS.
    refreshUsers: async () => {
      const data = await loadAll();
      setNow({ ...stateRef.current, ...data });
    },
    saveUserRole: async (id, role, propertyIds, access) => {
      if (me?.role !== 'super_admin') return { ok: false, error: 'Only a Super Admin can assign roles.' };
      if (id === me.id) return { ok: false, error: 'Ask another Super Admin to change your own role.' };
      try {
        await writes.current;
        const result = await supabase.from('profiles').update({ role, access }).eq('id', id).select('id').single();
        if (result.error) throw result.error;
        const removed = await supabase.from('profile_properties').delete().eq('profile_id', id);
        if (removed.error) throw removed.error;
        if (propertyIds.length && (role === 'manager' || role === 'caretaker')) {
          const linked = await supabase.from('profile_properties').insert(propertyIds.map((property_id) => ({ profile_id: id, property_id })));
          if (linked.error) throw linked.error;
        }
        const data = await loadAll();
        setNow({ ...stateRef.current, ...data });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: `Could not finish saving access. Reload and retry: ${e instanceof Error ? e.message : String((e as { message?: string }).message ?? e)}` };
      }
    },
    createUser: async (input) => {
      if (me?.role !== 'super_admin') return { ok: false, error: 'Only a Super Admin can create staff accounts.' };
      const email = input.email.trim().toLowerCase();
      if (stateRef.current.users.some((u) => u.email.toLowerCase() === email)) {
        return { ok: false, error: 'This account already exists. Use Edit role and access instead.' };
      }
      const client = createSignupClient();
      let created = false;
      try {
        const { data, error } = await client.auth.signUp({ email, password: input.password, options: { data: { name: input.name.trim() } } });
        if (error) throw error;
        if (!data.user || data.user.identities?.length === 0) throw new Error('This email already has an account. Refresh the list and edit its role.');
        created = true;
        const profile = await supabase.from('profiles').update({ name: input.name.trim(), role: input.role, access: input.access })
          .eq('id', data.user.id).eq('email', email).select('id').single();
        if (profile.error) throw profile.error;
        if (input.propertyIds?.length && (input.role === 'manager' || input.role === 'caretaker')) {
          const links = await supabase.from('profile_properties').insert(input.propertyIds.map((property_id) => ({ profile_id: data.user!.id, property_id })));
          if (links.error) throw links.error;
        }
        const fresh = await loadAll();
        setNow({ ...stateRef.current, ...fresh });
        return { ok: true };
      } catch (e) {
        const message = authError(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e));
        return { ok: false, error: created ? `Account created, but setup is incomplete. Refresh users and edit its role and access. ${message}` : message };
      } finally {
        await client.auth.signOut({ scope: 'local' });
      }
    },
    updateUser: (id, patch) => mutate((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }), { action: 'Updated team member', record: stateRef.current.users.find((u) => u.id === id)?.name ?? '', area: 'Users' }),
    updateSettings: (patch) => mutate((s) => ({ ...s, settings: { ...s.settings, ...patch } }), { action: 'Updated organisation settings', record: '—', area: 'Users' }),
  }), [state, hydrated, me, myTenant, live, syncError, mutate, actorName, open, setNow, addDocument, uploadLeaseAgreement, refreshRequest, logAction, refreshPayments]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore must be used within StoreProvider');
  return c;
}

// ---------------- scoped selectors ----------------

/** Everything the signed-in staff member may see, narrowed by the topbar "Viewing" location. */
export function useScope() {
  const { state, me } = useStore();
  return useMemo(() => {
    let props = state.properties.filter((p) => p.status === 'active');
    if (me && me.propertyIds && me.role !== 'super_admin' && me.role !== 'accountant') props = props.filter((p) => me.propertyIds!.includes(p.id));
    if (state.locationFilter) props = props.filter((p) => p.locationId === state.locationFilter);
    const ids = new Set(props.map((p) => p.id));
    const locIds = new Set(props.map((p) => p.locationId));
    return {
      propertyIds: ids,
      properties: props,
      locations: state.locations.filter((l) => (state.locationFilter ? l.id === state.locationFilter : me?.role === 'super_admin' || me?.role === 'accountant' ? true : locIds.has(l.id))),
      blocks: state.blocks.filter((b) => ids.has(b.propertyId)),
      units: state.units.filter((u) => ids.has(u.propertyId)),
      tenants: state.tenants.filter((t) => !t.propertyId || ids.has(t.propertyId)),
      leases: state.leases.filter((l) => ids.has(l.propertyId)),
      currentLeases: state.leases.filter((l) => ids.has(l.propertyId) && !l.renewedTo && !l.terminated && !l.draft),
      requests: state.requests.filter((r) => ids.has(r.propertyId)),
      documents: state.documents.filter((d) => !d.propertyId || ids.has(d.propertyId)),
    };
  }, [state, me]);
}

export function useLookup() {
  const { state } = useStore();
  return useMemo(() => {
    const p = new Map(state.properties.map((x) => [x.id, x]));
    const u = new Map(state.units.map((x) => [x.id, x]));
    const t = new Map(state.tenants.map((x) => [x.id, x]));
    const v = new Map(state.vendors.map((x) => [x.id, x]));
    const l = new Map(state.locations.map((x) => [x.id, x]));
    const b = new Map(state.blocks.map((x) => [x.id, x]));
    const users = new Map(state.users.map((x) => [x.id, x]));
    return {
      property: (id?: string) => (id ? p.get(id) : undefined),
      unit: (id?: string) => (id ? u.get(id) : undefined),
      tenant: (id?: string) => (id ? t.get(id) : undefined),
      vendor: (id?: string) => (id ? v.get(id) : undefined),
      location: (id?: string) => (id ? l.get(id) : undefined),
      block: (id?: string) => (id ? b.get(id) : undefined),
      user: (id?: string) => (id ? users.get(id) : undefined),
      currentLease: (tenantId: string) => state.leases.find((x) => x.tenantId === tenantId && !x.renewedTo && !x.terminated),
    };
  }, [state]);
}

export { leaseStatus };
