import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  Building2, Download, Ellipsis, Grid2x2, List, MapPin, Pencil, Plus, Search, Users, Wrench, Eye, Check, Upload, X, CircleCheck, Minus,
} from 'lucide-react-native';
import { colors, radius, useBreakpoint } from '../../theme';
import { useLookup, useScope, useStore } from '../../store/AppContext';
import { useRouter } from '../../nav/router';
import { Page, PageHeader } from '../../components/shell';
import {
  Avatar, Badge, Button, Card, CardHeader, Checkbox, Chip, Dialog, Divider, EmptyState, Grid, Input, KV, Legend, Link, Menu, ProgressBar, Row, SegmentBar,
  Segmented, Select, T, Tabs, Touch, useToast, IconTile, Notice,
} from '../../components/ui';
import { DataTable, DaysBadge, FileRow, PriorityBadge, RequestStatusBadge, UnitBadge } from '../../components/data';
import { BuildingArt } from '../../components/art';
import { Donut, LineChart } from '../../components/charts';
import { usePropertyStats, PropertyStats } from '../../lib/stats';
import { downloadCSV } from '../../lib/export';
import type { PropertyType } from '../../types';
import { MONTHS, addMonths, daysUntil, fmtDate, leaseStatus, naira, nairaCompact, pct } from '../../utils';

const TYPES: PropertyType[] = ['Apartment complex', 'Luxury apartments', 'Block of flats', 'Estate', 'Serviced apartments'];

// ---------------------------------------------------------------- list / grid

