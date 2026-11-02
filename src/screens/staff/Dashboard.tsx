import { useNow } from '../../hooks/useNow';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  Building2, Check, Clock, Download, Grid2x2, House, MapPin, Plus, RefreshCw, ShieldCheck, TriangleAlert, Upload, UserRound, Users, Wrench, Briefcase,
} from 'lucide-react-native';
import { colors, radius, useBreakpoint } from '../../theme';
import { useLookup, useScope, useStore } from '../../store/AppContext';
import { useRouter } from '../../nav/router';
import { Page } from '../../components/shell';
import { Avatar, Badge, Button, Card, CardHeader, Grid, IconTile, Legend, Link, Segmented, Select, SegmentBar, T, Touch, useToast } from '../../components/ui';
import type { Tone } from '../../components/ui';
import { DataTable, DaysBadge, PriorityBadge, RequestStatusBadge } from '../../components/data';
import { BarChart, Donut, HBarList, LineChart } from '../../components/charts';
import { usePortfolio, usePropertyStats } from '../../lib/stats';
import { downloadCSV } from '../../lib/export';
import { ALL_CATEGORIES } from '../../data/seed';
import { MONTHS, addMonths, firstName, fmtDate, fmtShort, greeting, longToday, pct, timeAgo, daysUntil, parseDate } from '../../utils';

