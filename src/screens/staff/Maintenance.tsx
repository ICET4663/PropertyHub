import { useNow } from '../../hooks/useNow';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  Briefcase, Check, CircleCheck, Clock, Download, Ellipsis, Mail, MessageSquare, Pause, Phone, Play, Plus, Search, Send, Star,
  TriangleAlert, Wrench, X, Zap, ChevronRight, Hourglass, Pencil,
} from 'lucide-react-native';
import { colors, radius, useBreakpoint } from '../../theme';
import { useLookup, useScope, useStore } from '../../store/AppContext';
import { useRouter } from '../../nav/router';
import { LiveTag, Page, PageHeader } from '../../components/shell';
import { useMessageTenant } from '../Messages';
import {
  Avatar, Badge, Button, CallButton, Card, CardHeader, Checkbox, Chip, Dialog, EmptyState, Grid, IconTile, Input, KV, Link, Menu, Notice, Row, Segmented, Select,
  T, Tabs, Touch, useToast,
} from '../../components/ui';
import { PhotoPicker, RequestPhotos } from '../../components/files';
import { TRANSITION_LABEL, TransitionDialog } from '../../components/requests';
import { allowedTransitions, canAssign, isOpen, newClientKey, type Transition } from '../../lib/workflow';
import type { PickedFile } from '../../lib/files';
import { DataTable, Pagination, PRIORITY, PriorityBadge, REQ_STATUS, RequestStatusBadge, usePaged } from '../../components/data';
import { BarChart, Donut, HBarList } from '../../components/charts';
import { usePortfolio } from '../../lib/stats';
import { downloadCSV } from '../../lib/export';
import { ALL_CATEGORIES } from '../../data/seed';
import type { Category, MaintenanceRequest, Priority, RequestStatus, Vendor } from '../../types';
import { addDays, fmtDate, fmtShort, fmtStamp, naira, nairaCompact, parseDate, toISODate } from '../../utils';

const hoursBetween = (a: string, b: string) => (parseDate(b).getTime() - parseDate(a).getTime()) / 3600000;

// ---------------------------------------------------------------- Overview

export function MaintenanceOverviewScreen() {
  const { me } = useStore();
  const scope = useScope();
  const pf = usePortfolio();
  const { navigate } = useRouter();
  const [range, setRange] = useState('30');
  const [createOpen, setCreateOpen] = useState(false);
  const recent = pf.last30;
  const byStatus = (s: RequestStatus) => recent.filter((r) => r.status === s).length;
  const resolved = scope.requests.filter((r) => r.resolvedAt);
  const avgRes = resolved.length ? resolved.reduce((s, r) => s + hoursBetween(r.createdAt, r.resolvedAt!), 0) / resolved.length / 24 : 0;
  const canCreate = me?.role !== 'accountant';

  const catCounts = ALL_CATEGORIES.map((c) => ({ label: c, value: recent.filter((r) => r.category === c).length })).sort((a, b) => b.value - a.value).concat([{ label: 'Other', value: recent.filter((r) => r.category === 'Other').length }]);
  const byProp = scope.properties.map((p) => ({ label: p.short, value: recent.filter((r) => r.propertyId === p.id).length, id: p.id })).sort((a, b) => b.value - a.value);
  const top = byProp[0];
  const topPlumbing = top ? recent.filter((r) => r.propertyId === top.id && r.category === 'Plumbing').length : 0;
  const targetDays: Partial<Record<Category, number>> = { 'Building repairs': 3, Generator: 2, 'Air conditioning': 3, 'Water supply': 2, Plumbing: 2, Electrical: 2, Cleaning: 1, Security: 1, Pests: 2 };
  const resByCat = ALL_CATEGORIES.map((c) => {
    const rs = resolved.filter((r) => r.category === c);
    const v = rs.length ? rs.reduce((s, r) => s + hoursBetween(r.createdAt, r.resolvedAt!), 0) / rs.length / 24 : 0;
    const target = targetDays[c] ?? 3;
    return { label: c, value: Math.round(v * 10) / 10, display: `${(Math.round(v * 10) / 10).toFixed(1)}d`, color: v > target * 1.2 ? colors.danger : v > target ? colors.vizMaint : colors.primary };
  }).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);



  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Maintenance' }]} title="Maintenance overview" badge={<LiveTag />}
        actions={<>
          <Segmented value="overview" onChange={(v) => v === 'all' && navigate('requests')} options={[{ value: 'overview', label: 'Overview' }, { value: 'all', label: 'All requests' }]} />
          <Select compact value={range} onChange={setRange} options={[{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} style={{ minWidth: 140 }} />
          {canCreate ? <Button title="New request" icon={Plus} onPress={() => setCreateOpen(true)} /> : null}
        </>} />
      <Grid cols={{ mobile: 2, tablet: 4, desktop: 8 }} gap={12}>
        <Tile dark label="Open requests" value={pf.open.length} sub="Still needing action" onPress={() => navigate('requests', { status: 'open' })} />
        <Tile label="New" dot={colors.info} value={byStatus('new')} sub="Awaiting a vendor" onPress={() => navigate('requests', { status: 'new' })} />
        <Tile label="Assigned" dot={colors.purple} value={byStatus('assigned')} sub="Vendor scheduled" onPress={() => navigate('requests', { status: 'assigned' })} />
        <Tile label="In progress" dot={colors.warning} value={byStatus('in_progress')} sub="Vendor on the job" onPress={() => navigate('requests', { status: 'in_progress' })} />
        <Tile label="Resolved" dot={colors.success} value={byStatus('resolved')} sub="Awaiting tenant" onPress={() => navigate('requests', { status: 'resolved' })} />
        <Tile label="Disputed" dot={colors.danger} value={byStatus('disputed')} sub="Tenant says not fixed" onPress={() => navigate('requests', { status: 'disputed' })} />
        <Tile label="Closed" dot={colors.faint} value={byStatus('closed')} sub={`Last ${range} days`} onPress={() => navigate('requests', { status: 'closed' })} />
        <Tile label="Avg resolution" value={`${avgRes.toFixed(1)}d`} sub="Target 3 days" />
      </Grid>
      <View style={{ height: 16 }} />
      <Grid cols={{ mobile: 1, desktop: 2 }}>
        <Card style={{ minHeight: 320 }}>
          <CardHeader title="Requests by category" subtitle={`${recent.length} requests in the last ${range} days`} />
          <BarChart height={250} data={catCounts.filter((c) => c.value > 0).map((c, i) => ({ label: c.label.replace('Air conditioning', 'AC').replace('Building repairs', 'Building').replace('Water supply', 'Water'), value: c.value, color: i === 0 ? colors.sidebar : colors.primary }))} />
        </Card>
        <Card style={{ minHeight: 320 }}>
          <CardHeader title="Requests by property" subtitle={top ? `${top.label} drives ${Math.round((top.value / Math.max(1, recent.length)) * 100)}% of volume` : ''} />
          <HBarList data={byProp.map((b, i) => ({ label: b.label, value: b.value, color: i === 0 ? colors.vizMaint : colors.primary }))} labelWidth={120} />
          {top && topPlumbing >= 3 ? <Notice tone="warning" style={{ marginTop: 16 }}>{`${topPlumbing} of ${top.label}'s ${top.value} requests are plumbing — consider a riser inspection.`}</Notice> : null}
        </Card>
      </Grid>
      <View style={{ height: 16 }} />
      <Grid cols={{ mobile: 1, desktop: 3 }} spans={[1, { mobile: 1, desktop: 2 }]}>
        <Card style={{ minHeight: 300 }}>
          <CardHeader title="Requests by status" />
          <Row gap={20} wrap>
            <Donut size={150} stroke={20} segments={[{ value: byStatus('new'), color: colors.info }, { value: byStatus('assigned'), color: colors.purple }, { value: byStatus('in_progress'), color: colors.warning }, { value: byStatus('resolved'), color: colors.success }, { value: byStatus('disputed'), color: colors.danger }, { value: byStatus('closed'), color: colors.faint }]}>
              <T size={26} weight="bold">{recent.length}</T><T size={11} color={colors.subtext}>requests</T>
            </Donut>
            <View style={{ gap: 9, flex: 1, minWidth: 140 }}>
              {(['new', 'assigned', 'in_progress', 'resolved', 'disputed', 'closed'] as RequestStatus[]).map((s) => (
                <Row key={s} gap={8}><View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: { new: colors.info, assigned: colors.purple, in_progress: colors.warning, resolved: colors.success, disputed: colors.danger, closed: colors.faint, cancelled: colors.faint }[s] }} /><T size={12.5} color={colors.textSoft} style={{ flex: 1 }}>{REQ_STATUS[s].label}</T><T size={12.5} weight="bold">{byStatus(s)}</T></Row>
              ))}
            </View>
          </Row>
        </Card>
        <Card style={{ minHeight: 300 }}>
          <CardHeader title="Average resolution time by category" subtitle="Days from submission to resolved · target by category" />
          <HBarList data={resByCat} labelWidth={130} max={Math.max(5, ...resByCat.map((r) => r.value))} />
          <Row gap={16} style={{ marginTop: 14 }}>{[['Within target', colors.primary], ['Slightly over', colors.vizMaint], ['Over target', colors.danger]].map(([l, c]) => <Row key={l} gap={6}><View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: c }} /><T size={12} color={colors.subtext}>{l}</T></Row>)}</Row>
        </Card>
      </Grid>
      <NewRequestDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Page>
  );
}