export function PropertiesScreen() {
  const { state, me } = useStore();
  const lookup = useLookup();
  const scope = useScope();
  const stats = usePropertyStats();
  const { navigate } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const [view, setView] = useState<'grid' | 'list'>(bp === 'mobile' ? 'grid' : 'grid');
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('all');
  const [type, setType] = useState('all');
  const [occ, setOcc] = useState('any');
  const [sort, setSort] = useState('occ-asc');
  const canEdit = me?.role === 'super_admin' || me?.role === 'manager';

  const rows = useMemo(() => {
    let r = stats.filter((s) => (!q || s.property.name.toLowerCase().includes(q.toLowerCase())) && (loc === 'all' || s.property.locationId === loc) && (type === 'all' || s.property.type === type)
      && (occ === 'any' || (occ === 'full' ? s.occupancy === 1 : occ === 'high' ? s.occupancy >= 0.85 : s.occupancy < 0.85)));
    r = [...r].sort((a, b) => sort === 'occ-asc' ? a.occupancy - b.occupancy : sort === 'occ-desc' ? b.occupancy - a.occupancy : sort === 'units' ? b.total - a.total : a.property.name.localeCompare(b.property.name));
    return r;
  }, [stats, q, loc, type, occ, sort]);

  const totalUnits = stats.reduce((s, x) => s + x.total, 0);
  const totalOcc = stats.reduce((s, x) => s + x.occupied, 0);
  const totalBlocks = stats.reduce((s, x) => s + x.blocks, 0);

  const exportCsv = () => {
    const ok = downloadCSV('properties', rows.map((s) => ({ Property: s.property.name, Type: s.property.type, Location: lookup.location(s.property.locationId)?.name, Blocks: s.blocks, Units: s.total, Occupied: s.occupied, Vacant: s.vacant, Maintenance: s.maintenance, Occupancy: pct(s.occupied, s.total), 'Open requests': s.openRequests, Manager: lookup.user(s.property.managerId)?.name })));
    toast(ok ? 'Properties exported' : 'Export is available on the web app', ok ? 'success' : 'info');
  };

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Properties' }]}
        title="My properties"
        subtitle={`${stats.length} properties · ${totalBlocks} blocks · ${totalUnits} units · ${pct(totalOcc, totalUnits)} occupied`}
        actions={<>
          <Segmented value={view} onChange={setView} options={[{ value: 'grid', label: 'Grid', icon: Grid2x2 }, { value: 'list', label: 'List', icon: List }]} />
          {canEdit ? <Button title="Add property" icon={Plus} onPress={() => navigate('addProperty')} /> : null}
        </>}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <View style={{ flexGrow: 2, flexBasis: 240 }}><Input leftIcon={Search} value={q} onChangeText={setQ} placeholder="Search properties" /></View>
        <View style={{ flexGrow: 1, flexBasis: 150 }}><Select value={loc} onChange={setLoc} options={[{ value: 'all', label: 'All locations' }, ...scope.locations.map((l) => ({ value: l.id, label: l.name }))]} /></View>
        <View style={{ flexGrow: 1, flexBasis: 150 }}><Select value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...TYPES.map((t) => ({ value: t, label: t }))]} /></View>
        <View style={{ flexGrow: 1, flexBasis: 150 }}><Select value={occ} onChange={setOcc} options={[{ value: 'any', label: 'Any occupancy' }, { value: 'full', label: 'Fully let' }, { value: 'high', label: '85% and above' }, { value: 'low', label: 'Below 85%' }]} /></View>
        <View style={{ flexGrow: 1, flexBasis: 200 }}><Select value={sort} onChange={setSort} options={[{ value: 'occ-asc', label: 'Sort: Occupancy (low first)' }, { value: 'occ-desc', label: 'Sort: Occupancy (high first)' }, { value: 'units', label: 'Sort: Most units' }, { value: 'name', label: 'Sort: Name (A–Z)' }]} /></View>
      </View>

      {view === 'grid' ? (
        <Grid cols={{ mobile: 1, tablet: 2, desktop: 3 }}>
          {[...rows.map((s) => <PropertyCard key={s.property.id} s={s} canEdit={canEdit} />),
            canEdit ? (
              <Touch key="add" onPress={() => navigate('addProperty')} style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: radius.lg, minHeight: 340, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }} hoverStyle={{ backgroundColor: colors.card, borderColor: colors.primary }}>
                <IconTile icon={Plus} tone="primary" size={40} />
                <T size={14.5} weight="semibold">Add a property</T>
                <T size={12.5} color={colors.subtext} center>Set up blocks and units, then start onboarding tenants.</T>
              </Touch>
            ) : null]}
        </Grid>
      ) : (
        <Card pad={0}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 14 }}>
            <Button title="Export" icon={Download} variant="secondary" size="sm" onPress={exportCsv} />
          </View>
          <DataTable
            rows={rows}
            keyOf={(s) => s.property.id}
            onRowPress={(s) => navigate('property', { id: s.property.id })}
            columns={[
              { key: 'p', title: 'Property', flex: 2, min: 220, render: (s) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 7, backgroundColor: s.property.art.bg, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}><View style={{ width: 14, height: 20, backgroundColor: s.property.art.a }} /></View>
                  <View><T size={13} weight="semibold">{s.property.name}</T><T size={11.5} color={colors.subtext}>{s.property.type}</T></View>
                </View>) },
              { key: 'l', title: 'Location', min: 120, render: (s) => <T size={13} color={colors.textSoft}>{lookup.location(s.property.locationId)?.name}</T> },
              { key: 'b', title: 'Blocks', min: 70, flex: 0.5, render: (s) => <T size={13}>{s.blocks}</T> },
              { key: 'u', title: 'Units', min: 70, flex: 0.5, render: (s) => <T size={13}>{s.total}</T> },
              { key: 'o', title: 'Occ.', min: 60, flex: 0.5, render: (s) => <T size={13}>{s.occupied}</T> },
              { key: 'v', title: 'Vacant', min: 70, flex: 0.5, render: (s) => <T size={13}>{s.vacant}</T> },
              { key: 'm', title: 'Maint.', min: 70, flex: 0.5, render: (s) => <T size={13}>{s.maintenance}</T> },
              { key: 'r', title: 'Occupancy', min: 150, render: (s) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}><ProgressBar value={s.occupancy} style={{ flex: 1 }} color={s.occupancy < 0.8 ? colors.vizMaint : colors.primary} /><T size={12} weight="bold">{pct(s.occupied, s.total)}</T></View> },
              { key: 'q', title: 'Requests', min: 90, render: (s) => <Badge label={`${s.openRequests} open`} tone={s.openRequests > 5 ? 'warning' : 'neutral'} /> },
              { key: 'mg', title: 'Manager', min: 120, render: (s) => <T size={13} color={colors.textSoft}>{lookup.user(s.property.managerId)?.name}</T> },
            ]}
            footerRow={
              <View style={{ flexDirection: 'row', padding: 14, backgroundColor: colors.cardAlt, gap: 20, flexWrap: 'wrap' }}>
                <T size={13} weight="bold">Portfolio total</T>
                <T size={13} color={colors.textSoft}>{scope.locations.length} locations</T>
                <T size={13} color={colors.textSoft}>{totalBlocks} blocks</T>
                <T size={13} color={colors.textSoft}>{totalUnits} units</T>
                <T size={13} weight="bold">{pct(totalOcc, totalUnits)} occupied</T>
                <T size={13} color={colors.textSoft}>{stats.reduce((s, x) => s + x.openRequests, 0)} open requests</T>
              </View>
            }
          />
          <View style={{ padding: 14 }}><T size={12} color={colors.subtext}>Showing {rows.length} of {stats.length} properties</T></View>
        </Card>
      )}
      {rows.length === 0 ? <Card><EmptyState icon={Building2} title="No properties match" body="Try a different search or clear the filters." action={<Button title="Clear filters" variant="secondary" onPress={() => { setQ(''); setLoc('all'); setType('all'); setOcc('any'); }} />} /></Card> : null}
      {state.locationFilter ? <T size={12} color={colors.subtext} style={{ marginTop: 12 }}>Filtered to {lookup.location(state.locationFilter)?.name} from the top bar.</T> : null}
    </Page>
  );
}

