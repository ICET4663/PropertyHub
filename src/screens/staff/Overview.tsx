/**
 * Properties & tenants: each property with the manager assigned to it and the tenants living there.
 * Super Admins see every property and can filter by manager; managers see the properties they run.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Building2, ChevronDown, ChevronRight, ChevronUp, Grid2x2, House, Search, TriangleAlert, UserCog, Users } from 'lucide-react-native';
import { colors, radius, useBreakpoint } from '../../theme';
import { useLookup, useScope, useStore } from '../../store/AppContext';
import { useRouter } from '../../nav/router';
import { Page, PageHeader } from '../../components/shell';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Grid, IconTile, Input, Link, ProgressBar, Row, Select, T, Touch } from '../../components/ui';
import type { Tone } from '../../components/ui';
import { PropertyThumb } from '../../components/art';
import { DataTable, DaysBadge, TENANT_STATUS } from '../../components/data';
import { usePropertyStats, type PropertyStats } from '../../lib/stats';
import type { Tenant, User } from '../../types';
import { daysUntil, fmtDate, pct } from '../../utils';

/** Tenants shown under a property: the ones living there or waiting for approval. */
const LISTED: Tenant['status'][] = ['active', 'pending'];

interface PropertyRow {
  stats: PropertyStats;
  manager?: User;
  tenants: Tenant[];
}

