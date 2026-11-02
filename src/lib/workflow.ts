/**
 * The maintenance workflow, as the app shows it. The server (request_transition in
 * supabase/migrations/20261020000200_maintenance_workflow.sql) is the authority; this copy only decides
 * which buttons to offer, so keep the two in step.
 */
import type { MaintenanceRequest, RequestStatus, User } from '../types';

/** Still needs someone's attention. */
export const OPEN_STATUSES: RequestStatus[] = ['new', 'assigned', 'in_progress', 'disputed'];
/** Finished one way or another. */
export const DONE_STATUSES: RequestStatus[] = ['closed', 'cancelled'];

export const isOpen = (r: Pick<MaintenanceRequest, 'status'>) => OPEN_STATUSES.includes(r.status);

export type Transition = 'start' | 'complete' | 'confirm' | 'dispute' | 'reopen' | 'cancel' | 'close';

export const TRANSITION_TO: Record<Transition, RequestStatus> = {
  start: 'in_progress', complete: 'resolved', confirm: 'closed', dispute: 'disputed', reopen: 'in_progress', cancel: 'cancelled', close: 'closed',
};

/**
 * What `me` may do to this request now.
 * `managesProperty`: admin, or a manager linked to the request's property.
 */
export function allowedTransitions(r: MaintenanceRequest, me: User | null, myTenantId?: string): Transition[] {
  if (!me) return [];
  const mgr = me.role === 'super_admin' || (me.role === 'manager' && !!me.propertyIds?.includes(r.propertyId));
  const ct = me.role === 'caretaker' && !!me.propertyIds?.includes(r.propertyId) && (!r.caretakerId || r.caretakerId === me.id);
  const tenant = me.role === 'tenant' && !!myTenantId && r.tenantId === myTenantId;
  const out: Transition[] = [];
  if (r.status === 'new' && (tenant || mgr)) out.push('cancel');
  if (r.status === 'assigned' && (mgr || ct)) out.push('start');
  if (r.status === 'in_progress' && (mgr || ct)) out.push('complete');
  if (r.status === 'resolved' && tenant) out.push('confirm', 'dispute');
  if (r.status === 'resolved' && mgr) out.push('close');
  if (r.status === 'disputed' && mgr) out.push('reopen');
  return out;
}

export const canAssign = (r: MaintenanceRequest, me: User | null) =>
  !!me && (me.role === 'super_admin' || (me.role === 'manager' && !!me.propertyIds?.includes(r.propertyId)))
  && ['new', 'assigned', 'in_progress', 'disputed'].includes(r.status);

/** A random v4 UUID; used as an idempotency key, not for security. */
export function newClientKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    return (ch === 'x' ? n : (n & 0x3) | 0x8).toString(16);
  });
}