function PropertyCard({ s, canEdit }: { s: PropertyStats; canEdit: boolean }) {
  const lookup = useLookup();
  const { navigate } = useRouter();
  const p = s.property;
  const loc = lookup.location(p.locationId);
  const highMaint = s.openRequests >= 6;
  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <Touch onPress={() => navigate('property', { id: p.id })}>
        <BuildingArt bg={p.art.bg} a={p.art.a} b={p.art.b} height={120} />
        <View style={{ position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 6 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 3 }}><T size={11} weight="semibold" color={colors.textSoft}>{p.type}</T></View>
          {highMaint ? <View style={{ backgroundColor: colors.card, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentDeep }} /><T size={11} weight="semibold" color={colors.accentDeep}>High maintenance</T></View> : null}
        </View>
      </Touch>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Touch onPress={() => navigate('property', { id: p.id })} style={{ flex: 1 }}>
            <T size={15} weight="semibold">{p.name}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}><MapPin size={12} color={colors.subtext} /><T size={12} color={colors.subtext}>{loc?.name}, {loc?.city}</T></View>
          </Touch>
          <Menu
            width={190}
            trigger={(open) => <Touch onPress={open} style={{ padding: 4, borderRadius: 6 }} hoverStyle={{ backgroundColor: colors.neutralSoft }}><Ellipsis size={18} color={colors.subtext} /></Touch>}
            items={[
              ...(canEdit ? [{ label: 'Edit property', icon: Pencil, onPress: () => navigate('property', { id: p.id, edit: '1' }) }, { label: 'Add block', icon: Plus, onPress: () => navigate('units', { propertyId: p.id, addBlock: '1' }) }, { label: 'Add unit', icon: Plus, onPress: () => navigate('units', { propertyId: p.id, add: '1' }) }] : []),
              { label: 'View tenants', icon: Users, onPress: () => navigate('tenants', { propertyId: p.id }) },
              { label: 'View maintenance', icon: Wrench, onPress: () => navigate('requests', { propertyId: p.id }) },
            ]}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
          {[['Blocks', s.blocks], ['Units', s.total], ['Occupied', s.occupied], ['Vacant', s.vacant], ['Maint.', s.maintenance]].map(([l, v]) => (
            <View key={l as string}>
              <T size={11} color={colors.subtext}>{l}</T>
              <T size={15} weight="bold" color={l === 'Occupied' ? colors.primary : l === 'Vacant' && (v as number) > 0 ? colors.info : l === 'Maint.' && (v as number) > 0 ? colors.accentDeep : colors.text}>{v}</T>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 14, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T size={12} color={colors.subtext}>Occupancy</T><T size={12} weight="bold">{pct(s.occupied, s.total)}</T></View>
          <ProgressBar value={s.occupancy} color={s.occupancy < 0.8 ? colors.vizMaint : colors.primary} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <Badge label={`${s.openRequests} active requests`} tone={highMaint ? 'warning' : s.openRequests ? 'success' : 'neutral'} dot />
          <T size={11.5} color={colors.subtext}>Manager · {lookup.user(p.managerId)?.name}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Button title="View property" size="sm" variant="soft" style={{ flex: 1.3 }} onPress={() => navigate('property', { id: p.id })} />
          <Button title="Tenants" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => navigate('tenants', { propertyId: p.id })} />
          <Button title="Maintenance" size="sm" variant="secondary" style={{ flex: 1.2 }} onPress={() => navigate('requests', { propertyId: p.id })} />
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------- details

export function PropertyDetailScreen({ id }: { id: string }) {
  const { state, me, updateProperty } = useStore();
  const lookup = useLookup();
  const { navigate, route } = useRouter();
  const toast = useToast();
  const stats = usePropertyStats().find((s) => s.property.id === id);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(route.params.edit === '1');
  const p = stats?.property;
  const [form, setForm] = useState({ name: p?.name ?? '', description: p?.description ?? '', managerId: p?.managerId ?? '', type: p?.type ?? 'Apartment complex' as PropertyType });
  if (!stats || !p) return <Page><Card><EmptyState icon={Building2} title="Property not found" action={<Button title="Back to properties" onPress={() => navigate('properties')} />} /></Card></Page>;
  const loc = lookup.location(p.locationId);
  const blocks = state.blocks.filter((b) => b.propertyId === p.id);
  const tenants = state.tenants.filter((t) => t.propertyId === p.id && t.status === 'active');
  const leases = state.leases.filter((l) => l.propertyId === p.id && !l.renewedTo && !l.terminated && !l.draft);
  const requests = state.requests.filter((r) => r.propertyId === p.id);
  const open = requests.filter((r) => ['new', 'assigned', 'in_progress'].includes(r.status));
  const expiring = leases.map((l) => ({ l, d: daysUntil(l.end) })).filter((x) => x.d <= 90).sort((a, b) => a.d - b.d);
  const vacant = stats.units.filter((u) => u.status !== 'occupied');
  const docs = state.documents.filter((d) => d.propertyId === p.id && d.folder === 'Property papers');
  const canEdit = me?.role === 'super_admin' || me?.role === 'manager';
  const managers = state.users.filter((u) => u.role === 'manager' || u.role === 'super_admin');

  const trend = Array.from({ length: 12 }).map((_, i) => {
    const d = addMonths(new Date(), i - 11);
    const base = stats.occupancy * 100;
    const v = Math.round(Math.max(60, Math.min(100, base - (11 - i) * 0.7 + ((i * 7) % 5) - 2)) * 10) / 10;
    return { label: i % 3 === 0 || i === 11 ? MONTHS[d.getMonth()] : '', value: i === 11 ? Math.round(base * 10) / 10 : v };
  });

  const saveEdit = () => {
    updateProperty(p.id, { name: form.name, description: form.description, managerId: form.managerId, type: form.type, short: form.name.split(' ').slice(0, 2).join(' ') });
    setEditing(false);
    toast('Property updated');
  };

  const openList = (
    <Card>
      <CardHeader title="Open maintenance" right={<Link onPress={() => navigate('requests', { propertyId: p.id })}>All {open.length}</Link>} />
      <View style={{ gap: 12 }}>
        {open.slice(0, 4).map((r) => (
          <Touch key={r.id} onPress={() => navigate('request', { id: r.id })} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <IconTile icon={Wrench} tone={r.priority === 'urgent' || r.priority === 'high' ? 'danger' : 'accent'} size={30} iconSize={14} />
            <View style={{ flex: 1 }}><T size={13} weight="semibold" numberOfLines={1}>{r.title}</T><T size={11.5} color={colors.subtext}>{r.id} · {lookup.unit(r.unitId)?.code} · {lookup.vendor(r.vendorId)?.name ?? 'Unassigned'}</T></View>
            {r.priority === 'urgent' ? <PriorityBadge p="urgent" /> : <RequestStatusBadge s={r.status} />}
          </Touch>
        ))}
        {!open.length ? <T size={12.5} color={colors.subtext}>No open requests. </T> : null}
      </View>
    </Card>
  );

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Properties', to: 'properties' }, { label: loc?.name ?? '', to: 'locations' }, { label: p.name }]} title="" />
      <Card pad={0} style={{ marginBottom: 16, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <View style={{ width: 200, minHeight: 150, flexGrow: 1, maxWidth: 260 }}><BuildingArt bg={p.art.bg} a={p.art.a} b={p.art.b} height={170} /></View>
          <View style={{ flex: 1, minWidth: 280, padding: 20, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <View style={{ flexShrink: 1 }}>
                <Row gap={10}><T size={24} weight="bold" style={{ letterSpacing: -0.4 }}>{p.name}</T><Badge label="Active" tone="success" dot /></Row>
                <Row gap={14} style={{ marginTop: 4 }} wrap>
                  <Row gap={4}><MapPin size={13} color={colors.subtext} /><T size={12.5} color={colors.subtext}>{p.address}</T></Row>
                  <Row gap={4}><Building2 size={13} color={colors.subtext} /><T size={12.5} color={colors.subtext}>{p.type} · {blocks.length} blocks</T></Row>
                </Row>
              </View>
              {canEdit ? (
                <Row gap={8} wrap>
                  <Button title="Edit" icon={Pencil} size="sm" variant="secondary" onPress={() => setEditing(true)} />
                  <Button title="Add block" size="sm" variant="secondary" onPress={() => navigate('units', { propertyId: p.id, addBlock: '1' })} />
                  <Button title="Add unit" icon={Plus} size="sm" onPress={() => navigate('units', { propertyId: p.id, add: '1' })} />
                </Row>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <Row gap={10}><Avatar name={lookup.user(p.managerId)?.name ?? '?'} size={34} /><KV label="Property manager" value={lookup.user(p.managerId)?.name} /></Row>
              <View style={{ minWidth: 200, flex: 1, maxWidth: 320, gap: 6 }}>
                <Row justify="space-between"><T size={11.5} color={colors.subtext}>Occupancy</T><T size={12.5} weight="bold">{pct(stats.occupied, stats.total)}</T></Row>
                <SegmentBar segments={[{ value: stats.occupied, color: colors.vizOccupied }, { value: stats.vacant, color: colors.vizVacant }, { value: stats.maintenance, color: colors.vizMaint }]} />
              </View>
              <KV label="Added" value={fmtDate(p.addedAt)} />
            </View>
          </View>
        </View>
        <View style={{ paddingHorizontal: 20 }}>
          <Tabs value={tab} onChange={(v) => {
            if (v === 'blocks') navigate('units', { propertyId: p.id });
            else if (v === 'tenants') navigate('tenants', { propertyId: p.id });
            else if (v === 'leases') navigate('leases', { propertyId: p.id });
            else if (v === 'maintenance') navigate('requests', { propertyId: p.id });
            else if (v === 'documents') navigate('documents', { propertyId: p.id });
            else if (v === 'reports') navigate('reports');
            else setTab(v);
          }} style={{ borderBottomWidth: 0 }} tabs={[
            { value: 'overview', label: 'Overview' }, { value: 'blocks', label: 'Blocks & Units', count: stats.total }, { value: 'tenants', label: 'Tenants', count: tenants.length },
            { value: 'leases', label: 'Leases' }, { value: 'maintenance', label: 'Maintenance', count: open.length }, { value: 'documents', label: 'Documents' }, { value: 'reports', label: 'Reports' },
          ]} />
        </View>
      </Card>

      <Grid cols={{ mobile: 2, tablet: 4, desktop: 7 }} gap={12}>
        {[
          { l: 'Total units', v: stats.total }, { l: 'Occupied', v: stats.occupied, c: colors.vizOccupied }, { l: 'Vacant', v: stats.vacant, c: colors.vizVacant }, { l: 'Maintenance', v: stats.maintenance, c: colors.vizMaint },
          { l: 'Active tenants', v: tenants.length }, { l: 'Expiring leases', v: expiring.length, warn: true }, { l: 'Open requests', v: open.length },
        ].map((x) => (
          <Card key={x.l} pad={14}>
            <Row gap={6}>{x.c ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: x.c }} /> : null}<T size={12} color={colors.subtext}>{x.l}</T></Row>
            <T size={24} weight="bold" color={x.warn && x.v ? colors.warning : colors.text} style={{ marginTop: 6 }}>{x.v}</T>
          </Card>
        ))}
      </Grid>

      <View style={{ height: 16 }} />
      <Grid cols={{ mobile: 1, tablet: 2, desktop: 3 }}>
        <Card style={{ minHeight: 250 }}>
          <CardHeader title="Unit status" />
          <Row gap={22} wrap>
            <Donut size={140} stroke={18} segments={[{ value: stats.occupied, color: colors.vizOccupied }, { value: stats.vacant, color: colors.vizVacant }, { value: stats.maintenance, color: colors.vizMaint }]}>
              <T size={26} weight="bold">{stats.total}</T>
            </Donut>
            <View style={{ gap: 10 }}>
              {[['Occupied', stats.occupied, colors.vizOccupied], ['Vacant', stats.vacant, colors.vizVacant], ['Maintenance', stats.maintenance, colors.vizMaint]].map(([l, v, c]) => (
                <Row key={l as string} gap={8}><View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: c as string }} /><T size={13} color={colors.textSoft}>{l}</T><T size={13} weight="bold">{v}</T></Row>
              ))}
            </View>
          </Row>
        </Card>
        <Card style={{ minHeight: 250 }}>
          <CardHeader title="Occupancy by block" right={<Link onPress={() => navigate('units', { propertyId: p.id })}>Unit map</Link>} />
          <View style={{ gap: 16 }}>
            {blocks.map((b) => {
              const bu = stats.units.filter((u) => u.blockId === b.id);
              const o = bu.filter((u) => u.status === 'occupied').length, v = bu.filter((u) => u.status === 'vacant').length, m = bu.filter((u) => u.status === 'maintenance').length;
              return (
                <View key={b.id} style={{ gap: 6 }}>
                  <Row justify="space-between"><T size={13} weight="semibold">{b.name}</T><T size={12} color={colors.subtext}>{o} occ · {v} vacant{m ? ` · ${m} maint` : ''}  <T size={12.5} weight="bold" color={colors.text}>{pct(o, bu.length)}</T></T></Row>
                  <SegmentBar segments={[{ value: o, color: colors.vizOccupied }, { value: v, color: colors.vizVacant }, { value: m, color: colors.vizMaint }]} />
                </View>
              );
            })}
          </View>
          <Legend style={{ marginTop: 16 }} items={[{ label: 'Occupied', color: colors.vizOccupied }, { label: 'Vacant', color: colors.vizVacant }, { label: 'Maintenance', color: colors.vizMaint }]} />
        </Card>
        <Card style={{ minHeight: 250 }}>
          <CardHeader title="Occupancy trend" right={<T size={12} color={colors.subtext}>Last 12 months</T>} />
          <LineChart points={trend} height={170} yMax={100} yTicks={[70, 100]} unit="%" highlightLast={false} />
        </Card>
      </Grid>

      <View style={{ height: 16 }} />
      <Grid cols={{ mobile: 1, tablet: 2, desktop: 3 }}>
        {openList}
        <Card>
          <CardHeader title="Leases expiring soon" right={<Link onPress={() => navigate('leases', { propertyId: p.id })}>All {expiring.length}</Link>} />
          <View style={{ gap: 12 }}>
            {expiring.slice(0, 4).map(({ l, d }) => (
              <Touch key={l.id} onPress={() => navigate('lease', { id: l.id })} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Avatar name={lookup.tenant(l.tenantId)?.name ?? ''} size={30} />
                <View style={{ flex: 1 }}><T size={13} weight="semibold">{lookup.tenant(l.tenantId)?.name} · {lookup.unit(l.unitId)?.code}</T><T size={11.5} color={colors.subtext}>{d < 0 ? 'Ended' : 'Ends'} {fmtDate(l.end)}</T></View>
                <DaysBadge days={d} />
              </Touch>
            ))}
            {!expiring.length ? <T size={12.5} color={colors.subtext}>No leases end in the next 90 days.</T> : null}
          </View>
        </Card>
        <Card>
          <CardHeader title="Vacant units" right={<Link onPress={() => navigate('units', { propertyId: p.id })}>Unit map</Link>} />
          <View style={{ gap: 12 }}>
            {vacant.slice(0, 4).map((u) => (
              <View key={u.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <View style={{ width: 34, height: 30, borderRadius: 7, backgroundColor: u.status === 'vacant' ? colors.infoSoft : colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}><T size={11.5} weight="bold" color={u.status === 'vacant' ? colors.info : colors.accentDeep}>{u.code}</T></View>
                <View style={{ flex: 1 }}><T size={13} weight="semibold">Flat {u.code} · {u.type}{u.status === 'maintenance' ? ' · under maintenance' : ''}</T><T size={11.5} color={colors.subtext}>{u.status === 'vacant' ? `Vacant ${Math.max(0, -daysUntil(u.vacantSince ?? ''))} days · ${nairaCompact(u.rent)}/yr` : `Offline since ${fmtDate(u.vacantSince)}`}</T></View>
                <Button title={u.status === 'vacant' ? 'Assign' : 'View'} size="sm" variant="secondary" onPress={() => (u.status === 'vacant' ? navigate('onboarding', { unitId: u.id }) : navigate('unit', { id: u.id }))} />
              </View>
            ))}
            {!vacant.length ? <T size={12.5} color={colors.subtext}>Every unit is let. </T> : null}
          </View>
        </Card>
      </Grid>

      <View style={{ height: 16 }} />
      <Grid cols={{ mobile: 1, tablet: 2 }}>
        <Card>
          <CardHeader title="About this property" />
          <T size={13} color={colors.textSoft} style={{ lineHeight: 20 }}>{p.description}</T>
          <Row wrap gap={8} style={{ marginTop: 14 }}>{p.amenities.map((a) => <Badge key={a} label={a} tone="primary" icon={Check} />)}</Row>
        </Card>
        <Card>
          <CardHeader title="Property papers" right={<Link onPress={() => navigate('documents', { propertyId: p.id })}>All documents</Link>} />
          <View style={{ gap: 8 }}>{docs.map((d) => <FileRow key={d.id} name={d.name} kind={d.kind} meta={`${(d.sizeKb / 1024).toFixed(1)} MB · ${d.folder}`} />)}</View>
        </Card>
      </Grid>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit property" subtitle={p.name} footer={<><Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} /><Button title="Save changes" onPress={saveEdit} /></>}>
        <View style={{ gap: 14 }}>
          <Input label="Property name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
          <Select label="Property type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={TYPES.map((t) => ({ value: t, label: t }))} />
          <Select label="Property manager" value={form.managerId} onChange={(v) => setForm({ ...form, managerId: v })} options={managers.map((m) => ({ value: m.id, label: m.name, sub: m.access }))} />
          <Input label="Description" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />
        </View>
      </Dialog>
    </Page>
  );
}

// ---------------------------------------------------------------- add property

const AMENITIES = ['24h power backup', 'Borehole water', 'Security post', 'Parking', 'CCTV', 'Elevator', 'Swimming pool', 'Gym', 'Garden', 'Housekeeping'];

export function AddPropertyScreen() {
  const { state, addProperty } = useStore();
  const { navigate, back } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const [f, setF] = useState({ name: '', type: 'Block of flats' as PropertyType, description: '', street: '', locationId: '', city: 'Lagos', state: 'Lagos State', blocks: 2, managerId: '', amenities: ['24h power backup', 'Borehole water', 'Security post', 'Parking'] });
  const [blockNames, setBlockNames] = useState(['Block A', 'Block B']);
  const [photos, setPhotos] = useState(2);
  const [docs, setDocs] = useState(['Certificate of Occupancy.pdf', 'Building approval plan.pdf']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const managers = state.users.filter((u) => u.role === 'manager' && u.status === 'active');

  const setBlocks = (n: number) => {
    const c = Math.max(1, Math.min(12, n));
    setF({ ...f, blocks: c });
    setBlockNames(Array.from({ length: c }).map((_, i) => blockNames[i] ?? `Block ${String.fromCharCode(65 + i)}`));
  };

  const sections = [
    { key: 'basic', label: 'Basic details', done: !!f.name && !!f.type },
    { key: 'address', label: 'Address', done: !!f.street && !!f.locationId },
    { key: 'structure', label: 'Structure & manager', done: !!f.managerId },
    { key: 'images', label: 'Images & documents', done: photos > 0 },
    { key: 'amenities', label: 'Amenities & notes', done: f.amenities.length > 0 },
  ];

  const create = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'Give the property a name.';
    if (!f.street.trim()) e.street = 'Enter the street address.';
    if (!f.locationId) e.locationId = 'Choose a location.';
    if (!f.managerId) e.managerId = 'Assign a property manager.';
    setErrors(e);
    if (Object.keys(e).length) { toast('Fill in the required fields first', 'danger'); return; }
    const loc = state.locations.find((l) => l.id === f.locationId)!;
    const id = addProperty({ name: f.name.trim(), type: f.type, description: f.description, address: `${f.street}, ${loc.name}, ${f.city}`, locationId: f.locationId, city: f.city, state: f.state, blocks: blockNames, managerId: f.managerId, amenities: f.amenities });
    toast(`${f.name} created — now add its units`);
    navigate('units', { propertyId: id, add: '1' });
  };

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: 'Properties', to: 'properties' }, { label: 'Add property' }]}
        title="Add a property"
        subtitle="Fields marked * are required. You can save a draft and finish later."
        actions={<><Button title="Cancel" variant="ghost" onPress={() => back('properties')} /><Button title="Save draft" variant="secondary" onPress={() => toast('Draft saved')} /><Button title="Create property" icon={Check} onPress={create} /></>}
      />
      <View style={{ flexDirection: bp === 'mobile' ? 'column' : 'row', gap: 18, alignItems: 'flex-start' }}>
        {bp !== 'mobile' ? (
          <Card pad={10} style={{ width: 210 }}>
            {sections.map((s, i) => (
              <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 8, backgroundColor: i === 0 ? colors.primaryTint : 'transparent' }}>
                {s.done ? <CircleCheck size={17} color={colors.primary} /> : <View style={{ width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, borderColor: colors.borderStrong }} />}
                <T size={12.5} weight={i === 0 ? 'semibold' : 'medium'} color={s.done ? colors.text : colors.subtext}>{s.label}</T>
              </View>
            ))}
          </Card>
        ) : null}
        <View style={{ flex: 1, gap: 16, width: '100%' }}>
          <Card>
            <CardHeader title="Basic details" subtitle="How the property appears across PropertyHub" />
            <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
              <Input label="Property name" required value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="e.g. Adeola Odeku Court" error={errors.name} />
              <Select label="Property type" required value={f.type} onChange={(v) => setF({ ...f, type: v })} options={TYPES.map((t) => ({ value: t, label: t }))} />
            </Grid>
            <Input fieldStyle={{ marginTop: 14 }} label="Description" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} multiline placeholder="Two blocks of 3-bedroom and 2-bedroom flats with 24-hour power backup, borehole water and gated parking." />
          </Card>
          <Card>
            <CardHeader title="Address" subtitle="Used for location grouping and reports" />
            <Input label="Street address" required value={f.street} onChangeText={(v) => setF({ ...f, street: v })} placeholder="14 Adeola Odeku Street" error={errors.street} />
            <Grid cols={{ mobile: 1, tablet: 3 }} gap={14} style={{ marginTop: 14 }}>
              <Select label="Location" required value={f.locationId} onChange={(v) => { const l = state.locations.find((x) => x.id === v)!; setF({ ...f, locationId: v, city: l.city, state: l.state }); }} options={state.locations.map((l) => ({ value: l.id, label: l.name, sub: l.city }))} error={errors.locationId} />
              <Input label="City" required value={f.city} onChangeText={(v) => setF({ ...f, city: v })} />
              <Input label="State" required value={f.state} onChangeText={(v) => setF({ ...f, state: v })} />
            </Grid>
            <T size={12} color={colors.subtext} style={{ marginTop: 10 }}>Need a new area? <Link size={12} onPress={() => navigate('locations', { create: '1' })}>Create a location</Link></T>
          </Card>
          <Card>
            <CardHeader title="Structure & manager" subtitle="Blocks are created now; add units to each block after saving." />
            <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <View style={{ gap: 6 }}>
                <T size={12.5} weight="semibold" color={colors.textSoft}>Number of blocks <T size={12.5} color={colors.danger}>*</T></T>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, height: 42 }}>
                  <Touch onPress={() => setBlocks(f.blocks - 1)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Minus size={15} color={colors.textSoft} /></Touch>
                  <T size={14} weight="semibold" style={{ width: 36, textAlign: 'center' }}>{f.blocks}</T>
                  <Touch onPress={() => setBlocks(f.blocks + 1)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Plus size={15} color={colors.textSoft} /></Touch>
                </View>
              </View>
              <View style={{ flex: 1, minWidth: 220, gap: 6 }}>
                <T size={12.5} weight="semibold" color={colors.textSoft}>Block names</T>
                <Row wrap gap={8}>
                  {blockNames.map((b, i) => <View key={i} style={{ backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 }}><T size={12.5} weight="semibold" color={colors.primary}>{b}</T></View>)}
                  <T size={11.5} color={colors.subtext} style={{ alignSelf: 'center' }}>Rename after saving</T>
                </Row>
              </View>
            </View>
            <Select fieldStyle={{ marginTop: 14 }} label="Property manager" required value={f.managerId} onChange={(v) => setF({ ...f, managerId: v })} error={errors.managerId}
              options={managers.map((m) => ({ value: m.id, label: m.name, sub: `Manages ${state.properties.filter((p) => p.managerId === m.id).length} properties · ${state.units.filter((u) => state.properties.find((p) => p.id === u.propertyId)?.managerId === m.id).length} units` }))}
              hint="Managers only see the properties assigned to them." />
          </Card>
          <Card>
            <CardHeader title="Images & documents" subtitle="JPG or PNG up to 10 MB; PDF up to 20 MB" />
            <Touch onPress={() => { setPhotos((n) => n + 1); toast('Photo added'); }} style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: radius.md, padding: 18, alignItems: 'center', gap: 6 }} hoverStyle={{ borderColor: colors.primary, backgroundColor: colors.primaryTint }}>
              <Upload size={18} color={colors.subtext} />
              <T size={13} weight="semibold">Drag property photos here</T>
              <T size={12} color={colors.subtext}>or <T size={12} weight="semibold" color={colors.primary}>browse files</T> · first image becomes the cover</T>
            </Touch>
            <Row gap={10} wrap style={{ marginTop: 12 }}>
              {Array.from({ length: photos }).map((_, i) => (
                <View key={i} style={{ width: 110, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                  <BuildingArt bg={['#DCE7E1', '#ECE3D2', '#DCE3ED'][i % 3]} a={['#2F5D4B', '#8A6A34', '#3E4F6E'][i % 3]} b={['#8A6A34', '#3E4F6E', '#2F5D4B'][i % 3]} height={70} />
                  {i === 0 ? <View style={{ position: 'absolute', top: 5, left: 5, backgroundColor: colors.card, borderRadius: 4, paddingHorizontal: 5 }}><T size={10} weight="semibold">Cover</T></View> : null}
                  <Touch onPress={() => setPhotos((n) => n - 1)} style={{ position: 'absolute', top: 4, right: 4, backgroundColor: colors.card, borderRadius: 10, padding: 2 }}><X size={12} color={colors.textSoft} /></Touch>
                </View>
              ))}
            </Row>
            <View style={{ gap: 8, marginTop: 14 }}>
              {docs.map((d) => <FileRow key={d} name={d} kind="pdf" meta="Property document" right={<Touch onPress={() => setDocs(docs.filter((x) => x !== d))}><X size={15} color={colors.subtext} /></Touch>} />)}
              <Link onPress={() => setDocs([...docs, `Survey plan ${docs.length + 1}.pdf`])}>+ Add document</Link>
            </View>
          </Card>
          <Card>
            <CardHeader title="Amenities & notes" />
            <Row wrap gap={8}>
              {AMENITIES.map((a) => <Chip key={a} label={a} active={f.amenities.includes(a)} onPress={() => setF({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] })} />)}
            </Row>
          </Card>
        </View>
      </View>
    </Page>
  );
}

export { Eye, Checkbox, Divider, Notice, UnitBadge, leaseStatus, naira };