export default function DashboardScreen() {
  const now = useNow();
  const { state, me, sendLeaseReminder } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const { navigate } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const pf = usePortfolio();
  const props = usePropertyStats();
  const [range, setRange] = useState('30');
  const [reqFilter, setReqFilter] = useState<'all' | 'vendor' | 'urgent'>('all');

  const locName = state.locationFilter ? lookup.location(state.locationFilter)?.name : 'All locations';
  const lagos = scope.locations.filter((l) => l.city === 'Lagos').length;
  const abuja = scope.locations.length - lagos;
  const startedThisMonth = scope.currentLeases.filter((l) => { const d = parseDate(l.start); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).length;
  const topVacant = [...props].sort((a, b) => b.vacant - a.vacant)[0];
  const maintUnits = pf.units.filter((u) => u.status === 'maintenance');
  const avgOffline = maintUnits.length ? Math.round(maintUnits.reduce((s, u) => s + Math.max(1, -daysUntil(u.vacantSince ?? new Date().toISOString())), 0) / maintUnits.length) : 0;
  const newCount = pf.open.filter((r) => r.status === 'new').length;
  const assignedCount = pf.open.filter((r) => r.status === 'assigned').length;
  const progressCount = pf.open.filter((r) => r.status === 'in_progress').length;
  const urgent = pf.open.filter((r) => r.priority === 'urgent').length;

  const attention: { n: number; label: string; tone: 'danger' | 'warning' | 'info' | 'accent'; go: () => void }[] = ([
    { n: pf.expired.length, label: 'leases expired', tone: 'danger', go: () => navigate('leases', { filter: 'expired' }) },
    { n: pf.within30.length, label: 'leases expire in 30 days', tone: 'warning', go: () => navigate('leases', { filter: '30' }) },
    { n: newCount, label: 'new requests unassigned', tone: 'info', go: () => navigate('requests', { status: 'new' }) },
    { n: urgent, label: 'urgent requests', tone: 'danger', go: () => navigate('requests', { priority: 'urgent' }) },
    { n: pf.pendingTenants.length, label: 'tenants awaiting approval', tone: 'accent', go: () => navigate('tenants', { tab: 'pending' }) },
  ] as const).filter((a) => a.n > 0);

  const expiring = [...pf.expired, ...pf.within30, ...pf.within60].sort((a, b) => a.d - b.d).slice(0, 6);

  const catData = useMemo(() => {
    const counts = ALL_CATEGORIES.map((c) => ({ label: c, value: pf.open.filter((r) => r.category === c).length }));
    const main = counts.filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
    const rest = counts.filter((c) => c.value === 0);
    return [...main, ...(rest.length ? [{ label: rest.slice(0, 2).map((r) => r.label).join(' · '), value: 0, muted: true }] : [])];
  }, [pf.open]);

  const byProp = props.map((p) => ({ label: p.property.short.replace('Herbert Macaulay', 'H. Macaulay').replace('Gbagada Garden', 'Gbagada').replace('Aminu Kano', 'Aminu K.').replace('Palm Court', 'Palm Ct'), value: p.openRequests }));
  const maxReq = Math.max(...byProp.map((b) => b.value), 0);
  const topProp = props.find((p) => p.openRequests === maxReq && maxReq > 0);

  const trend = useMemo(() => Array.from({ length: 6 }).map((_, i) => {
    const d = addMonths(new Date(), i);
    const n = scope.currentLeases.filter((l) => { const e = parseDate(l.end); return e.getMonth() === d.getMonth() && e.getFullYear() === d.getFullYear(); }).length;
    return { label: MONTHS[d.getMonth()], value: n, color: i === 0 ? colors.danger : i === 1 ? colors.vizMaint : i === 2 ? colors.vizBronze : colors.vizSage, valueColor: i === 0 ? colors.danger : undefined };
  }), [scope.currentLeases]);

  const perf = useMemo(() => {
    const hist = [3.9, 3.5, 3.1, 2.9, 2.6];
    const sla = [71, 76, 80, 83, 87];
    const resolved = scope.requests.filter((r) => r.resolvedAt && now - parseDate(r.resolvedAt).getTime() < 30 * 86400000);
    const cur = resolved.length ? resolved.reduce((s, r) => s + (parseDate(r.resolvedAt!).getTime() - parseDate(r.createdAt).getTime()) / 86400000, 0) / resolved.length : 2.4;
    const within = resolved.length ? Math.round((resolved.filter((r) => (parseDate(r.resolvedAt!).getTime() - parseDate(r.createdAt).getTime()) / 86400000 <= 3).length / resolved.length) * 100) : 89;
    return [...hist.map((v, i) => ({ label: MONTHS[addMonths(new Date(), i - 5).getMonth()], sub: `${sla[i]}%${i === 0 ? ' SLA' : ''}`, value: v })), { label: MONTHS[new Date().getMonth()], sub: `${within}%`, value: Math.round(cur * 10) / 10 }];
  }, [scope.requests, now]);

  const recent = scope.requests
    .filter((r) => (reqFilter === 'vendor' ? r.status === 'new' : reqFilter === 'urgent' ? r.priority === 'urgent' || r.priority === 'high' : true))
    .filter((r) => r.status !== 'closed' || reqFilter === 'all')
    .slice(0, 6);

  const activityIcon = (area: string, action: string) => {
    if (/complet|resolv|closed|confirm/i.test(action)) return { icon: Check, tone: 'success' as Tone };
    if (/assign/i.test(action)) return { icon: Briefcase, tone: 'purple' as Tone };
    if (/submit|creat|add/i.test(action)) return { icon: Plus, tone: 'accent' as Tone };
    if (/renew/i.test(action)) return { icon: RefreshCw, tone: 'accent' as Tone };
    if (/upload/i.test(action)) return { icon: Upload, tone: 'info' as Tone };
    if (/approv/i.test(action)) return { icon: ShieldCheck, tone: 'success' as Tone };
    if (area === 'Tenants') return { icon: UserRound, tone: 'neutral' as Tone };
    return { icon: Clock, tone: 'neutral' as Tone };
  };
  const activity = state.logs.filter((l) => l.action !== 'Signed in').slice(0, 7);

  const exportCsv = () => {
    const ok = downloadCSV(`propertyhub-portfolio-${new Date().toISOString().slice(0, 10)}`, props.map((p) => ({
      Property: p.property.name, Location: lookup.location(p.property.locationId)?.name, Blocks: p.blocks, Units: p.total, Occupied: p.occupied, Vacant: p.vacant, Maintenance: p.maintenance, Occupancy: pct(p.occupied, p.total), 'Open requests': p.openRequests,
    })));
    toast(ok ? 'Portfolio summary downloaded' : 'Export is available on the web app', ok ? 'success' : 'info');
  };



  return (
    <Page>
      <View style={{ flexDirection: bp === 'mobile' ? 'column' : 'row', justifyContent: 'space-between', alignItems: bp === 'mobile' ? 'flex-start' : 'flex-end', gap: 12, marginBottom: 20 }}>
        <View>
          <T size={12.5} color={colors.subtext}>{longToday()} · {locName}</T>
          <T size={bp === 'mobile' ? 23 : 28} weight="bold" style={{ letterSpacing: -0.5, marginTop: 4 }}>{greeting()}, {firstName(me?.name ?? '')}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Select compact value={range} onChange={setRange} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} style={{ minWidth: 160 }} />
          <Button title="Export" icon={Download} variant="secondary" onPress={exportCsv} />
        </View>
      </View>

      {attention.length ? (
        <Card pad={16} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: bp === 'mobile' ? 'column' : 'row', alignItems: bp === 'mobile' ? 'flex-start' : 'center', gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 16, borderRightWidth: bp === 'mobile' ? 0 : 1, borderRightColor: colors.border }}>
              <IconTile icon={TriangleAlert} tone="danger" size={38} />
              <View>
                <T size={14} weight="semibold">Needs attention</T>
                <T size={12} color={colors.subtext}>{attention.length} items today</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1 }}>
              {attention.map((a) => {
                const [bg, fg] = { danger: [colors.dangerSoft, colors.danger], warning: [colors.warningSoft, colors.warning], info: [colors.infoSoft, colors.info], accent: [colors.accentSoft, colors.accentDeep] }[a.tone];
                return (
                  <Touch key={a.label} onPress={a.go} style={{ backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: fg + '30' }} hoverStyle={{ borderColor: fg }}>
                    <T size={13} weight="semibold" color={fg}><T size={13} weight="bold" color={fg}>{a.n}</T>  {a.label}</T>
                  </Touch>
                );
              })}
            </View>
          </View>
        </Card>
      ) : null}

      <Grid cols={{ mobile: 1, tablet: 2, desktop: 4 }} spans={[{ mobile: 1, tablet: 2, desktop: 1 }, { mobile: 1, tablet: 2, desktop: 3 }]}>
        <Card style={{ height: bp === 'desktop' ? undefined : undefined, flex: 1 }}>
          <CardHeader title="Occupancy rate" subtitle={`${pf.units.length} units across ${scope.blocks.length} blocks`} right={<Badge label="+2.1% vs last month" tone="success" size="sm" />} />
          <View style={{ alignItems: 'center', marginVertical: 8 }}>
            <Donut size={184} stroke={24} segments={[{ value: pf.occupied, color: colors.vizOccupied }, { value: pf.vacant, color: colors.vizVacant }, { value: pf.maintenance, color: colors.vizMaint }]}>
              <T size={30} weight="bold" style={{ letterSpacing: -0.8 }}>{pct(pf.occupied, pf.units.length)}</T>
              <T size={12} color={colors.subtext}>occupied</T>
            </Donut>
          </View>
          <View style={{ gap: 9, marginTop: 14 }}>
            {[['Occupied', pf.occupied, colors.vizOccupied], ['Vacant', pf.vacant, colors.vizVacant], ['Under maintenance', pf.maintenance, colors.vizMaint]].map(([l, v, c]) => (
              <View key={l as string} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c as string }} />
                <T size={13} color={colors.textSoft} style={{ flex: 1 }}>{l}</T>
                <T size={13} weight="bold">{v}</T>
              </View>
            ))}
          </View>
        </Card>
        <Grid cols={{ mobile: 1, tablet: 2, desktop: 3 }}>
          <Stat icon={MapPin} tone="primary" label="Total locations" value={scope.locations.length} sub={`Lagos ${lagos}${abuja ? ` · Abuja ${abuja}` : ''}`} onPress={() => navigate('locations')} />
          <Stat icon={Building2} tone="primary" label="Total blocks" value={scope.blocks.length} sub={`Across ${scope.properties.length} properties`} onPress={() => navigate('units')} />
          <Stat icon={Grid2x2} tone="primary" label="Total units" value={pf.units.length} sub="Studio to duplex" onPress={() => navigate('units')} />
          <Stat icon={House} tone="primary" label="Occupied units" value={pf.occupied} subNode={<T size={12} color={colors.subtext} style={{ marginTop: 2 }}><T size={12} weight="semibold" color={colors.success}>+{startedThisMonth}</T> this month</T>} />
          <Stat icon={House} tone="info" label="Vacant units" value={pf.vacant} sub={topVacant?.vacant ? `${topVacant.vacant} at ${topVacant.property.short}` : 'Fully let'} onPress={() => navigate('reports', { tab: 'occupancy' })} />
          <Stat icon={Wrench} tone="accent" label="Under maintenance" value={pf.maintenance} sub={`Avg ${avgOffline} days offline`} />
          <Stat icon={Users} tone="purple" label="Active tenants" value={pf.activeTenants.length} sub={`${pf.pendingTenants.length} awaiting approval`} onPress={() => navigate('tenants')} />
          <Stat icon={Clock} tone="accent" label="Expiring leases" value={pf.within30.length + pf.within60.length + pf.within90.length} highlight subNode={<T size={12} color={colors.subtext} style={{ marginTop: 2 }}>Next 90 days · <T size={12} weight="semibold" color={colors.danger}>{pf.expired.length} expired</T></T>} onPress={() => navigate('leases')} />
          <Stat icon={TriangleAlert} tone="danger" label="Open maintenance" value={pf.open.length} sub={`${newCount} new · ${assignedCount} assigned · ${progressCount} in progress`} onPress={() => navigate('maintenance')} />
        </Grid>
      </Grid>

      <View style={{ height: 16 }} />
      <Grid cols={{ mobile: 1, desktop: 3 }} spans={[{ mobile: 1, desktop: 2 }, 1]}>
        <Card pad={0}>
          <View style={{ padding: 20, paddingBottom: 0 }}>
            <CardHeader title="Lease expiration monitor" subtitle="Leases that need a renewal decision" right={<Link onPress={() => navigate('leases')}>View all leases</Link>} />
            <Grid cols={{ mobile: 2, tablet: 4 }} gap={12}>
              {[
                { label: 'Already expired', n: pf.expired.length, bg: colors.dangerSoft, fg: colors.danger, f: 'expired' },
                { label: 'Within 30 days', n: pf.within30.length, bg: colors.warningSoft, fg: colors.warning, f: '30' },
                { label: '31 – 60 days', n: pf.within60.length, bg: '#F6EEDD', fg: colors.accentDeep, f: '60' },
                { label: '61 – 90 days', n: pf.within90.length, bg: colors.cardAlt, fg: colors.textSoft, f: '90' },
              ].map((b) => (
                <Touch key={b.label} onPress={() => navigate('leases', { filter: b.f })} style={{ backgroundColor: b.bg, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: b.fg + '22' }} hoverStyle={{ borderColor: b.fg + '66' }}>
                  <T size={11} weight="bold" color={b.fg} upper>{b.label}</T>
                  <T size={26} weight="bold" color={b.fg} style={{ marginTop: 4 }}>{b.n}</T>
                </Touch>
              ))}
            </Grid>
          </View>
          <DataTable
            style={{ marginTop: 18 }}
            rows={expiring}
            keyOf={(x) => x.l.id}
            onRowPress={(x) => navigate('lease', { id: x.l.id })}
            columns={[
              { key: 't', title: 'Tenant', flex: 1.4, min: 170, render: (x) => { const t = lookup.tenant(x.l.tenantId)!; return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Avatar name={t.name} size={28} /><T size={13} weight="semibold" numberOfLines={1}>{t.name}</T></View>; } },
              { key: 'p', title: 'Property · Unit', flex: 1.3, min: 150, render: (x) => <T size={13} color={colors.textSoft}>{lookup.property(x.l.propertyId)?.short} · {lookup.unit(x.l.unitId)?.code}</T> },
              { key: 'e', title: 'Lease end', min: 100, render: (x) => <T size={13} color={colors.textSoft}>{fmtDate(x.l.end)}</T> },
              { key: 'd', title: 'Days remaining', min: 150, render: (x) => <DaysBadge days={x.d} /> },
              { key: 'a', title: '', min: 120, align: 'right', render: (x) => x.d < 0
                ? <Button title="Renew" size="sm" onPress={() => navigate('renew', { id: x.l.id })} />
                : <Button title="Send reminder" size="sm" variant="secondary" onPress={() => { sendLeaseReminder([x.l.id]); toast(`Reminder sent to ${lookup.tenant(x.l.tenantId)?.name}`); }} /> },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Occupancy by location" subtitle="Occupied · vacant · maintenance" />
          <View style={{ gap: 18 }}>
            {[...props].sort((a, b) => b.occupancy - a.occupancy).map((p) => (
              <Touch key={p.property.id} onPress={() => navigate('property', { id: p.property.id })} style={{ gap: 7 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T size={13} weight="semibold">{p.property.name}</T>
                  <T size={13} weight="bold" color={p.occupancy < 0.8 ? colors.warning : colors.text}>{pct(p.occupied, p.total)}</T>
                </View>
                <SegmentBar segments={[{ value: p.occupied, color: colors.vizOccupied }, { value: p.vacant, color: colors.vizVacant }, { value: p.maintenance, color: colors.vizMaint }]} height={8} />
                <T size={12} color={colors.subtext}>{lookup.location(p.property.locationId)?.name}{lookup.location(p.property.locationId)?.city === 'Abuja' ? ', Abuja' : ''} · {p.occupied} of {p.total} units</T>
              </Touch>
            ))}
          </View>
          <Legend style={{ marginTop: 18 }} items={[{ label: 'Occupied', color: colors.vizOccupied }, { label: 'Vacant', color: colors.vizVacant }, { label: 'Maintenance', color: colors.vizMaint }]} />
        </Card>
      </Grid>

      <View style={{ height: 16 }} />
      <Grid cols={{ mobile: 1, tablet: 2, desktop: 3 }}>
        <Card style={{ minHeight: 330 }}>
          <CardHeader title="Open requests by category" subtitle={`${pf.open.length} open requests`} />
          <HBarList data={catData} labelWidth={120} />
        </Card>
        <Card style={{ minHeight: 330 }}>
          <CardHeader title="Requests by location" subtitle="Open requests per property" right={topProp ? <Badge label={`${lookup.location(topProp.property.locationId)?.name} highest`} tone="accent" /> : null} />
          <BarChart height={240} data={byProp.map((b) => ({ ...b, color: b.value === maxReq && maxReq > 0 ? colors.vizMaint : '#2E7A62', bold: b.value === maxReq && maxReq > 0 }))} />
        </Card>
        <Card style={{ minHeight: 330 }}>
          <CardHeader title="Lease expiration trend" subtitle="Leases ending per month" />
          <BarChart height={240} data={trend} />
        </Card>
      </Grid>

      <View style={{ height: 16 }} />
      <Card pad={0}>
        <View style={{ padding: 20, flexDirection: bp === 'mobile' ? 'column' : 'row', justifyContent: 'space-between', alignItems: bp === 'mobile' ? 'flex-start' : 'center', gap: 12 }}>
          <View>
            <T size={15.5} weight="semibold">Recent maintenance requests</T>
            <T size={12.5} color={colors.subtext}>Newest first · {locName?.toLowerCase()}</T>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Segmented value={reqFilter} onChange={setReqFilter} options={[{ value: 'all', label: 'All' }, { value: 'vendor', label: 'Needs vendor' }, { value: 'urgent', label: 'Urgent' }]} />
            <Button title="View all" variant="secondary" size="sm" onPress={() => navigate('requests')} />
          </View>
        </View>
        <DataTable
          rows={recent}
          keyOf={(r) => r.id}
          onRowPress={(r) => navigate('request', { id: r.id })}
          columns={[
            { key: 'id', title: 'Request ID', min: 100, render: (r) => <T mono size={12.5} color={colors.primary}>{r.id}</T> },
            { key: 't', title: 'Tenant', flex: 1.3, min: 150, render: (r) => <T size={13} weight="semibold" numberOfLines={1}>{lookup.tenant(r.tenantId)?.name}</T> },
            { key: 'p', title: 'Property', flex: 1.3, min: 140, render: (r) => <T size={13} color={colors.textSoft} numberOfLines={1}>{lookup.property(r.propertyId)?.short}</T> },
            { key: 'u', title: 'Unit', min: 60, flex: 0.5, render: (r) => <T size={13} color={colors.textSoft}>{lookup.unit(r.unitId)?.code}</T> },
            { key: 'c', title: 'Category', min: 120, render: (r) => <T size={13} color={colors.textSoft}>{r.category}</T> },
            { key: 'd', title: 'Date', min: 80, flex: 0.7, render: (r) => <T size={13} color={colors.textSoft}>{fmtShort(r.createdAt)}</T> },
            { key: 'pr', title: 'Priority', min: 100, render: (r) => <PriorityBadge p={r.priority} /> },
            { key: 'v', title: 'Assigned vendor', flex: 1.3, min: 150, render: (r) => r.vendorId ? <T size={13} color={colors.textSoft} numberOfLines={1}>{lookup.vendor(r.vendorId)?.name}</T> : <Link onPress={() => navigate('request', { id: r.id, assign: '1' })}>Assign vendor</Link> },
            { key: 's', title: 'Status', min: 110, render: (r) => <RequestStatusBadge s={r.status} /> },
          ]}
        />
      </Card>

      <View style={{ height: 16 }} />
      <Grid cols={{ mobile: 1, desktop: 3 }} spans={[{ mobile: 1, desktop: 2 }, 1]}>
        <Card>
          <CardHeader title="Maintenance resolution performance" subtitle="Average days to resolve vs 3-day target" right={<Legend items={[{ label: 'Avg days', color: colors.primary }, { label: 'Target', color: colors.vizMaint }]} />} />
          <LineChart points={perf} target={3} unit="d" yMax={4.5} yTicks={[0, 2, 4]} height={280} />
        </Card>
        <Card>
          <CardHeader title="Recent activity" right={<Link onPress={() => navigate('logs')}>Audit log</Link>} />
          <View>
            {activity.map((a, i) => {
              const ic = activityIcon(a.area, a.action);
              return (
                <View key={a.id} style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <IconTile icon={ic.icon} tone={ic.tone} size={28} iconSize={13} />
                    {i < activity.length - 1 ? <View style={{ width: 1, flex: 1, backgroundColor: colors.border, marginVertical: 3 }} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 14 }}>
                    <T size={13} weight="semibold">{a.action} <T size={13} color={colors.textSoft}>{a.record !== '—' ? a.record : ''}</T></T>
                    <T size={12} color={colors.subtext}>{timeAgo(a.at)} · {a.user}</T>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      </Grid>
    </Page>
  );
}

const Stat = ({ icon, tone, label, value, sub, subNode, onPress, highlight }: { icon: any; tone: Tone; label: string; value: string | number; sub?: string; subNode?: React.ReactNode; onPress?: () => void; highlight?: boolean }) => (
  <Card onPress={onPress} style={[{ minHeight: 132 }, highlight && { borderColor: '#F0DDB5' }]} pad={18}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconTile icon={icon} tone={tone} size={32} />
      <T size={13} weight="medium" color={colors.textSoft}>{label}</T>
    </View>
    <T size={28} weight="bold" style={{ marginTop: 12, letterSpacing: -0.5 }}>{value}</T>
    {subNode ?? (sub ? <T size={12} color={colors.subtext} style={{ marginTop: 2 }}>{sub}</T> : null)}
  </Card>
);
