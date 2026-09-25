import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ActivityLog, Announcement, AppNotification, AppState, Block, Category, DocFile, Lease, Location,
  MaintenanceRequest, OnboardingDraft, Priority, Property, RequestEvent, RequestStatus, Role, Settings,
  Tenant, Unit, User, Vendor,
} from '../types';
import { buildSeed, STATE_VERSION } from '../data/seed';
import { addDays, addMonths, fmtDate, leaseStatus, naira, toISODate, todayISO, uid } from '../utils';

const STORAGE_KEY = 'propertyhub_state_v3';

export type SignInResult = { ok: true; userId: string; needsTwoStep: boolean } | { ok: false; error: string };

export interface NewPropertyInput {
  name: string; type: Property['type']; description: string; address: string; locationId: string; city: string; state: string;
  blocks: string[]; managerId: string; amenities: string[];
}

export interface NewRequestInput {
  tenantId: string; category: Category; title: string; description: string; where: string;
  urgency: 'low' | 'medium' | 'urgent'; photos: number; caretakerAccess: boolean; access: string;
}

export interface RenewInput { start: string; end: string; rent: number; serviceCharge: number; notifyTenant: boolean; scheduleReminders: boolean }

interface Store {
  state: AppState;
  hydrated: boolean;
  me: User | null;
  myTenant: Tenant | null;
  // auth
  checkCredentials: (email: string, password: string) => SignInResult;
  startSession: (userId: string) => void;
  signOut: () => void;
  findAccount: (emailOrPhone: string) => User | null;
  resetPassword: (userId: string, password: string) => void;
  registerTenant: (input: { name: string; email: string; phone: string; password: string; invite: string }) => { ok: true; tenantId: string; userId: string } | { ok: false; error: string };
  // global
  setLocationFilter: (id: string | null) => void;
  resetDemo: () => void;
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
  submitOnboarding: (d: OnboardingDraft, approveNow: boolean) => string;
  approveTenant: (tenantId: string) => void;
  updateTenant: (id: string, patch: Partial<Tenant>) => void;
  deactivateTenant: (id: string) => void;
  moveTenant: (id: string, unitId: string) => void;
  // leases
  renewLease: (leaseId: string, input: RenewInput) => string;
  terminateLease: (leaseId: string) => void;
  sendLeaseReminder: (leaseIds: string[]) => number;
  setTenantIntent: (leaseId: string, intent: 'renew' | 'move_out') => void;
  // maintenance
  createRequest: (input: NewRequestInput) => string;
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

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => buildSeed());
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as AppState;
          if (parsed.version === STATE_VERSION) setState(parsed);
        }
      } catch {
        // fall back to fresh seed
      }
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state, hydrated]);

  const me = state.sessionUserId ? state.users.find((u) => u.id === state.sessionUserId) ?? null : null;
  const myTenant = me?.tenantId ? state.tenants.find((t) => t.id === me.tenantId) ?? null : null;

  const actorName = useCallback(() => {
    const s = stateRef.current;
    return s.users.find((u) => u.id === s.sessionUserId)?.name ?? 'System';
  }, []);

  /** Apply a mutation and append an audit-log entry in one update. */
  const mutate = useCallback((fn: (s: AppState) => AppState, log?: { action: string; record: string; area: ActivityLog['area'] }) => {
    setState((s) => {
      const next = fn(s);
      if (!log || next === s) return next;
      const user = s.users.find((u) => u.id === s.sessionUserId);
      const entry: ActivityLog = {
        id: uid('lg'), at: new Date().toISOString(), user: user?.name ?? 'System', ...log,
        device: user?.role === 'tenant' ? 'Tenant portal · Web' : '102.89.34.10 · Chrome, Windows',
      };
      return { ...next, logs: [entry, ...next.logs].slice(0, 600) };
    });
  }, []);

  const notify = (s: AppState, n: Omit<AppNotification, 'id' | 'at' | 'read'>): AppState => ({
    ...s,
    notifications: [{ ...n, id: uid('n'), at: new Date().toISOString(), read: false }, ...s.notifications],
  });

  const nextNumber = (ids: string[], prefix: string, pad: number) => {
    const max = ids.reduce((m, id) => Math.max(m, parseInt(id.replace(prefix, ''), 10) || 0), 0);
    return `${prefix}${String(max + 1).padStart(pad, '0')}`;
  };

  const store = useMemo<Store>(() => ({
    state, hydrated, me, myTenant,

    // ---------------- auth ----------------
    checkCredentials: (email, password) => {
      const q = email.trim().toLowerCase();
      const u = stateRef.current.users.find((x) => x.email.toLowerCase() === q || x.phone.replace(/\s/g, '') === q.replace(/\s/g, ''));
      if (!u) return { ok: false, error: 'We couldn’t find an account with that email or phone number.' };
      if (u.password !== password) return { ok: false, error: 'That password isn’t right. Try again or reset it.' };
      if (u.status === 'suspended') return { ok: false, error: 'This account has been suspended. Contact your administrator.' };
      return { ok: true, userId: u.id, needsTwoStep: u.twoStep };
    },
    startSession: (userId) => mutate((s) => ({
      ...s, sessionUserId: userId, locationFilter: null,
      users: s.users.map((u) => (u.id === userId ? { ...u, lastActive: new Date().toISOString(), status: u.status === 'invited' ? 'active' : u.status } : u)),
    }), { action: 'Signed in', record: '—', area: 'Security' }),
    signOut: () => setState((s) => ({ ...s, sessionUserId: null })),
    findAccount: (q) => {
      const v = q.trim().toLowerCase().replace(/\s/g, '');
      return stateRef.current.users.find((u) => u.email.toLowerCase() === v || u.phone.replace(/\s/g, '') === v) ?? null;
    },
    resetPassword: (userId, password) => setState((s) => ({ ...s, users: s.users.map((u) => (u.id === userId ? { ...u, password } : u)) })),
    registerTenant: ({ name, email, phone, password, invite }) => {
      const s = stateRef.current;
      if (s.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) return { ok: false, error: 'An account with this email already exists. Try signing in.' };
      // Invite codes look like PALM-A4-7Q2: property prefix + unit code
      let unit: Unit | undefined;
      const m = invite.trim().toUpperCase().match(/^([A-Z]+)-([A-Z]\d+)/);
      if (m) {
        const prop = s.properties.find((p) => p.short.toUpperCase().replace(/[^A-Z]/g, '').startsWith(m[1]));
        unit = prop ? s.units.find((u) => u.propertyId === prop.id && u.code === m[2]) : undefined;
      }
      const tenantId = uid('ten');
      const userId = uid('u');
      const code = nextNumber(s.tenants.map((t) => t.code), 'TN-', 5);
      const tenant: Tenant = {
        id: tenantId, code, name: name.trim(), email: email.trim(), phone: phone.trim(), dob: '1990-01-01', gender: 'Female', address: '',
        unitId: unit?.id, propertyId: unit?.propertyId, status: 'pending', onboarding: 'pending', selfSignup: true, joinedAt: todayISO(), language: 'English',
        nextOfKin: { name: '', relationship: '', phone: '', address: '' },
        employment: { status: 'Employed', employer: '', occupation: '', workAddress: '' },
        identification: { type: 'National ID (NIN slip)', number: '', verified: false },
        prefs: { smsUpdates: true, emailAnnouncements: true, whatsapp: false },
      };
      const user: User = { id: userId, name: tenant.name, email: tenant.email, phone: tenant.phone, password, role: 'tenant', access: 'Own tenancy', tenantId, twoStep: false, lastActive: new Date().toISOString(), status: 'active' };
      mutate((st) => notify({ ...st, tenants: [tenant, ...st.tenants], users: [...st.users, user] }, {
        audience: 'staff', category: 'Tenants', title: 'New tenant sign-up', body: `${tenant.name} registered${unit ? ` for ${s.properties.find((p) => p.id === unit!.propertyId)?.short} ${unit.code}` : ''} and is awaiting approval.`, meta: 'Tenants · Self sign-up', tone: 'purple', link: { name: 'tenant', params: { id: tenantId } },
      }), { action: 'Registered via self sign-up', record: tenant.name, area: 'Tenants' });
      return { ok: true, tenantId, userId };
    },

    // ---------------- global ----------------
    setLocationFilter: (id) => setState((s) => ({ ...s, locationFilter: id })),
    resetDemo: () => {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      setState({ ...buildSeed(), sessionUserId: stateRef.current.sessionUserId });
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
    saveDraft: (d) => setState((s) => ({ ...s, drafts: [{ ...d, savedAt: new Date().toISOString() }, ...s.drafts.filter((x) => x.id !== d.id)] })),
    discardDraft: (id) => setState((s) => ({ ...s, drafts: s.drafts.filter((d) => d.id !== id) })),
    submitOnboarding: (d, approveNow) => {
      const s0 = stateRef.current;
      const unit = s0.units.find((u) => u.id === d.allocation.unitId)!;
      const tenantId = uid('ten');
      const code = nextNumber(s0.tenants.map((t) => t.code), 'TN-', 5);
      const leaseId = nextNumber(s0.leases.map((l) => l.id), 'LS-', 4);
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
      const userId = uid('u');
      const user: User = { id: userId, name: tenant.name, email: tenant.email, phone: tenant.phone, password: 'demo1234', role: 'tenant', access: 'Own tenancy', tenantId, twoStep: false, lastActive: new Date().toISOString(), status: 'invited' };
      const prop = s0.properties.find((p) => p.id === unit.propertyId)!;
      mutate((s) => notify({
        ...s,
        tenants: [tenant, ...s.tenants],
        leases: [lease, ...s.leases],
        users: [...s.users, user],
        units: approveNow ? s.units.map((u) => (u.id === unit.id ? { ...u, status: 'occupied' as const, vacantSince: undefined } : u)) : s.units,
        drafts: s.drafts.filter((x) => x.id !== d.id),
        payments: approveNow ? [{ id: uid('pay'), tenantId, leaseId, label: 'Rent + service charge', amount: unit.rent + unit.serviceCharge, date: d.lease.start, method: 'Bank transfer', status: 'pending' as const }, ...s.payments] : s.payments,
      }, approveNow
        ? { audience: 'staff', category: 'Tenants', title: 'Onboarding complete', body: `${tenant.name} was approved for ${prop.short} ${unit.code}. Portal invite sent.`, meta: 'Tenants', tone: 'success', link: { name: 'tenant', params: { id: tenantId } } }
        : { audience: 'staff', category: 'Tenants', title: 'Tenant awaiting approval', body: `${tenant.name} completed onboarding for ${prop.short} ${unit.code}.`, meta: 'Tenants · Approval', tone: 'purple', link: { name: 'tenant', params: { id: tenantId } } }),
      { action: approveNow ? 'Approved new tenant' : 'Submitted tenant for approval', record: tenant.name, area: 'Tenants' });
      return tenantId;
    },
    approveTenant: (tenantId) => mutate((s) => {
      const t = s.tenants.find((x) => x.id === tenantId);
      if (!t) return s;
      const hasLease = s.leases.some((l) => l.tenantId === tenantId);
      const unit = s.units.find((u) => u.id === t.unitId);
      let leases = s.leases.map((l) => (l.tenantId === tenantId && l.draft ? { ...l, draft: false } : l));
      if (!hasLease && unit) {
        const id = nextNumber(s.leases.map((l) => l.id), 'LS-', 4);
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
    }, { action: 'Approved tenant application', record: stateRef.current.tenants.find((t) => t.id === tenantId)?.name ?? '', area: 'Tenants' }),
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
    renewLease: (leaseId, input) => {
      const s0 = stateRef.current;
      const newId = nextNumber(s0.leases.map((l) => l.id), 'LS-', 4);
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
    createRequest: (input) => {
      const s0 = stateRef.current;
      const id = nextNumber(s0.requests.map((r) => r.id), 'MR-', 4);
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
    markNotificationRead: (id) => setState((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
    markAllNotificationsRead: (audience) => setState((s) => ({ ...s, notifications: s.notifications.map((n) => (n.audience === audience ? { ...n, read: true } : n)) })),

    // ---------------- admin ----------------
    inviteUser: (u) => mutate((s) => ({ ...s, users: [...s.users, { id: uid('u'), name: u.name, email: u.email, phone: '', password: 'demo1234', role: u.role, access: u.access, propertyIds: u.propertyIds, twoStep: false, lastActive: new Date().toISOString(), status: 'invited' }] }), { action: `Invited ${u.name}`, record: u.access, area: 'Users' }),
    updateUser: (id, patch) => mutate((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }), { action: 'Updated team member', record: stateRef.current.users.find((u) => u.id === id)?.name ?? '', area: 'Users' }),
    updateSettings: (patch) => mutate((s) => ({ ...s, settings: { ...s.settings, ...patch } }), { action: 'Updated organisation settings', record: '—', area: 'Users' }),
  }), [state, hydrated, me, myTenant, mutate, actorName]);

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
