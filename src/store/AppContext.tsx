import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppState, Lease, MaintenanceRequest, MaintenanceStatus, NewRequestInput,
  OnboardTenantInput, Payment, Role, Tenant, User, Unit,
} from '../types';
import { buildSeed } from '../data/seed';
import { addMonths, currentPeriod, leaseStatus, todayISO, uid } from '../utils';

const STORAGE_KEY = 'estatehub_pms_state_v1';

interface StoreValue {
  state: AppState;
  currentUser: User | null;
  signIn: (userId: string) => void;
  signOut: () => void;
  onboardTenant: (input: OnboardTenantInput) => void;
  addMaintenanceRequest: (input: NewRequestInput) => void;
  updateMaintenanceStatus: (id: string, status: MaintenanceStatus, note?: string, cost?: number) => void;
  addMaintenanceNote: (id: string, text: string) => void;
  renewLease: (leaseId: string, months?: number) => void;
  terminateLease: (leaseId: string) => void;
  sendMessage: (conversationId: string, text: string) => void;
  getOrCreateConversation: (tenantId: string) => string;
  markConversationRead: (id: string) => void;
  recordPayment: (paymentId: string) => void;
  resetAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => ({ ...buildSeed(), hydrated: false }));

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as AppState;
          setState({ ...parsed, hydrated: true });
        } else {
          setState({ ...buildSeed(), hydrated: true });
        }
      } catch {
        setState({ ...buildSeed(), hydrated: true });
      }
    })();
  }, []);

  useEffect(() => {
    if (state.hydrated) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
    }
  }, [state]);

  const value = useMemo<StoreValue>(() => {
    const currentUser = state.sessionUserId
      ? state.users.find((u) => u.id === state.sessionUserId) ?? null
      : null;

    const pushActivity = (s: AppState, type: AppState['activities'][number]['type'], text: string, actor: string): AppState => ({
      ...s,
      activities: [{ id: uid('act'), type, text, createdAt: new Date().toISOString(), actor }, ...s.activities].slice(0, 200),
    });

    return {
      state,
      currentUser,

      signIn: (userId: string) => {
        setState((s) => ({ ...s, sessionUserId: userId }));
      },

      signOut: () => {
        setState((s) => ({ ...s, sessionUserId: null }));
      },

      onboardTenant: (input: OnboardTenantInput) => {
        setState((s) => {
          const unit = s.units.find((u) => u.id === input.unitId);
          if (!unit || unit.status === 'occupied') return s;
          const tenantId = uid('tenant');
          const leaseId = uid('lease');
          const endDate = addMonths(new Date(input.startDate), input.termMonths);
          const tenant: Tenant = {
            id: tenantId,
            name: input.name,
            email: input.email,
            phone: input.phone,
            unitId: unit.id,
            propertyId: unit.propertyId,
            occupation: input.occupation,
            avatarColor: ['#0B2545', '#1E9E6A', '#E8A33D', '#7C5CFC', '#E5484D', '#0E7C86'][s.tenants.length % 6],
            joinedAt: new Date().toISOString(),
            emergencyContact: { name: input.emergencyName, phone: input.emergencyPhone, relationship: input.emergencyRelationship },
            status: 'active',
          };
          const lease: Lease = {
            id: leaseId,
            tenantId,
            unitId: unit.id,
            propertyId: unit.propertyId,
            startDate: input.startDate,
            endDate: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`,
            rent: input.rent,
            deposit: input.deposit,
            termMonths: input.termMonths,
          };
          const payment: Payment = {
            id: uid('pay'),
            tenantId,
            unitId: unit.id,
            propertyId: unit.propertyId,
            amount: input.rent,
            period: currentPeriod(),
            dueDate: todayISO(),
            status: 'pending',
          };
          const convId = uid('conv');
          return {
            ...s,
            tenants: [tenant, ...s.tenants],
            leases: [lease, ...s.leases],
            payments: [payment, ...s.payments],
            units: s.units.map((u) => (u.id === unit.id ? { ...u, status: 'occupied' as const } : u)),
            conversations: [{ id: convId, tenantId, messages: [] }, ...s.conversations],
            activities: [
              { id: uid('act'), type: 'tenant' as const, text: `New tenant onboarded: ${input.name} moved into ${unit.unitNumber}`, createdAt: new Date().toISOString(), actor: 'System' },
              ...s.activities,
            ].slice(0, 200),
          };
        });
      },

      addMaintenanceRequest: (input: NewRequestInput) => {
        setState((s) => {
          const unit = s.units.find((u) => u.id === input.unitId);
          if (!unit) return s;
          const req: MaintenanceRequest = {
            id: uid('req'),
            ...input,
            propertyId: unit.propertyId,
            status: 'open',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            notes: [{ id: uid('note'), author: 'System', text: 'Request received and logged.', createdAt: new Date().toISOString() }],
          };
          return {
            ...s,
            maintenance: [req, ...s.maintenance],
            units: s.units.map((u) => (u.id === input.unitId && u.status === 'vacant' ? u : u)),
            activities: [
              { id: uid('act'), type: 'maintenance' as const, text: `New maintenance request: "${input.title}"${unit ? ` at ${unit.unitNumber}` : ''}`, createdAt: new Date().toISOString(), actor: 'System' },
              ...s.activities,
            ].slice(0, 200),
          };
        });
      },

      updateMaintenanceStatus: (id, status, note, cost) => {
        setState((s) => {
          const req = s.maintenance.find((r) => r.id === id);
          if (!req) return s;
          const updated: MaintenanceRequest = {
            ...req,
            status,
            updatedAt: new Date().toISOString(),
            cost: cost ?? req.cost ?? (status === 'resolved' ? 45000 : req.cost),
            notes: note
              ? [...req.notes, { id: uid('note'), author: 'Admin', text: note, createdAt: new Date().toISOString() }]
              : req.notes,
          };
          const unit = s.units.find((u) => u.id === req.unitId);
          return {
            ...s,
            maintenance: s.maintenance.map((r) => (r.id === id ? updated : r)),
            activities: [
              {
                id: uid('act'),
                type: 'maintenance' as const,
                text: `Request "${req.title}"${unit ? ` at ${unit.unitNumber}` : ''} ${status === 'resolved' ? 'resolved' : status === 'in_progress' ? 'moved to in-progress' : 'reopened'}`,
                createdAt: new Date().toISOString(),
                actor: 'Admin',
              },
              ...s.activities,
            ].slice(0, 200),
          };
        });
      },

      addMaintenanceNote: (id, text) => {
        setState((s) => ({
          ...s,
          maintenance: s.maintenance.map((r) =>
            r.id === id
              ? { ...r, notes: [...r.notes, { id: uid('note'), author: 'Admin', text, createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() }
              : r
          ),
        }));
      },

      renewLease: (leaseId, months = 12) => {
        setState((s) => {
          const lease = s.leases.find((l) => l.id === leaseId);
          if (!lease) return s;
          const base = new Date(lease.endDate + 'T00:00:00').getTime() > Date.now()
            ? new Date(lease.endDate + 'T00:00:00')
            : new Date();
          const newEnd = addMonths(base, months);
          const endDate = `${newEnd.getFullYear()}-${String(newEnd.getMonth() + 1).padStart(2, '0')}-${String(newEnd.getDate()).padStart(2, '0')}`;
          const tenant = s.tenants.find((t) => t.id === lease.tenantId);
          return {
            ...s,
            leases: s.leases.map((l) => (l.id === leaseId ? { ...l, endDate, terminated: false } : l)),
            activities: [
              { id: uid('act'), type: 'lease' as const, text: `Lease renewed for ${months} months: ${tenant?.name ?? 'Tenant'} (ends ${endDate})`, createdAt: new Date().toISOString(), actor: 'Admin' },
              ...s.activities,
            ].slice(0, 200),
          };
        });
      },

      terminateLease: (leaseId) => {
        setState((s) => {
          const lease = s.leases.find((l) => l.id === leaseId);
          if (!lease) return s;
          const tenant = s.tenants.find((t) => t.id === lease.tenantId);
          return {
            ...s,
            leases: s.leases.map((l) => (l.id === leaseId ? { ...l, terminated: true } : l)),
            tenants: s.tenants.map((t) => (t.id === lease.tenantId ? { ...t, status: 'former' as const } : t)),
            units: s.units.map((u) => (u.id === lease.unitId ? { ...u, status: 'vacant' as const } : u)),
            activities: [
              { id: uid('act'), type: 'lease' as const, text: `Lease terminated: ${tenant?.name ?? 'Tenant'} vacated ${lease.unitId ? '' : ''}unit. Unit marked vacant.`, createdAt: new Date().toISOString(), actor: 'Admin' },
              ...s.activities,
            ].slice(0, 200),
          };
        });
      },

      sendMessage: (conversationId, text) => {
        setState((s) => ({
          ...s,
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, messages: [...c.messages, { id: uid('msg'), senderId: s.sessionUserId ?? 'unknown', text, createdAt: new Date().toISOString(), read: false }] }
              : c
          ),
        }));
      },

      getOrCreateConversation: (tenantId) => {
        const existing = state.conversations.find((c) => c.tenantId === tenantId);
        if (existing) return existing.id;
        const id = uid('conv');
        setState((s) => ({ ...s, conversations: [{ id, tenantId, messages: [] }, ...s.conversations] }));
        return id;
      },

      markConversationRead: (id) => {
        setState((s) => ({
          ...s,
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, messages: c.messages.map((m) => ({ ...m, read: true })) } : c
          ),
        }));
      },

      recordPayment: (paymentId) => {
        setState((s) => {
          const pay = s.payments.find((p) => p.id === paymentId);
          if (!pay) return s;
          const tenant = s.tenants.find((t) => t.id === pay.tenantId);
          return {
            ...s,
            payments: s.payments.map((p) =>
              p.id === paymentId ? { ...p, status: 'paid' as const, paidDate: new Date().toISOString(), method: 'Bank Transfer' } : p
            ),
            activities: [
              { id: uid('act'), type: 'payment' as const, text: `Rent payment of ₦${pay.amount.toLocaleString()} recorded from ${tenant?.name ?? 'tenant'}`, createdAt: new Date().toISOString(), actor: 'Admin' },
              ...s.activities,
            ].slice(0, 200),
          };
        });
      },

      resetAll: () => {
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        setState({ ...buildSeed(), hydrated: true, sessionUserId: null });
      },
    };
  }, [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// ---------- Derived selectors ----------

export function useScopedPropertyIds(): string[] | null {
  const { state, currentUser } = useStore();
  if (!currentUser) return null;
  if (currentUser.role === 'super_admin') return null; // all
  if (currentUser.role === 'manager') return currentUser.propertyIds ?? [];
  const tenant = state.tenants.find((t) => t.id === currentUser.tenantId);
  return tenant ? [tenant.propertyId] : [];
}

export function leaseStatusOf(lease: Lease) {
  return leaseStatus(lease);
}

export function unitStatusLabel(u: Unit) {
  return u.status;
}
