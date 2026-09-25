import { useMemo } from 'react';
import { useScope, useStore } from '../store/AppContext';
import type { Property, Unit } from '../types';
import { daysUntil, parseDate } from '../utils';

export interface PropertyStats {
  property: Property;
  units: Unit[];
  total: number;
  occupied: number;
  vacant: number;
  maintenance: number;
  occupancy: number; // 0..1
  blocks: number;
  openRequests: number;
  activeTenants: number;
}

export function usePropertyStats(): PropertyStats[] {
  const scope = useScope();
  const { state } = useStore();
  return useMemo(() => scope.properties.map((p) => {
    const units = state.units.filter((u) => u.propertyId === p.id);
    const occupied = units.filter((u) => u.status === 'occupied').length;
    return {
      property: p,
      units,
      total: units.length,
      occupied,
      vacant: units.filter((u) => u.status === 'vacant').length,
      maintenance: units.filter((u) => u.status === 'maintenance').length,
      occupancy: units.length ? occupied / units.length : 0,
      blocks: state.blocks.filter((b) => b.propertyId === p.id).length,
      openRequests: state.requests.filter((r) => r.propertyId === p.id && ['new', 'assigned', 'in_progress'].includes(r.status)).length,
      activeTenants: state.tenants.filter((t) => t.propertyId === p.id && t.status === 'active').length,
    };
  }), [scope.properties, state]);
}

export function usePortfolio() {
  const scope = useScope();
  return useMemo(() => {
    const units = scope.units;
    const occupied = units.filter((u) => u.status === 'occupied').length;
    const vacant = units.filter((u) => u.status === 'vacant').length;
    const maintenance = units.filter((u) => u.status === 'maintenance').length;
    const open = scope.requests.filter((r) => ['new', 'assigned', 'in_progress'].includes(r.status));
    const leaseDays = scope.currentLeases.map((l) => ({ l, d: daysUntil(l.end) }));
    const last30 = scope.requests.filter((r) => Date.now() - parseDate(r.createdAt).getTime() <= 30 * 86400000);
    return {
      units, occupied, vacant, maintenance,
      occupancy: units.length ? occupied / units.length : 0,
      open,
      last30,
      expired: leaseDays.filter((x) => x.d < 0),
      within30: leaseDays.filter((x) => x.d >= 0 && x.d <= 30),
      within60: leaseDays.filter((x) => x.d > 30 && x.d <= 60),
      within90: leaseDays.filter((x) => x.d > 60 && x.d <= 90),
      leaseDays,
      activeTenants: scope.tenants.filter((t) => t.status === 'active'),
      pendingTenants: scope.tenants.filter((t) => t.status === 'pending'),
    };
  }, [scope]);
}