export function OverviewScreen() {
  const { state, me } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const stats = usePropertyStats();
  const { bp } = useBreakpoint();
  const isAdmin = me?.role === 'super_admin';

  const [q, setQ] = useState('');
  const [managerFilter, setManagerFilter] = useState('all');
  const [open, setOpen] = useState<Set<string>>(() => new Set(stats.length <= 3 ? stats.map((s) => s.property.id) : []));

  const rows: PropertyRow[] = useMemo(() => stats.map((s) => ({
    stats: s,
    manager: lookup.user(s.property.managerId),
    tenants: state.tenants
      .filter((t) => t.propertyId === s.property.id && LISTED.includes(t.status))
      .sort((a, b) => (lookup.unit(a.unitId)?.code ?? '').localeCompare(lookup.unit(b.unitId)?.code ?? '', undefined, { numeric: true })),
  })), [stats, state.tenants, lookup]);

  // Everyone who manages at least one property in view, plus managers with nothing assigned yet.
  const managers = useMemo(() => {
    const ids = new Set(rows.map((r) => r.manager?.id).filter((x): x is string => !!x));
    const list = state.users.filter((u) => ids.has(u.id) || (isAdmin && u.role === 'manager' && u.status !== 'suspended'));
    return list.map((u) => {
      const mine = rows.filter((r) => r.manager?.id === u.id);
      return {
        user: u,
        properties: mine.length,
        units: mine.reduce((n, r) => n + r.stats.total, 0),
        occupied: mine.reduce((n, r) => n + r.stats.occupied, 0),
        tenants: mine.reduce((n, r) => n + r.tenants.filter((t) => t.status === 'active').length, 0),
      };
    }).sort((a, b) => b.properties - a.properties || a.user.name.localeCompare(b.user.name));
  }, [rows, state.users, isAdmin]);

  const unassigned = rows.filter((r) => !r.manager).length;

  const term = q.trim().toLowerCase();
  const tenantMatches = (t: Tenant) => !term || `${t.name} ${t.code} ${t.email} ${t.phone} ${lookup.unit(t.unitId)?.code ?? ''}`.toLowerCase().includes(term);
  const visible = rows
    .filter((r) => managerFilter === 'all' || (managerFilter === 'none' ? !r.manager : r.manager?.id === managerFilter))
    .map((r) => {
      const propertyHit = !term || `${r.stats.property.name} ${r.manager?.name ?? ''} ${lookup.location(r.stats.property.locationId)?.name ?? ''}`.toLowerCase().includes(term);
      return { ...r, propertyHit, shown: propertyHit ? r.tenants : r.tenants.filter(tenantMatches) };
    })
    .filter((r) => r.propertyHit || r.shown.length > 0);

  const totalTenants = rows.reduce((n, r) => n + r.tenants.filter((t) => t.status === 'active').length, 0);
  const pending = rows.reduce((n, r) => n + r.tenants.filter((t) => t.status === 'pending').length, 0);
  const units = rows.reduce((n, r) => n + r.stats.total, 0);
  const vacant = rows.reduce((n, r) => n + r.stats.vacant, 0);

  const toggle = (id: string) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allOpen = visible.length > 0 && visible.every((r) => open.has(r.stats.property.id));
  // A search that matches tenants opens their property so the matches are visible.
  const isOpen = (id: string) => open.has(id) || (!!term && visible.some((r) => r.stats.property.id === id && !r.propertyHit));

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Properties & tenants' }]}
        title="Properties & tenants"
        subtitle={isAdmin ? 'Every property, the manager assigned to it and the tenants living there' : 'Your properties and the tenants living in them'}
        actions={<>
          <View style={{ width: bp === 'mobile' ? '100%' : 260 }}>
            <Input leftIcon={Search} value={q} onChangeText={setQ} placeholder="Search property, manager or tenant" />
          </View>
          {isAdmin ? (
            <Select compact value={managerFilter} onChange={setManagerFilter} style={{ minWidth: 190 }}
              options={[
                { value: 'all', label: 'All managers' },
                ...managers.map((m) => ({ value: m.user.id, label: m.user.name, sub: `${m.properties} propert${m.properties === 1 ? 'y' : 'ies'}` })),
                ...(unassigned ? [{ value: 'none', label: 'No manager assigned' }] : []),
              ]} />
          ) : null}
        </>}
      />

      <Grid cols={{ mobile: 2, desktop: 4 }} gap={12}>
        <Stat icon={Building2} tone="primary" label={isAdmin ? 'Properties' : 'My properties'} value={rows.length} sub={`${scope.locations.length} location${scope.locations.length === 1 ? '' : 's'}`} />
        {isAdmin
          ? <Stat icon={UserCog} tone="purple" label="Property managers" value={managers.length} sub={unassigned ? `${unassigned} propert${unassigned === 1 ? 'y has' : 'ies have'} no manager` : 'Every property is covered'} warn={unassigned > 0} />
          : <Stat icon={Grid2x2} tone="primary" label="Units" value={units} sub={`${pct(units - vacant, units)} occupied`} />}
        <Stat icon={Users} tone="success" label="Active tenants" value={totalTenants} sub={pending ? `${pending} awaiting approval` : 'None awaiting approval'} />
        <Stat icon={House} tone="info" label="Vacant units" value={vacant} sub={`of ${units} units`} />
      </Grid>

      {isAdmin && managers.length ? (
        <Card style={{ marginTop: 16 }}>
          <CardHeader title="Property managers" subtitle="Tap a manager to see only their properties" right={managerFilter !== 'all' ? <Link onPress={() => setManagerFilter('all')}>Show all</Link> : null} />
          <Grid cols={{ mobile: 1, tablet: 2, desktop: 3 }} gap={12}>
            {managers.map((m) => {
              const on = managerFilter === m.user.id;
              return (
                <Touch key={m.user.id} onPress={() => setManagerFilter(on ? 'all' : m.user.id)}
                  style={{ borderWidth: on ? 1.5 : 1, borderColor: on ? colors.primary : colors.border, borderRadius: radius.md, padding: 14, gap: 10, backgroundColor: on ? colors.primaryTint : undefined }}
                  hoverStyle={{ borderColor: colors.primary }}>
                  <Row gap={10}>
                    <Avatar name={m.user.name} size={34} />
                    <View style={{ flex: 1 }}>
                      <T size={13.5} weight="semibold" numberOfLines={1}>{m.user.name}</T>
                      <T size={11.5} color={colors.subtext} numberOfLines={1}>{m.user.phone || m.user.email}</T>
                    </View>
                    {m.properties === 0 ? <Badge label="No properties" tone="neutral" size="sm" /> : null}
                  </Row>
                  <Row gap={0}>
                    {([['Properties', m.properties], ['Units', m.units], ['Tenants', m.tenants]] as const).map(([k, v]) => (
                      <View key={k} style={{ flex: 1 }}>
                        <T size={11} color={colors.subtext}>{k}</T>
                        <T size={16} weight="bold">{v}</T>
                      </View>
                    ))}
                  </Row>
                  {m.units ? <ProgressBar value={m.occupied / m.units} color={m.occupied / m.units < 0.8 ? colors.vizMaint : colors.primary} /> : null}
                </Touch>
              );
            })}
          </Grid>
        </Card>
      ) : null}

      <Row justify="space-between" style={{ marginTop: 20, marginBottom: 10 }}>
        <T size={15} weight="semibold">{visible.length} propert{visible.length === 1 ? 'y' : 'ies'}</T>
        {visible.length ? (
          <Link onPress={() => setOpen(allOpen ? new Set() : new Set(visible.map((r) => r.stats.property.id)))}>{allOpen ? 'Collapse all' : 'Expand all'}</Link>
        ) : null}
      </Row>

      {visible.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title={rows.length ? 'Nothing matches' : 'No properties yet'}
            body={rows.length ? 'Try another search or manager.' : isAdmin ? 'Add a property to start assigning managers and tenants.' : 'No property has been assigned to you yet. Ask a Super Admin to assign one.'}
            action={rows.length ? <Button title="Clear filters" variant="secondary" onPress={() => { setQ(''); setManagerFilter('all'); }} /> : null} />
        </Card>
      ) : (
        <View style={{ gap: 12 }}>
          {visible.map((r) => (
            <PropertyCard key={r.stats.property.id} row={r} tenants={r.shown} expanded={isOpen(r.stats.property.id)} onToggle={() => toggle(r.stats.property.id)}
              showManager={isAdmin} locationName={lookup.location(r.stats.property.locationId)?.name} />
          ))}
        </View>
      )}
    </Page>
  );
}