// ---------------------------------------------------------------- List

export function RequestsScreen() {
  const now = useNow();
  const { me } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const { navigate, route } = useRouter();
  const toast = useToast();
  const isCaretaker = me?.role === 'caretaker';
  const [status, setStatus] = useState<string>(route.params.status ?? (isCaretaker ? 'mine' : 'open'));
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('all');
  const [prop, setProp] = useState(route.params.propertyId ?? 'all');
  const [cats, setCats] = useState<Category[]>([]);
  const [prio, setPrio] = useState(route.params.priority ?? 'all');
  const [date, setDate] = useState('any');
  const [createOpen, setCreateOpen] = useState(route.params.create === '1');
  const canCreate = me?.role !== 'accountant';

  const base = scope.requests.filter((r) => {
    if (q && !`${r.id} ${r.title} ${lookup.tenant(r.tenantId)?.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (loc !== 'all' && lookup.property(r.propertyId)?.locationId !== loc) return false;
    if (prop !== 'all' && r.propertyId !== prop) return false;
    if (cats.length && !cats.includes(r.category)) return false;
    if (prio !== 'all' && r.priority !== prio) return false;
    if (date !== 'any' && now - parseDate(r.createdAt).getTime() > parseInt(date, 10) * 86400000) return false;
    return true;
  });
  const matches = (r: MaintenanceRequest, s: string) => s === 'all' || (s === 'open' ? isOpen(r) : s === 'mine' ? r.caretakerId === me?.id && isOpen(r) : r.status === s);
  const count = (s: string) => base.filter((r) => matches(r, s)).length;
  const rows = base.filter((r) => matches(r, status));
  const pg = usePaged(rows, 12, `${status}${q}${loc}${prop}${cats.join()}${prio}${date}`);

  const exportCsv = () => {
    const ok = downloadCSV('maintenance-requests', rows.map((r) => ({ 'Request ID': r.id, Tenant: lookup.tenant(r.tenantId)?.name, Property: lookup.property(r.propertyId)?.name, Flat: lookup.unit(r.unitId)?.code, Category: r.category, Description: r.title, Priority: PRIORITY[r.priority].label, Date: fmtDate(r.createdAt), Vendor: lookup.vendor(r.vendorId)?.name ?? '', Caretaker: lookup.user(r.caretakerId)?.name ?? '', Status: REQ_STATUS[r.status].label })));
    toast(ok ? `${rows.length} requests exported` : 'Export is available on the web app', ok ? 'success' : 'info');
  };

  return (
    <Page>
      <PageHeader crumbs={isCaretaker ? [{ label: 'My jobs', to: 'jobs' }, { label: 'Requests' }] : [{ label: 'Dashboard', to: 'dashboard' }, { label: 'Maintenance', to: 'maintenance' }, { label: 'Requests' }]} title="Maintenance requests" badge={<LiveTag />}
        actions={<>
          <Segmented value="all" onChange={(v) => v === 'overview' && navigate('maintenance')} options={[{ value: 'overview', label: 'Overview' }, { value: 'all', label: 'All requests' }]} />
          <Button title="Export" icon={Download} variant="secondary" onPress={exportCsv} />
          {canCreate ? <Button title="New request" icon={Plus} onPress={() => setCreateOpen(true)} /> : null}
        </>} />
      <Card pad={0}>
        <View style={{ paddingHorizontal: 16 }}>
          <Tabs value={status} onChange={setStatus} style={{ borderBottomWidth: 0 }} tabs={[
            ...(isCaretaker ? [{ value: 'mine', label: 'My jobs', count: count('mine') }] : []),
            { value: 'all', label: 'All', count: count('all') }, { value: 'open', label: 'Open', count: count('open') }, { value: 'new', label: 'New', count: count('new') },
            { value: 'assigned', label: 'Assigned', count: count('assigned') }, { value: 'in_progress', label: 'In progress', count: count('in_progress') },
            { value: 'resolved', label: 'Resolved', count: count('resolved') }, { value: 'disputed', label: 'Disputed', count: count('disputed') },
            { value: 'closed', label: 'Closed', count: count('closed') }, { value: 'cancelled', label: 'Cancelled', count: count('cancelled') },
          ]} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
          <View style={{ flexBasis: 200, flexGrow: 2 }}><Input leftIcon={Search} value={q} onChangeText={setQ} placeholder="ID, tenant or keyword" /></View>
          <View style={{ flexBasis: 130, flexGrow: 1 }}><Select compact value={loc} onChange={setLoc} options={[{ value: 'all', label: 'Location' }, ...scope.locations.map((l) => ({ value: l.id, label: l.name }))]} /></View>
          <View style={{ flexBasis: 140, flexGrow: 1 }}><Select compact value={prop} onChange={setProp} options={[{ value: 'all', label: 'Property' }, ...scope.properties.map((p) => ({ value: p.id, label: p.short }))]} /></View>
          <View style={{ flexBasis: 130, flexGrow: 1 }}><Select compact value={prio} onChange={setPrio} options={[{ value: 'all', label: 'Priority' }, ...(['urgent', 'high', 'medium', 'low'] as Priority[]).map((p) => ({ value: p, label: PRIORITY[p].label }))]} /></View>
          <View style={{ flexBasis: 130, flexGrow: 1 }}><Select compact value={date} onChange={setDate} options={[{ value: 'any', label: 'Any date' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }]} /></View>
        </View>
        <DataTable rows={pg.slice} keyOf={(r) => r.id} onRowPress={(r) => navigate('request', { id: r.id })}
          empty={<EmptyState icon={Wrench} title="No requests here" body="Nothing matches these filters." />}
          columns={[
            { key: 'i', title: 'Request ID', min: 95, render: (r) => <T mono size={12.5} color={colors.primary}>{r.id}</T> },
            { key: 't', title: 'Tenant', flex: 1.3, min: 140, render: (r) => <T size={13} weight="semibold" numberOfLines={1}>{lookup.tenant(r.tenantId)?.name}</T> },
            { key: 'p', title: 'Property', flex: 1.2, min: 130, render: (r) => <T size={13} color={colors.textSoft} numberOfLines={1}>{lookup.property(r.propertyId)?.short}</T> },
            { key: 'f', title: 'Flat', min: 55, flex: 0.4, render: (r) => <T size={13} color={colors.textSoft}>{lookup.unit(r.unitId)?.code}</T> },
            { key: 'c', title: 'Category', min: 110, render: (r) => <T size={13} color={colors.textSoft}>{r.category}</T> },
            { key: 'd', title: 'Description', flex: 1.6, min: 170, render: (r) => <T size={13} color={colors.textSoft} numberOfLines={1}>{r.title}</T> },
            { key: 'pr', title: 'Priority', min: 95, render: (r) => <PriorityBadge p={r.priority} /> },
            { key: 'dt', title: 'Date', min: 70, flex: 0.6, render: (r) => <T size={13} color={colors.textSoft}>{fmtShort(r.createdAt)}</T> },
            { key: 'v', title: 'Assigned to', flex: 1.2, min: 130, render: (r) => r.vendorId || r.caretakerId
              ? <T size={13} color={colors.textSoft} numberOfLines={1}>{[lookup.vendor(r.vendorId)?.name, lookup.user(r.caretakerId)?.name].filter(Boolean).join(' · ')}</T>
              : canAssign(r, me) ? <Button title="Assign" size="sm" variant="soft" onPress={() => navigate('request', { id: r.id, assign: '1' })} /> : <T size={13} color={colors.subtext}>—</T> },
            { key: 's', title: 'Status', min: 110, render: (r) => <RequestStatusBadge s={r.status} /> },
          ]} />
        <Pagination page={pg.page} pages={pg.pages} onPage={pg.setPage} label={`Showing ${pg.from}–${pg.to} of ${rows.length} requests`} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 16, alignItems: 'center' }}>
          <T size={12} color={colors.subtext}>Categories:</T>
          {[...ALL_CATEGORIES, 'Other' as Category].map((c) => <Chip key={c} label={c} active={cats.includes(c)} onPress={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])} />)}
          {cats.length ? <Link size={12} onPress={() => setCats([])}>Clear</Link> : null}
        </View>
      </Card>
      <NewRequestDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Page>
  );
}

function NewRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createRequest } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const { navigate } = useRouter();
  const toast = useToast();
  const [tenantId, setTenantId] = useState('');
  const [category, setCategory] = useState<Category>('Plumbing');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'urgent'>('medium');
  const [photos, setPhotos] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [clientKey, setClientKey] = useState(newClientKey);
  const [previousOpen, setPreviousOpen] = useState(false);
  if (previousOpen !== open) {
    setPreviousOpen(open);
    if (open) { setTenantId(''); setTitle(''); setDesc(''); setUrgency('medium'); setPhotos([]); setBusy(false); }
  }
  const tenants = scope.tenants.filter((t) => t.status === 'active');
  return (
    <Dialog open={open} onClose={onClose} title="New maintenance request" subtitle="Log an issue on behalf of a tenant."
      footer={<><Button title="Cancel" variant="secondary" onPress={onClose} /><Button title={busy ? (photos.length ? 'Uploading…' : 'Creating…') : 'Create request'} loading={busy} disabled={!tenantId || !title.trim() || busy} onPress={async () => {
        setBusy(true);
        try {
          const id = await createRequest({ tenantId, category, title: title.trim(), description: desc.trim() || title.trim(), where: 'Flat', urgency, photos, caretakerAccess: false, access: 'Contact tenant to arrange', clientKey });
          setClientKey(newClientKey()); toast(`${id} created`); onClose(); navigate('request', { id });
        } catch (e) { setBusy(false); toast(`Couldn’t create the request: ${e instanceof Error ? e.message : e}`, 'danger'); }
      }} /></>}>
      <View style={{ gap: 14 }}>
        <Select label="Tenant" required value={tenantId} onChange={setTenantId} options={tenants.map((t) => ({ value: t.id, label: t.name, sub: `${lookup.property(t.propertyId)?.short} · ${lookup.unit(t.unitId)?.code}` }))} />
        <Select label="Category" required value={category} onChange={setCategory} options={[...ALL_CATEGORIES, 'Other' as Category].map((c) => ({ value: c, label: c }))} />
        <Input label="Short title" required value={title} onChangeText={setTitle} placeholder="e.g. Kitchen socket not working" />
        <Input label="Description" value={desc} onChangeText={setDesc} multiline />
        <Segmented value={urgency} onChange={setUrgency} options={[{ value: 'low', label: 'Can wait' }, { value: 'medium', label: 'Soon' }, { value: 'urgent', label: 'Emergency' }]} />
        <View style={{ gap: 8 }}>
          <T size={12.5} weight="semibold" color={colors.textSoft}>Photos <T size={12.5} color={colors.subtext}>(optional, up to 5)</T></T>
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </View>
      </View>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Detail

const STAGES: { key: RequestStatus | 'confirm'; label: string }[] = [
  { key: 'new', label: 'Reported' }, { key: 'assigned', label: 'Assigned' }, { key: 'in_progress', label: 'In progress' }, { key: 'resolved', label: 'Resolved' }, { key: 'confirm', label: 'Tenant confirms' }, { key: 'closed', label: 'Closed' },
];
const STAGE_INDEX: Record<RequestStatus, number> = { new: 0, assigned: 1, in_progress: 2, resolved: 4, disputed: 4, closed: 5, cancelled: 0 };

export function RequestDetailScreen({ id }: { id: string }) {
  const messageTenant = useMessageTenant();
  const now = useNow();
  const { state, me, setRequestPriority, addComment } = useStore();
  const [action, setAction] = useState<Transition | null>(null);
  const lookup = useLookup();
  const { navigate, route } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const [assignOpen, setAssignOpen] = useState(route.params.assign === '1');
  const [comment, setComment] = useState('');
  const [share, setShare] = useState(false);
  const r = state.requests.find((x) => x.id === id);
  if (!r) return <Page><Card><EmptyState icon={Wrench} title="Request not found" action={<Button title="Back to requests" onPress={() => navigate('requests')} />} /></Card></Page>;
  const t = lookup.tenant(r.tenantId)!;
  const u = lookup.unit(r.unitId)!;
  const p = lookup.property(r.propertyId)!;
  const v = lookup.vendor(r.vendorId);
  const block = lookup.block(u?.blockId);
  const ct = lookup.user(r.caretakerId);
  const canEdit = me?.role === 'super_admin' || me?.role === 'manager' || me?.role === 'caretaker';
  const actions = allowedTransitions(r, me);
  const assignable = canAssign(r, me);
  const stageIdx = STAGE_INDEX[r.status];
  const slaHours = state.settings.response[r.priority];
  const slaDue = new Date(parseDate(r.createdAt).getTime() + slaHours * 3600000);
  const slaLeft = (slaDue.getTime() - now) / 3600000;
  const history = state.requests.filter((x) => x.unitId === r.unitId && x.id !== r.id).slice(0, 3);
  const openVendors = state.vendors.filter((x) => x.trade === r.category && x.status === 'active').length;

  const eventIcon = (k: string) => (k === 'created' || k === 'status' ? CircleCheck : k === 'priority' ? TriangleAlert : k === 'vendor' ? Briefcase : k === 'waiting' ? Hourglass : MessageSquare);

  return (
    <Page>
      <PageHeader crumbs={me?.role === 'caretaker' ? [{ label: 'My jobs', to: 'jobs' }, { label: r.id }] : [{ label: 'Dashboard', to: 'dashboard' }, { label: 'Maintenance', to: 'maintenance' }, { label: 'Requests', to: 'requests' }, { label: r.id }]} title={r.title}
        badge={<Row gap={6}><PriorityBadge p={r.priority} /><RequestStatusBadge s={r.status} /></Row>}
        subtitle={`${r.id} · Reported ${fmtDate(r.createdAt)}, ${new Date(r.createdAt).toTimeString().slice(0, 5)} by ${r.events[0]?.by.startsWith('Tenant') ? 'tenant' : 'staff'} · ${r.category}`}
        actions={canEdit ? <>
          <Button title="Message tenant" icon={MessageSquare} variant="secondary" size="sm" onPress={() => messageTenant(t.id)} />
          {assignable ? <Button title={v || ct ? 'Reassign' : 'Assign'} icon={Briefcase} size="sm" variant={actions.length ? 'secondary' : 'primary'} onPress={() => setAssignOpen(true)} /> : null}
          {actions.map((a) => <Button key={a} title={TRANSITION_LABEL[a]} size="sm" variant={a === 'cancel' || a === 'close' ? 'secondary' : 'primary'} onPress={() => setAction(a)} />)}
        </> : undefined} />
      <Card pad={14} style={{ marginBottom: 14 }}>
        <Row gap={6} wrap={bp === 'mobile'}>
          {STAGES.map((s, i) => {
            const done = i < stageIdx || r.status === 'closed', cur = i === stageIdx && r.status !== 'closed' && r.status !== 'cancelled';
            return (
              <React.Fragment key={s.key}>
                <Row gap={7}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: done ? colors.primary : colors.card, borderWidth: cur ? 2 : 1, borderColor: done || cur ? colors.primary : colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>{done ? <Check size={12} color={colors.white} strokeWidth={3} /> : <T size={11} weight="bold" color={cur ? colors.primary : colors.subtext}>{i + 1}</T>}</View>
                  {bp !== 'mobile' || cur ? <T size={12} weight={cur ? 'semibold' : 'medium'} color={done || cur ? colors.text : colors.subtext}>{s.label}</T> : null}
                </Row>
                {i < STAGES.length - 1 ? <View style={{ flex: 1, minWidth: 8, height: 2, backgroundColor: done ? colors.primary : colors.border }} /> : null}
              </React.Fragment>
            );
          })}
        </Row>
      </Card>
      {r.status === 'disputed' ? (
        <Notice tone="danger" title="The tenant says this isn’t fixed" style={{ marginBottom: 16 }}
          action={actions.includes('reopen') ? <Button title={TRANSITION_LABEL.reopen} size="sm" onPress={() => setAction('reopen')} /> : undefined}>
          {r.disputeReason ?? 'No reason given.'}
        </Notice>
      ) : null}
      {r.status === 'cancelled' ? <Notice tone="neutral" style={{ marginBottom: 16 }}>{r.events.slice().reverse().find((e) => e.kind === 'status')?.text ?? 'This request was cancelled.'}</Notice> : null}
      {r.status === 'resolved' ? <Notice tone="success" style={{ marginBottom: 16 }}>Marked as fixed. Waiting for {t.name.split(' ')[0]} to confirm or dispute. Requests aren’t closed automatically.</Notice> : null}
      {me?.role === 'caretaker' && r.caretakerId && r.caretakerId !== me.id ? <Notice tone="info" style={{ marginBottom: 16 }}>{`This job is assigned to ${ct?.name ?? 'another caretaker'}.`}</Notice> : null}
      {(r.priority === 'high' || r.priority === 'urgent') && (r.status === 'new') ? (
        <Notice tone="warning" style={{ marginBottom: 16 }}>
          <T size={13} color={colors.text}><T size={13} weight="semibold">{PRIORITY[r.priority].label} priority, first response {slaLeft > 0 ? `due in ${Math.floor(slaLeft)}h ${Math.round((slaLeft % 1) * 60)}m` : 'overdue'}.</T> Assign a vendor before {slaDue.toTimeString().slice(0, 5)} to stay within the {slaHours}-hour SLA.</T>
        </Notice>
      ) : null}
      <Grid cols={{ mobile: 1, desktop: 3 }} spans={[{ mobile: 1, desktop: 2 }, 1]}>
        <View style={{ gap: 16 }}>
          <Card>
            <CardHeader title="Request details" right={canEdit ? <Menu width={170} trigger={(open) => <Button title="Priority" size="sm" variant="ghost" icon={Pencil} onPress={open} />} items={(['urgent', 'high', 'medium', 'low'] as Priority[]).map((x) => ({ label: PRIORITY[x].label, onPress: () => { setRequestPriority(r.id, x); toast(`Priority set to ${PRIORITY[x].label}`); } }))} /> : null} />
            <Grid cols={{ mobile: 2, tablet: 3 }} gap={16}>
              <KV label="Property" value={p.name} /><KV label="Block / flat" value={`${block?.name}, Flat ${u.code}`} /><KV label="Location" value={`${lookup.location(p.locationId)?.name}, ${lookup.location(p.locationId)?.city}`} />
              <KV label="Category" value={r.category} /><KV label="Where in the flat" value={r.where} /><KV label="Access" value={r.access} />
            </Grid>
            <T size={12} color={colors.subtext} style={{ marginTop: 16 }}>Tenant&apos;s description</T>
            <T size={13.5} color={colors.textSoft} style={{ marginTop: 4, lineHeight: 21 }}>{r.description}</T>
            <RequestPhotos requestId={r.id} title="Photos from the report" />
            <RequestPhotos requestId={r.id} title="Completion photos" completion version={r.status === 'resolved' || r.status === 'closed' ? 1 : 0} />
          </Card>
          <Card>
            <CardHeader title="Activity and comments" right={<T size={11.5} color={colors.subtext}>Visible to managers. Toggle to share with tenant.</T>} />
            {r.events.map((e, i) => {
              const Icon = eventIcon(e.kind);
              return (
                <Row key={e.id} gap={12} align="flex-start">
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: e.kind === 'waiting' ? colors.card : colors.primary, borderWidth: e.kind === 'waiting' ? 2 : 0, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                      {e.kind === 'waiting' ? null : <Icon size={12} color={colors.white} strokeWidth={2.4} />}
                    </View>
                    {i < r.events.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: colors.border }} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 14 }}>
                    {e.kind === 'comment' ? (
                      <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 11, borderWidth: 1, borderColor: colors.border }}>
                        <Row gap={8}><Avatar name={e.by} size={22} /><T size={12.5} weight="semibold">{e.by}</T><T size={11.5} color={colors.subtext}>{fmtStamp(e.at)}</T>{e.internal ? <Badge label="Internal" tone="neutral" size="sm" /> : <Badge label="Shared with tenant" tone="success" size="sm" />}</Row>
                        <T size={13} color={colors.textSoft} style={{ marginTop: 6 }}>{e.text}</T>
                      </View>
                    ) : (
                      <>
                        <T size={13} weight="semibold">{e.text}</T>
                        <T size={11.5} color={colors.subtext}>{fmtStamp(e.at)} · {e.by}</T>
                      </>
                    )}
                  </View>
                </Row>
              );
            })}
            {canEdit ? (
              <View style={{ marginTop: 6, gap: 10 }}>
                <T size={12.5} weight="semibold" color={colors.textSoft}>Add a comment</T>
                <Input value={comment} onChangeText={setComment} multiline placeholder="Write an update or note..." />
                <Row justify="space-between">
                  <Checkbox checked={share} onChange={setShare} label="Share with tenant" />
                  <Button title="Post comment" size="sm" disabled={!comment.trim()} onPress={() => { addComment(r.id, comment.trim(), share); setComment(''); toast(share ? 'Comment shared with tenant' : 'Internal note added'); }} />
                </Row>
              </View>
            ) : null}
          </Card>
        </View>
        <View style={{ gap: 16 }}>
          <Card>
            <CardHeader title="Tenant" right={<Link onPress={() => navigate('tenant', { id: t.id })}>View profile</Link>} />
            <Row gap={10}><Avatar name={t.name} size={38} /><View style={{ flex: 1 }}><T size={13.5} weight="semibold">{t.name}</T><T size={12} color={colors.subtext}>Flat {u.code} · Lease to {fmtDate(lookup.currentLease(t.id)?.end)}</T></View><CallButton phone={t.phone} name={t.name} compact /></Row>
            <View style={{ gap: 6, marginTop: 12 }}>
              <Row gap={8}><Phone size={13} color={colors.subtext} /><T size={12.5}>{t.phone}</T></Row>
              <Row gap={8}><Mail size={13} color={colors.subtext} /><T size={12.5}>{t.email}</T></Row>
            </View>
          </Card>
          {ct ? (
            <Card>
              <CardHeader title="Caretaker" />
              <Row gap={10}><Avatar name={ct.name} size={36} /><View style={{ flex: 1 }}><T size={13.5} weight="semibold">{ct.name}</T><T size={12} color={colors.subtext}>{ct.phone || ct.email}</T></View></Row>
              {r.visit && !v ? <Notice tone="info" icon={Clock} style={{ marginTop: 10 }}>{`Visit ${fmtDate(r.visit.date)}, ${r.visit.window}`}</Notice> : null}
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Vendor" />
            {v ? (
              <View style={{ gap: 10 }}>
                <Row gap={10}><IconTile icon={Briefcase} tone="purple" size={36} /><View style={{ flex: 1 }}><T size={13.5} weight="semibold">{v.name}</T><T size={12} color={colors.subtext}>{v.contact} · {v.phone}</T></View></Row>
                {r.visit ? <Notice tone="info" icon={Clock}>{`Visit ${fmtDate(r.visit.date)}, ${r.visit.window}`}</Notice> : null}
                <Row gap={6}><Star size={13} color={colors.accent} fill={colors.accent} /><T size={12.5} color={colors.textSoft}>{v.rating.toFixed(1)} · {v.completed} jobs · avg {v.avgDays}d</T></Row>
                {assignable ? <Button title="Change vendor" variant="secondary" size="sm" onPress={() => setAssignOpen(true)} /> : null}
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
                <IconTile icon={Briefcase} tone="neutral" size={36} />
                <T size={13} weight="semibold">No vendor assigned</T>
                <T size={12} color={colors.subtext}>{openVendors} {r.category.toLowerCase()} vendors available today</T>
                {assignable ? <Button title="Assign vendor" variant="soft" style={{ alignSelf: 'stretch', marginTop: 6 }} onPress={() => setAssignOpen(true)} /> : null}
              </View>
            )}
          </Card>
          <Card>
            <CardHeader title="Cost" />
            <View style={{ gap: 9 }}>
              <Row justify="space-between"><T size={12.5} color={colors.subtext}>Estimate</T><T size={12.5} weight="semibold">{r.estimate ? naira(r.estimate) : 'Not quoted'}</T></Row>
              <Row justify="space-between"><T size={12.5} color={colors.subtext}>Final cost</T><T size={12.5} weight="semibold">{r.cost ? naira(r.cost) : '—'}</T></Row>
              <Row justify="space-between"><T size={12.5} color={colors.subtext}>Charged to</T><T size={12.5} weight="semibold">Landlord</T></Row>
              <Row justify="space-between"><T size={12.5} color={colors.subtext}>Approval needed above</T><T size={12.5} weight="semibold">{naira(150000)}</T></Row>
            </View>
          </Card>
          <Card>
            <CardHeader title={`History for flat ${u.code}`} />
            <View style={{ gap: 10 }}>
              {history.map((h) => (
                <Touch key={h.id} onPress={() => navigate('request', { id: h.id })} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <T size={12.5} color={colors.textSoft} numberOfLines={1} style={{ flex: 1 }}>{h.id} · {h.title}</T>
                  <RequestStatusBadge s={h.status} />
                </Touch>
              ))}
              {!history.length ? <T size={12.5} color={colors.subtext}>No earlier requests for this flat.</T> : null}
            </View>
          </Card>
        </View>
      </Grid>
      {assignable ? <AssignVendorDialog open={assignOpen} onClose={() => setAssignOpen(false)} request={r} /> : null}
      <TransitionDialog request={r} transition={action} onClose={() => setAction(null)} requirePhotos={me?.role === 'caretaker'} />
    </Page>
  );
}

function AssignVendorDialog({ open, onClose, request }: { open: boolean; onClose: () => void; request: MaintenanceRequest }) {
  const { state, assignRequest } = useStore();
  const lookup = useLookup();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'trade' | 'today' | 'area'>('trade');
  const [vendorId, setVendorId] = useState(request.vendorId ?? '');
  const [caretakerId, setCaretakerId] = useState(request.caretakerId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [date, setDate] = useState(toISODate(new Date()));
  const [win, setWin] = useState('2pm – 5pm');
  const [note, setNote] = useState('');
  const [smsVendor, setSmsVendor] = useState(true);
  const [tellTenant, setTellTenant] = useState(true);
  const p = lookup.property(request.propertyId);
  const u = lookup.unit(request.unitId);
  const area = lookup.location(p?.locationId)?.name ?? '';
  const [previous, setPrevious] = useState({ open: false, request });
  if (previous.open !== open || previous.request !== request) {
    setPrevious({ open, request });
    if (open) {
      setVendorId(request.vendorId ?? '');
      setCaretakerId(request.caretakerId ?? '');
      setBusy(false);
      setError(undefined);
      setNote(request.description.length > 120 ? `${request.title}. ${request.access}.` : `${request.description} ${request.access}.`);
    }
  }
  const vendors = state.vendors
    .filter((v) => v.status === 'active' && (!q || v.name.toLowerCase().includes(q.toLowerCase())))
    .filter((v) => (filter === 'trade' ? v.trade === request.category || (request.category === 'Water supply' && v.trade === 'Plumbing') : filter === 'area' ? v.coverage.includes(area) || v.coverage.startsWith('All') : true))
    .sort((a, b) => b.rating - a.rating);
  const openJobs = (v: Vendor) => state.requests.filter((r) => r.vendorId === v.id && isOpen(r) && r.status !== 'new').length;
  const sel = state.vendors.find((v) => v.id === vendorId);
  const caretakers = state.users.filter((u) => u.role === 'caretaker' && u.status === 'active' && u.propertyIds?.includes(request.propertyId));
  const selCt = caretakers.find((u) => u.id === caretakerId);
  const who = [sel?.name, selCt?.name].filter(Boolean).join(' and ');
  const submit = async () => {
    setBusy(true); setError(undefined);
    try {
      await assignRequest(request.id, { vendorId: sel?.id, caretakerId: selCt?.id, visit: { date, window: win }, note, tellTenant });
      toast(`${who} assigned${tellTenant ? ' — tenant notified' : ''}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const dayOpts = [0, 1, 2, 3].map((i) => { const d = addDays(new Date(), i); return { value: toISODate(d), label: i === 0 ? `Today, ${fmtShort(toISODate(d))}` : i === 1 ? `Tomorrow, ${fmtShort(toISODate(d))}` : fmtDate(toISODate(d)) }; });
  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title="Assign" subtitle={`${request.id} · ${request.category} · ${p?.short} ${u?.code}`} width={560}
      footer={<><Button title="Cancel" variant="secondary" disabled={busy} onPress={onClose} /><Button title={busy ? 'Assigning…' : who ? `Assign ${who}` : 'Choose a vendor or caretaker'} loading={busy} disabled={!who || busy} onPress={() => void submit()} /></>}>
      <View style={{ gap: 12 }}>
        <Select label="Caretaker" value={caretakerId || 'none'} onChange={(v) => setCaretakerId(v === 'none' ? '' : v)}
          options={[{ value: 'none', label: caretakers.length ? 'No caretaker' : 'No caretakers for this property' }, ...caretakers.map((c) => ({ value: c.id, label: c.name }))]}
          hint="Caretakers see the job under My jobs and can start and finish it." />
        <T size={12.5} weight="semibold" color={colors.textSoft}>Vendor</T>
        <Input leftIcon={Search} value={q} onChangeText={setQ} placeholder="Search vendors" />
        <Row gap={8} wrap>
          <Chip label={request.category} active={filter === 'trade'} onPress={() => setFilter('trade')} />
          <Chip label="Available today" active={filter === 'today'} onPress={() => setFilter('today')} />
          <Chip label={`Covers ${area}`} active={filter === 'area'} onPress={() => setFilter('area')} />
        </Row>
        <View style={{ gap: 8 }}>
          {vendors.map((v) => {
            const jobs = openJobs(v);
            const on = v.id === vendorId;
            return (
              <Touch key={v.id} onPress={() => setVendorId(on ? '' : v.id)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: on ? 1.5 : 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primaryTint : colors.card, borderRadius: radius.md, padding: 12 }}>
                <View style={{ width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, borderColor: on ? colors.primary : colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{on ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary }} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <T size={13} weight="semibold">{v.name}</T>
                  <T size={11.5} color={colors.subtext}>Rating {v.rating.toFixed(1)} · {v.completed} jobs · Avg {v.avgDays}d · Covers {v.coverage}</T>
                  <T size={11.5} color={colors.subtext}>{jobs} open job{jobs === 1 ? '' : 's'} with you</T>
                </View>
                <Badge label={jobs < 3 ? 'Available today' : 'From tomorrow'} tone={jobs < 3 ? 'success' : 'warning'} size="sm" dot />
              </Touch>
            );
          })}
          {!vendors.length ? <T size={12.5} color={colors.subtext}>No vendors match. Try another filter.</T> : null}
        </View>
        <Row gap={12} align="flex-start">
          <Select fieldStyle={{ flex: 1 }} label="Visit date" value={date} onChange={setDate} options={dayOpts} />
          <Select fieldStyle={{ flex: 1 }} label="Time window" value={win} onChange={setWin} options={['9am – 12pm', '12pm – 3pm', '2pm – 5pm', 'After 5pm'].map((w) => ({ value: w, label: w }))} />
        </Row>
        <Input label="Note to vendor" value={note} onChangeText={setNote} multiline />
        <Checkbox checked={smsVendor} onChange={setSmsVendor} label="Send job details to vendor by SMS and email" />
        <Checkbox checked={tellTenant} onChange={setTellTenant} label="Tell the tenant who is coming and when" />
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </View>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Vendors

export function VendorsScreen() {
  const now = useNow();
  const { state, me, addVendor, setVendorStatus } = useStore();
  const { navigate } = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [trade, setTrade] = useState('all');
  const [area, setArea] = useState('all');
  const [status, setStatus] = useState('active');
  const [addOpen, setAddOpen] = useState(false);
  const canEdit = me?.role === 'super_admin' || me?.role === 'manager';
  const openJobs = (id: string) => state.requests.filter((r) => r.vendorId === id && ['assigned', 'in_progress'].includes(r.status)).length;
  const rows = state.vendors.filter((v) => (!q || `${v.name} ${v.contact}`.toLowerCase().includes(q.toLowerCase())) && (trade === 'all' || v.trade === trade) && (area === 'all' || v.coverage.includes(area) || v.coverage.startsWith('All')) && (status === 'all' || v.status === status));
  const active = state.vendors.filter((v) => v.status === 'active');
  const trades = new Set(state.vendors.map((v) => v.trade));
  const totalOpen = state.vendors.reduce((s, v) => s + openJobs(v.id), 0);
  const pastSla = state.requests.filter((r) => ['assigned', 'in_progress'].includes(r.status) && hoursBetween(r.createdAt, new Date().toISOString()) > state.settings.response[r.priority] * 3).length;
  const avgRating = active.reduce((s, v) => s + v.rating, 0) / Math.max(1, active.length);
  const spend = state.vendors.reduce((s, v) => s + v.spendThisMonth, 0);

  const exportCsv = () => {
    const ok = downloadCSV('vendors', rows.map((v) => ({ Vendor: v.name, Contact: v.contact, Phone: v.phone, Trade: v.trade, Coverage: v.coverage, 'Open jobs': openJobs(v.id), Completed: v.completed, 'Avg days': v.avgDays, Rating: v.rating, Status: v.status })));
    toast(ok ? 'Vendors exported' : 'Export is available on the web app', ok ? 'success' : 'info');
  };

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Vendors' }]} title="Vendors"
        actions={<><Button title="Export" icon={Download} variant="secondary" onPress={exportCsv} />{canEdit ? <Button title="Add vendor" icon={Plus} onPress={() => setAddOpen(true)} /> : null}</>} />
      <Grid cols={{ mobile: 2, desktop: 4 }} gap={12}>
        {[
          { icon: Briefcase, tone: 'primary' as const, l: 'Active vendors', v: active.length, s: `Across ${trades.size} trades` },
          { icon: Clock, tone: 'accent' as const, l: 'Open jobs', v: totalOpen, s: `${pastSla} past SLA` },
          { icon: Star, tone: 'info' as const, l: 'Average rating', v: avgRating.toFixed(1), s: `From ${active.reduce((s, v) => s + v.ratingCount, 0)} tenant ratings` },
          { icon: Zap, tone: 'accent' as const, l: 'Spend this month', v: nairaCompact(spend), s: `${state.requests.filter((r) => r.cost && now - parseDate(r.createdAt).getTime() < 30 * 86400000).length} completed jobs` },
        ].map((x) => (
          <Card key={x.l} pad={16}>
            <Row gap={8}><IconTile icon={x.icon} tone={x.tone} size={26} iconSize={13} /><T size={12} color={colors.textSoft}>{x.l}</T></Row>
            <T size={24} weight="bold" style={{ marginTop: 8 }}>{x.v}</T>
            <T size={11.5} color={colors.subtext}>{x.s}</T>
          </Card>
        ))}
      </Grid>
      <View style={{ height: 16 }} />
      <Card pad={0}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14 }}>
          <View style={{ flexBasis: 220, flexGrow: 2 }}><Input leftIcon={Search} value={q} onChangeText={setQ} placeholder="Search vendor or contact" /></View>
          <View style={{ flexBasis: 140, flexGrow: 1 }}><Select compact value={trade} onChange={setTrade} options={[{ value: 'all', label: 'All trades' }, ...[...trades].map((t) => ({ value: t, label: t }))]} /></View>
          <View style={{ flexBasis: 140, flexGrow: 1 }}><Select compact value={area} onChange={setArea} options={[{ value: 'all', label: 'Any location' }, ...state.locations.map((l) => ({ value: l.name.split(' ')[0], label: l.name }))]} /></View>
          <View style={{ flexBasis: 120, flexGrow: 1 }}><Select compact value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'all', label: 'All' }]} /></View>
        </View>
        <DataTable rows={rows} keyOf={(v) => v.id} empty={<EmptyState icon={Briefcase} title="No vendors match" />} columns={[
          { key: 'v', title: 'Vendor', flex: 1.7, min: 210, render: (v) => <Row gap={10}><Avatar name={v.name} size={30} /><View style={{ flex: 1 }}><T size={13} weight="semibold" numberOfLines={1}>{v.name}</T><T size={11.5} color={colors.subtext} numberOfLines={1}>{v.contact} · {v.phone}</T></View></Row> },
          { key: 't', title: 'Trade', min: 120, render: (v) => <T size={13} color={colors.textSoft}>{v.trade}</T> },
          { key: 'c', title: 'Coverage', flex: 1.4, min: 150, render: (v) => <T size={13} color={colors.textSoft} numberOfLines={1}>{v.coverage}</T> },
          { key: 'o', title: 'Open jobs', min: 80, flex: 0.6, render: (v) => <T size={13} weight="semibold">{openJobs(v.id)}</T> },
          { key: 'd', title: 'Completed', min: 90, flex: 0.6, render: (v) => <T size={13}>{v.completed}</T> },
          { key: 'a', title: 'Avg time', min: 80, flex: 0.6, render: (v) => <T size={13}>{v.avgDays ? `${v.avgDays} d` : '—'}</T> },
          { key: 'r', title: 'Rating', min: 80, flex: 0.6, render: (v) => <Row gap={4}><Star size={12} color={colors.accent} fill={colors.accent} /><T size={13} weight="semibold">{v.rating ? v.rating.toFixed(1) : '—'}</T></Row> },
          { key: 's', title: 'Status', min: 100, render: (v) => <Badge label={v.status === 'active' ? 'Active' : 'Paused'} tone={v.status === 'active' ? 'success' : 'warning'} dot /> },
          { key: 'm', title: '', min: 50, flex: 0.3, align: 'right', render: (v) => canEdit ? (
            <Menu width={180} trigger={(open) => <Touch onPress={open} style={{ padding: 6, borderRadius: 6 }} hoverStyle={{ backgroundColor: colors.neutralSoft }}><Ellipsis size={17} color={colors.subtext} /></Touch>}
              items={[
                { label: 'View jobs', icon: Wrench, onPress: () => navigate('requests', { status: 'all' }) },
                v.status === 'active' ? { label: 'Pause vendor', icon: Pause, onPress: () => { setVendorStatus(v.id, 'paused'); toast(`${v.name} paused`); } } : { label: 'Reactivate', icon: Play, onPress: () => { setVendorStatus(v.id, 'active'); toast(`${v.name} reactivated`); } },
              ]} />
          ) : null },
        ]} />
      </Card>
      <AddVendorDialog open={addOpen} onClose={() => setAddOpen(false)} onAdd={(v) => { addVendor(v); toast(`${v.name} added`); setAddOpen(false); }} />
    </Page>
  );
}

function AddVendorDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (v: Omit<Vendor, 'id' | 'completed' | 'avgDays' | 'rating' | 'ratingCount' | 'spendThisMonth'>) => void }) {
  const [f, setF] = useState({ name: '', contact: '', phone: '', email: '', trade: 'Plumbing' as Category, coverage: '' });
  const [previousOpen, setPreviousOpen] = useState(false);
  if (previousOpen !== open) {
    setPreviousOpen(open);
    if (open) setF({ name: '', contact: '', phone: '', email: '', trade: 'Plumbing', coverage: '' });
  }
  const ok = f.name.trim() && f.contact.trim() && f.phone.trim();
  return (
    <Dialog open={open} onClose={onClose} title="Add vendor" footer={<><Button title="Cancel" variant="secondary" onPress={onClose} /><Button title="Add vendor" disabled={!ok} onPress={() => onAdd({ ...f, coverage: f.coverage || 'All Lagos', status: 'active' })} /></>}>
      <View style={{ gap: 14 }}>
        <Input label="Business name" required value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Row gap={12} align="flex-start"><Input fieldStyle={{ flex: 1 }} label="Contact person" required value={f.contact} onChangeText={(v) => setF({ ...f, contact: v })} /><Input fieldStyle={{ flex: 1 }} label="Phone" required value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" /></Row>
        <Input label="Email" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} autoCapitalize="none" />
        <Select label="Trade" required value={f.trade} onChange={(v) => setF({ ...f, trade: v })} options={[...ALL_CATEGORIES, 'Other' as Category].map((c) => ({ value: c, label: c }))} />
        <Input label="Coverage" value={f.coverage} onChangeText={(v) => setF({ ...f, coverage: v })} placeholder="e.g. Yaba, Surulere, Gbagada" />
      </View>
    </Dialog>
  );
}

export { ChevronRight, Send, X, useMemo };

const Tile = ({ label, value, sub, dot, dark, onPress }: { label: string; value: string | number; sub: string; dot?: string; dark?: boolean; onPress?: () => void }) => (
  <Card pad={14} onPress={onPress} tint={dark ? colors.sidebar : undefined} style={dark ? { borderColor: colors.sidebar } : undefined}>
    <Row gap={6}>{dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} /> : null}<T size={12} color={dark ? colors.sidebarText : colors.subtext}>{label}</T></Row>
    <T size={24} weight="bold" color={dark ? colors.white : colors.text} style={{ marginTop: 6 }}>{value}</T>
    <T size={11.5} color={dark ? colors.sidebarMuted : colors.subtext}>{sub}</T>
  </Card>
);
