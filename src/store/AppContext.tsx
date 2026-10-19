import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActivityLog, Announcement, AppNotification, AppState, Block, Category, DocFile, Lease, Location,
  MaintenanceRequest, OnboardingDraft, Priority, Property, RequestEvent, RequestStatus, Role, Settings,
  Tenant, Unit, User, Vendor,
} from '../types';
import { supabase } from '../lib/supabase';
import { deviceLabel, emptyState, loadAll, nextCode, pushChanges } from '../lib/db';
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
  urgency: 'low' | 'medium' | 'urgent'; photos: number; caretakerAccess: boolean; access: string;
}

export interface RenewInput { start: string; end: string; rent: number; serviceCharge: number; notifyTenant: boolean; scheduleReminders: boolean }

export interface SignUpInput { name: string; email: string; phone: string; password: string; invite: string }

interface Store {
  state: AppState;
  hydrated: boolean;
  me: User | null;
  myTenant: Tenant | null;
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
  // global
  setLocationFilter: (id: string | null) => void;
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
  submitOnboarding: (d: OnboardingDraft, approveNow: boolean) => Promise<string>;
  approveTenant: (tenantId: string) => void;
  updateTenant: (id: string, patch: Partial<Tenant>) => void;
  deactivateTenant: (id: string) => void;
  moveTenant: (id: string, unitId: string) => void;
  // leases
  renewLease: (leaseId: string, input: RenewInput) => Promise<string>;
  terminateLease: (leaseId: string) => void;
  sendLeaseReminder: (leaseIds: string[]) => number;
  setTenantIntent: (leaseId: string, intent: 'renew' | 'move_out') => void;
  // maintenance
  createRequest: (input: NewRequestInput) => Promise<string>;
  assignVendor: (id: string, vendorId: string, visit: { date: string; window: string }, note: string, notifyVendor: boolean, tellTenant: boolean) => void;
  setRequestStatus: (id: string, status: RequestStatus) => void;
  setRequestPriority: (id: string, p: Priority) => void;
  addComment: (id: string, text: string, shared: boolean) => void;
  tenantConfirm: (id: string, fixed: boolean, rating?: number) => void;
  // vendors, comms, docs
  addVendor: (v: Omit<Vendor, 'id' | 'completed' | 'avgDays' | 'rating' | 'ratingCount' | 'spendThisMonth'>) => void;
  setVendorStatus: (id: string, status: Vendor['status']) => void;
  sendAnnouncement: (a: Omit<Announcement, 'id' | 'sentAt' | 'readPct' | 'by'>) => void;
  addDocument: (d: Omit<DocFile, 'id' | 'date' | 'uploadedBy'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (audience: string) => void;
  // admin
  inviteUser: (u: { name: string; email: string; role: Role; access: string; propertyIds?: string[] }) => void;
  updateUser: (id: string, patch: Partial<User>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

const Ctx = createContext<Store | null>(null);

/** Supabase auth messages, in the app's voice. */
function authError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password don’t match. Try again or reset your password.';
  if (m.includes('email not confirmed')) return 'Confirm your email address first. Sign up again to get a new code.';
  if (m.includes('signups not allowed')) return 'We couldn’t find an account with that email.';
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('expired') || (m.includes('invalid') && m.includes('token'))) return 'That code isn’t right or has expired. Request a new one.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Can’t reach the server. Check your connection and try again.';
  return message;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const stateRef = useRef(state); // kept current by setNow, the only way state changes
  const writes = useRef<Promise<void>>(Promise.resolve());

  const setNow = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /**
   * Loads what this account may see. Tenants are linked to their tenancy first (no-op once linked).
   * `enter: false` loads the data but stays on the auth screens (used after sign-up).
   */
  const open = useCallback(async (userId: string, enter = true): Promise<AuthResult> => {
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
      return { ok: false, error: authError(e instanceof Error ? e.message : String(e)) };
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
            if (!r.ok) setSyncError(r.error);
          }
          setHydrated(true);
        }, 0);
      } else if (event === 'SIGNED_OUT') {
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

  const store = useMemo<Store>(() => ({
    state, hydrated, me, myTenant, syncError,
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
      await supabase.auth.signOut();
      setNow(emptyState());
    },

    // ---------------- global ----------------
    setLocationFilter: (id) => setNow({ ...stateRef.current, locationFilter: id }),


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
    submitOnboarding: async (d, approveNow) => {
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
      return tenantId;
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

    // ---------------- maintenance ----------------
    createRequest: async (input) => {
      const id = await nextCode('request');
      const s0 = stateRef.current;
      const t = s0.tenants.find((x) => x.id === input.tenantId)!;
      const unit = s0.units.find((u) => u.id === t.unitId)!;
      const priority: Priority = input.urgency === 'urgent' ? 'urgent' : input.urgency === 'medium' ? 'medium' : 'low';
      const nowIso = new Date().toISOString();
      const req: MaintenanceRequest = {
        id, tenantId: t.id, unitId: unit.id, propertyId: unit.propertyId, category: input.category, title: input.title, description: input.description,
        where: input.where, priority, status: 'new', createdAt: nowIso, updatedAt: nowIso, photos: input.photos, access: input.access, caretakerAccess: input.caretakerAccess,
        events: [{ id: uid('ev'), kind: 'created', text: `Request submitted by ${t.name}`, by: `${s0.users.find((u) => u.id === s0.sessionUserId)?.role === 'tenant' ? 'Tenant portal' : 'Logged by staff'} · ${input.photos} photos attached`, at: nowIso }],
      };
      const prop = s0.properties.find((p) => p.id === unit.propertyId)!;
      mutate((s) => notify({ ...s, requests: [req, ...s.requests] }, {
        audience: 'staff', category: 'Maintenance', title: priority === 'urgent' ? 'Urgent request' : 'New maintenance request',
        body: `${id}: ${input.title.toLowerCase()} at ${prop.short} ${unit.code}.`, meta: `Maintenance · ${input.category}`, tone: priority === 'urgent' ? 'danger' : 'info', link: { name: 'request', params: { id } },
      }), { action: 'Submitted maintenance request', record: id, area: 'Maintenance' });
      return id;
    },
    assignVendor: (id, vendorId, visit, note, _notifyVendor, tellTenant) => mutate((s) => {
      const r = s.requests.find((x) => x.id === id);
      const v = s.vendors.find((x) => x.id === vendorId);
      if (!r || !v) return s;
      const who = s.users.find((u) => u.id === s.sessionUserId)?.name ?? 'System';
      const ev: RequestEvent[] = [{ id: uid('ev'), kind: 'vendor', text: `${v.name} assigned · visit ${fmtDate(visit.date)}, ${visit.window}`, by: who, at: new Date().toISOString(), shared: tellTenant }];
      if (note.trim()) ev.push({ id: uid('ev'), kind: 'comment', text: note.trim(), by: who, at: new Date().toISOString(), internal: true });
      let next: AppState = {
        ...s,
        requests: s.requests.map((x) => (x.id === id ? { ...x, vendorId, visit, status: x.status === 'new' ? 'assigned' : x.status, updatedAt: new Date().toISOString(), events: [...x.events.filter((e) => e.kind !== 'waiting'), ...ev] } : x)),
      };
      if (tellTenant) next = notify(next, { audience: r.tenantId, category: 'My requests', title: `${v.name} is booked for ${fmtDate(visit.date)}, ${visit.window}.`, body: `They will fix: ${r.title.toLowerCase()}.`, meta: `My requests · ${who}`, tone: 'warning', link: { name: 'myRequests' } });
      return next;
    }, { action: `Assigned vendor ${stateRef.current.vendors.find((v) => v.id === vendorId)?.name}`, record: id, area: 'Maintenance' }),
    setRequestStatus: (id, status) => mutate((s) => {
      const r = s.requests.find((x) => x.id === id);
      if (!r) return s;
      const label = { new: 'New', assigned: 'Assigned', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' }[status];
      const who = s.users.find((u) => u.id === s.sessionUserId)?.name ?? 'System';
      let next: AppState = {
        ...s,
        requests: s.requests.map((x) => (x.id === id ? { ...x, status, updatedAt: new Date().toISOString(), resolvedAt: status === 'resolved' || status === 'closed' ? (x.resolvedAt ?? new Date().toISOString()) : undefined, cost: status === 'resolved' ? (x.cost ?? x.estimate) : x.cost, events: [...x.events, { id: uid('ev'), kind: 'status' as const, text: `Status changed to ${label}`, by: who, at: new Date().toISOString(), shared: true }] } : x)),
      };
      if (status === 'resolved') next = notify(next, { audience: r.tenantId, category: 'My requests', title: 'Your request was marked as fixed.', body: `${r.title} (${r.id}). Please confirm it’s working.`, meta: 'My requests', tone: 'success', link: { name: 'myRequests' } });
      return next;
    }, { action: `Changed status to ${status.replace('_', ' ')}`, record: id, area: 'Maintenance' }),
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
    tenantConfirm: (id, fixed, rating) => mutate((s) => {
      const r = s.requests.find((x) => x.id === id);
      if (!r) return s;
      const t = s.tenants.find((x) => x.id === r.tenantId);
      const unit = s.units.find((u) => u.id === r.unitId);
      const next: AppState = {
        ...s,
        requests: s.requests.map((x) => (x.id === id ? {
          ...x, status: fixed ? 'closed' : 'in_progress', rating: fixed ? rating : x.rating, updatedAt: new Date().toISOString(),
          events: [...x.events, { id: uid('ev'), kind: 'status' as const, text: fixed ? `Tenant confirmed the fix${rating ? ` · rated ${rating}/5` : ''} — request closed` : 'Tenant reported the issue is still a problem — reopened', by: t?.name ?? 'Tenant', at: new Date().toISOString(), shared: true }],
        } : x)),
      };
      return notify(next, { audience: 'staff', category: 'Maintenance', title: fixed ? 'Tenant confirmed fix' : 'Request reopened by tenant', body: `${id}: ${r.title.toLowerCase()} at ${s.properties.find((p) => p.id === r.propertyId)?.short} ${unit?.code}.`, meta: 'Maintenance', tone: fixed ? 'success' : 'warning', link: { name: 'request', params: { id } } });
    }, { action: fixed ? 'Confirmed request fixed' : 'Reopened request', record: id, area: 'Maintenance' }),

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
    addDocument: (d) => mutate((s) => ({ ...s, documents: [{ ...d, id: uid('doc'), date: todayISO(), uploadedBy: s.users.find((u) => u.id === s.sessionUserId)?.name ?? 'System' }, ...s.documents] }), { action: 'Uploaded document', record: d.name, area: 'Properties' }),
    markNotificationRead: (id) => mutate((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n)) })),
    markAllNotificationsRead: (audience) => mutate((s) => ({ ...s, notifications: s.notifications.map((n) => (n.audience === audience && !n.read ? { ...n, read: true } : n)) })),

    // ---------------- admin ----------------
    // Creating a login needs the secret key, so it has to run in a server function (not built yet).
    inviteUser: (u) => setSyncError(`Couldn’t invite ${u.name}: staff invites need a server function that isn’t set up yet. Add them in Supabase → Authentication for now.`),
    updateUser: (id, patch) => mutate((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }), { action: 'Updated team member', record: stateRef.current.users.find((u) => u.id === id)?.name ?? '', area: 'Users' }),
    updateSettings: (patch) => mutate((s) => ({ ...s, settings: { ...s.settings, ...patch } }), { action: 'Updated organisation settings', record: '—', area: 'Users' }),
  }), [state, hydrated, me, myTenant, syncError, mutate, actorName, open, setNow]);

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