function PropertyCard({ row, tenants, expanded, onToggle, showManager, locationName }: {
  row: PropertyRow; tenants: Tenant[]; expanded: boolean; onToggle: () => void; showManager: boolean; locationName?: string;
}) {
  const { navigate } = useRouter();
  const lookup = useLookup();
  const { bp } = useBreakpoint();
  const { property: p, total, occupied, vacant, occupancy } = row.stats;
  const active = row.tenants.filter((t) => t.status === 'active').length;
  const waiting = row.tenants.length - active;
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <Touch onPress={onToggle} accessibilityLabel={`${p.name}, ${expanded ? 'hide' : 'show'} tenants`} style={{ padding: 16 }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
        <View style={{ flexDirection: bp === 'mobile' ? 'column' : 'row', gap: 14, alignItems: bp === 'mobile' ? 'stretch' : 'center' }}>
          <Row gap={12} style={{ flex: 1.4 }}>
            <PropertyThumb property={p} size={42} rounded={9} />
            <View style={{ flex: 1 }}>
              <T size={14.5} weight="semibold" numberOfLines={1}>{p.name}</T>
              <T size={12} color={colors.subtext} numberOfLines={1}>{locationName ? `${locationName} · ` : ''}{p.type}</T>
            </View>
            {bp === 'mobile' ? <Chevron size={18} color={colors.subtext} /> : null}
          </Row>

          {showManager ? (
            <Row gap={9} style={{ flex: 1 }}>
              {row.manager ? <Avatar name={row.manager.name} size={30} /> : <IconTile icon={TriangleAlert} tone="warning" size={30} iconSize={14} />}
              <View style={{ flex: 1 }}>
                <T size={11} color={colors.subtext}>Property manager</T>
                <T size={13} weight="semibold" color={row.manager ? colors.text : colors.warning} numberOfLines={1}>{row.manager?.name ?? 'Not assigned'}</T>
              </View>
            </Row>
          ) : null}

          <Row gap={18} style={{ flex: 1.2 }}>
            <Figure label="Units" value={total} />
            <Figure label="Tenants" value={active} />
            <Figure label="Vacant" value={vacant} />
            <View style={{ flex: 1, minWidth: 80, gap: 5 }}>
              <Row justify="space-between">
                <T size={11} color={colors.subtext}>Occupancy</T>
                <T size={11.5} weight="bold">{pct(occupied, total)}</T>
              </Row>
              <ProgressBar value={occupancy} color={occupancy < 0.8 ? colors.vizMaint : colors.primary} />
            </View>
          </Row>
          {bp === 'mobile' ? null : <Chevron size={18} color={colors.subtext} />}
        </View>
      </Touch>

      {expanded ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
          <Row justify="space-between" wrap style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <T size={13} weight="semibold">
              {`Tenants (${tenants.length}${tenants.length !== row.tenants.length ? ` of ${row.tenants.length}` : ''})`}
            </T>
            <Row gap={12}>
              {waiting ? <Badge label={`${waiting} awaiting approval`} tone="warning" size="sm" /> : null}
              <Link onPress={() => navigate('property', { id: p.id })}>Open property</Link>
            </Row>
          </Row>
          <DataTable
            dense
            rows={tenants}
            keyOf={(t) => t.id}
            onRowPress={(t) => navigate('tenant', { id: t.id })}
            empty={<View style={{ padding: 18 }}><T size={12.5} color={colors.subtext}>No tenants in this property yet.</T></View>}
            columns={[
              { key: 'n', title: 'Tenant', flex: 1.5, min: 180, render: (t) => (
                <Row gap={9}>
                  <Avatar name={t.name} size={28} />
                  <View style={{ flex: 1 }}>
                    <T size={13} weight="semibold" numberOfLines={1}>{t.name}</T>
                    <T size={11} color={colors.subtext} mono>{t.code}</T>
                  </View>
                </Row>
              ) },
              { key: 'u', title: 'Unit', min: 90, flex: 0.6, render: (t) => {
                const u = lookup.unit(t.unitId);
                return <T size={13} color={colors.textSoft}>{u ? `${lookup.block(u.blockId)?.name ?? ''} · ${u.code}`.replace(/^ · /, '') : '—'}</T>;
              } },
              { key: 'c', title: 'Phone', min: 130, render: (t) => <T size={13} color={colors.textSoft} numberOfLines={1}>{t.phone || '—'}</T> },
              { key: 'l', title: 'Lease ends', min: 150, render: (t) => {
                const lease = lookup.currentLease(t.id);
                if (!lease || lease.draft) return <T size={12.5} color={colors.subtext}>No lease</T>;
                return (
                  <View style={{ gap: 3 }}>
                    <T size={12.5} color={colors.textSoft}>{fmtDate(lease.end)}</T>
                    <DaysBadge days={daysUntil(lease.end)} />
                  </View>
                );
              } },
              { key: 's', title: 'Status', min: 130, render: (t) => <Badge label={TENANT_STATUS[t.status].label} tone={TENANT_STATUS[t.status].tone} dot /> },
              { key: 'go', title: '', min: 40, flex: 0.2, align: 'right', render: () => <ChevronRight size={16} color={colors.subtext} /> },
            ]}
          />
        </View>
      ) : null}
    </Card>
  );
}

const Figure = ({ label, value }: { label: string; value: number }) => (
  <View>
    <T size={11} color={colors.subtext}>{label}</T>
    <T size={15} weight="bold">{value}</T>
  </View>
);

const Stat = ({ icon, tone, label, value, sub, warn }: { icon: typeof Building2; tone: Tone; label: string; value: number; sub: string; warn?: boolean }) => (
  <Card pad={16}>
    <Row gap={10}>
      <IconTile icon={icon} tone={tone} size={30} />
      <T size={12.5} weight="medium" color={colors.textSoft} style={{ flex: 1 }} numberOfLines={1}>{label}</T>
    </Row>
    <T size={24} weight="bold" style={{ marginTop: 10, letterSpacing: -0.4 }}>{value}</T>
    <T size={11.5} color={warn ? colors.warning : colors.subtext} style={{ marginTop: 2 }} numberOfLines={2}>{sub}</T>
  </Card>
);
