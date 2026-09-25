import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  ArrowLeftRight, Check, CircleCheck, Download, Ellipsis, Eye, FileText, Mail, MapPin, MessageSquare, Pencil, Phone, Plus, RefreshCw, Save, Search,
  ShieldCheck, Upload, UserMinus, UserPlus, Users, X, ChevronLeft, ChevronRight, Info, Calendar, Building2, Flag,
} from 'lucide-react-native';
import { colors, radius, useBreakpoint } from '../../theme';
import { useLookup, useScope, useStore } from '../../store/AppContext';
import { useRouter } from '../../nav/router';
import { Page, PageHeader, StickyFooter } from '../../components/shell';
import {
  Avatar, Badge, Button, Card, CardHeader, Chip, Dialog, Divider, EmptyState, Grid, IconTile, Input, KV, Link, Menu, Notice, ProgressBar, Row, Select,
  T, Tabs, Touch, useConfirm, useToast, Checkbox, Segmented,
} from '../../components/ui';
import { DataTable, FileRow, LeaseBadge, Pagination, RequestStatusBadge, TENANT_STATUS, usePaged } from '../../components/data';
import { downloadCSV } from '../../lib/export';
import type { OnboardingDraft, Tenant } from '../../types';
import { addDays, addMonths, daysBetween, daysUntil, fmtDate, fmtPadded, fmtShort, fmtSlash, leaseStatus, naira, timeAgo, toISODate, todayISO, uid } from '../../utils';

// ---------------------------------------------------------------- Directory

export function TenantsScreen() {
  const { state, me, approveTenant, deactivateTenant } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const { navigate, route } = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState(route.params.tab ?? 'all');
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('all');
  const [prop, setProp] = useState(route.params.propertyId ?? 'all');
  const [lease, setLease] = useState('all');
  const [onb, setOnb] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveFor, setMoveFor] = useState<Tenant | null>(null);
  const canEdit = me?.role === 'super_admin' || me?.role === 'manager';

  const withLease = useMemo(() => scope.tenants.map((t) => {
    const l = lookup.currentLease(t.id);
    return { t, l, ls: l ? leaseStatus(l) : undefined, d: l ? daysUntil(l.end) : undefined };
  }), [scope.tenants, lookup]);

  const counts = {
    all: withLease.length,
    active: withLease.filter((x) => x.t.status === 'active').length,
    pending: withLease.filter((x) => x.t.status === 'pending').length,
    expiring: withLease.filter((x) => x.t.status === 'active' && x.d !== undefined && x.d >= 0 && x.d <= 60).length,
    expired: withLease.filter((x) => x.t.status === 'active' && x.d !== undefined && x.d < 0).length,
    deactivated: withLease.filter((x) => x.t.status === 'deactivated' || x.t.status === 'former').length,
  };

  const rows = withLease.filter((x) => {
    if (tab === 'active' && x.t.status !== 'active') return false;
    if (tab === 'pending' && x.t.status !== 'pending') return false;
    if (tab === 'expiring' && !(x.t.status === 'active' && x.d !== undefined && x.d >= 0 && x.d <= 60)) return false;
    if (tab === 'expired' && !(x.t.status === 'active' && x.d !== undefined && x.d < 0)) return false;
    if (tab === 'deactivated' && !(x.t.status === 'deactivated' || x.t.status === 'former')) return false;
    if (q && !`${x.t.name} ${x.t.code} ${x.t.email} ${x.t.phone}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (loc !== 'all' && lookup.property(x.t.propertyId)?.locationId !== loc) return false;
    if (prop !== 'all' && x.t.propertyId !== prop) return false;
    if (lease !== 'all' && x.ls !== lease) return false;
    if (onb !== 'all' && x.t.onboarding !== onb) return false;
    return true;
  }).sort((a, b) => (a.t.status === 'pending' ? -1 : 0) - (b.t.status === 'pending' ? -1 : 0) || a.t.name.localeCompare(b.t.name));
  const pg = usePaged(rows, 10, `${tab}${q}${loc}${prop}${lease}${onb}`);

  const exportCsv = () => {
    const list = selected.size ? rows.filter((r) => selected.has(r.t.id)) : rows;
    const ok = downloadCSV('tenants', list.map(({ t, l }) => ({ 'Tenant ID': t.code, Name: t.name, Phone: t.phone, Email: t.email, Property: lookup.property(t.propertyId)?.name, Unit: lookup.unit(t.unitId)?.code, 'Lease start': l?.start, 'Lease end': l?.end, Status: TENANT_STATUS[t.status].label })));
    toast(ok ? `${list.length} tenants exported` : 'Export is available on the web app', ok ? 'success' : 'info');
  };

  const leaseCell = (x: typeof withLease[number]) => {
    if (x.t.status === 'pending') return <Badge label={x.l ? `Starts ${fmtShort(x.l.start)}` : 'Awaiting lease'} tone="info" dot />;
    if (!x.l || x.d === undefined) return <T size={12.5} color={colors.faint}>—</T>;
    if (x.d < 0) return <Badge label={`Expired ${-x.d}d`} tone="danger" dot />;
    if (x.d <= 30) return <Badge label={`${x.d} days left`} tone="warning" dot />;
    if (x.l.renewedFrom && daysBetween(x.l.start, todayISO()) < 60) return <Badge label="Renewed" tone="success" dot />;
    return <Badge label="Active" tone="success" dot />;
  };

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Tenants' }]} title="Tenant directory" subtitle={`${counts.all} tenants · ${counts.active} active · ${counts.pending} awaiting approval`}
        actions={<><Button title="Export" icon={Download} variant="secondary" onPress={exportCsv} />{canEdit ? <Button title="Add tenant" icon={Plus} onPress={() => navigate('onboarding')} /> : null}</>} />
      {state.drafts.length && canEdit ? (
        <Notice tone="info" icon={Save} style={{ marginBottom: 14 }} action={<Button title="Resume" size="sm" variant="secondary" onPress={() => navigate('onboarding', { draft: state.drafts[0].id })} />}>
          {`Onboarding draft for ${state.drafts[0].personal.name || 'a new tenant'} saved ${timeAgo(state.drafts[0].savedAt)} (step ${state.drafts[0].step} of 7).`}
        </Notice>
      ) : null}
      <Card pad={0}>
        <View style={{ paddingHorizontal: 16 }}>
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'all', label: 'All', count: counts.all }, { value: 'active', label: 'Active', count: counts.active }, { value: 'pending', label: 'Pending approval', count: counts.pending },
            { value: 'expiring', label: 'Lease expiring', count: counts.expiring }, { value: 'expired', label: 'Expired lease', count: counts.expired }, { value: 'deactivated', label: 'Deactivated', count: counts.deactivated },
          ]} style={{ borderBottomWidth: 0 }} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
          <View style={{ flexBasis: 220, flexGrow: 2 }}><Input leftIcon={Search} value={q} onChangeText={setQ} placeholder="Search by tenant name, ID or phone" /></View>
          <View style={{ flexBasis: 130, flexGrow: 1 }}><Select compact value={loc} onChange={setLoc} options={[{ value: 'all', label: 'Location' }, ...scope.locations.map((l) => ({ value: l.id, label: l.name }))]} /></View>
          <View style={{ flexBasis: 150, flexGrow: 1 }}><Select compact value={prop} onChange={setProp} options={[{ value: 'all', label: 'Property' }, ...scope.properties.map((p) => ({ value: p.id, label: p.short }))]} /></View>
          <View style={{ flexBasis: 130, flexGrow: 1 }}><Select compact value={lease} onChange={setLease} options={[{ value: 'all', label: 'Lease status' }, { value: 'active', label: 'Active' }, { value: 'expiring', label: 'Expiring soon' }, { value: 'expired', label: 'Expired' }, { value: 'draft', label: 'Draft' }]} /></View>
          <View style={{ flexBasis: 150, flexGrow: 1 }}><Select compact value={onb} onChange={setOnb} options={[{ value: 'all', label: 'Onboarding status' }, { value: 'approved', label: 'Approved' }, { value: 'pending', label: 'Pending' }]} /></View>
          <Button title="Clear" variant="ghost" onPress={() => { setQ(''); setLoc('all'); setProp('all'); setLease('all'); setOnb('all'); }} />
        </View>
        {selected.size ? (
          <Row style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.primaryTint, borderTopWidth: 1, borderTopColor: colors.border }} gap={10}>
            <T size={13} weight="semibold">{selected.size} selected</T>
            <Button title="Export selected" size="sm" variant="secondary" onPress={exportCsv} />
            <Button title="Message" size="sm" variant="secondary" onPress={() => navigate('communications')} />
            <Button title="Clear" size="sm" variant="ghost" onPress={() => setSelected(new Set())} />
          </Row>
        ) : null}
        <DataTable
          rows={pg.slice}
          keyOf={(x) => x.t.id}
          selectable
          selected={selected}
          onToggle={(k) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}
          onToggleAll={(all) => setSelected(all ? new Set(pg.slice.map((x) => x.t.id)) : new Set())}
          onRowPress={(x) => navigate('tenant', { id: x.t.id })}
          empty={<EmptyState icon={Users} title="No tenants match" body="Try another tab or clear the filters." />}
          columns={[
            { key: 'n', title: 'Tenant', flex: 1.6, min: 200, render: ({ t }) => <Row gap={10}><Avatar name={t.name} size={30} /><View style={{ flex: 1 }}><T size={13} weight="semibold" numberOfLines={1}>{t.name}</T><T size={11.5} color={colors.subtext}>{t.code}</T></View></Row> },
            { key: 'c', title: 'Phone / Email', flex: 1.6, min: 190, render: ({ t }) => <View><T size={12.5}>{t.phone}</T><T size={11.5} color={colors.subtext} numberOfLines={1}>{t.email}</T></View> },
            { key: 'p', title: 'Property', flex: 1.2, min: 140, render: ({ t }) => <T size={12.5} color={colors.textSoft} numberOfLines={1}>{lookup.property(t.propertyId)?.short ?? '—'}</T> },
            { key: 'u', title: 'Unit', min: 60, flex: 0.5, render: ({ t }) => <T size={12.5} color={colors.textSoft}>{lookup.unit(t.unitId)?.code ?? '—'}</T> },
            { key: 's', title: 'Lease start', min: 100, render: ({ l }) => <T size={12.5} color={colors.textSoft}>{l ? fmtPadded(l.start) : '—'}</T> },
            { key: 'e', title: 'Lease end', min: 100, render: ({ l }) => <T size={12.5} color={colors.textSoft}>{l ? fmtPadded(l.end) : '—'}</T> },
            { key: 'ls', title: 'Lease status', min: 130, render: (x) => leaseCell(x) },
            { key: 'a', title: 'Account', min: 130, render: ({ t }) => <Badge label={TENANT_STATUS[t.status].label} tone={TENANT_STATUS[t.status].tone} /> },
            { key: 'm', title: '', min: 50, flex: 0.3, align: 'right', render: (x) => (
              <Menu width={190} trigger={(open) => <Touch onPress={open} style={{ padding: 6, borderRadius: 6 }} hoverStyle={{ backgroundColor: colors.neutralSoft }}><Ellipsis size={17} color={colors.subtext} /></Touch>}
                items={[
                  { label: 'View profile', icon: Eye, onPress: () => navigate('tenant', { id: x.t.id }) },
                  ...(canEdit ? [
                    ...(x.t.status === 'pending' ? [{ label: 'Approve tenant', icon: ShieldCheck, onPress: () => { approveTenant(x.t.id); toast(`${x.t.name} approved and lease activated`); } }] : []),
                    { label: 'Edit', icon: Pencil, onPress: () => navigate('tenant', { id: x.t.id, edit: '1' }) },
                    { label: 'Message', icon: MessageSquare, onPress: () => navigate('communications', { tenantId: x.t.id }) },
                    ...(x.l ? [{ label: 'Renew lease', icon: RefreshCw, onPress: () => navigate('renew', { id: x.l!.id }) }] : []),
                    ...(x.t.status === 'active' ? [{ label: 'Move tenant', icon: ArrowLeftRight, onPress: () => setMoveFor(x.t) }] : []),
                    ...(x.t.status === 'active' || x.t.status === 'pending' ? [{ label: 'Deactivate', icon: UserMinus, danger: true, onPress: () => confirm.ask({ title: `Deactivate ${x.t.name}?`, body: 'Their lease will be ended, the unit marked vacant and portal access removed. Records are kept for your history.', confirm: 'Deactivate', danger: true, onConfirm: () => { deactivateTenant(x.t.id); toast(`${x.t.name} deactivated`); } }) }] : []),
                  ] : []),
                ]} />
            ) },
          ]}
        />
        <Pagination page={pg.page} pages={pg.pages} onPage={pg.setPage} label={`Showing ${pg.from}–${pg.to} of ${rows.length} tenants`} />
      </Card>
      {confirm.node}
      <MoveTenantDialog tenant={moveFor} onClose={() => setMoveFor(null)} />
    </Page>
  );
}

function MoveTenantDialog({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const { state, moveTenant } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const toast = useToast();
  const [unitId, setUnitId] = useState('');
  useEffect(() => setUnitId(''), [tenant]);
  const vacant = scope.units.filter((u) => u.status === 'vacant');
  return (
    <Dialog open={!!tenant} onClose={onClose} title="Move tenant" subtitle={tenant ? `${tenant.name} · currently ${lookup.property(tenant.propertyId)?.short} ${lookup.unit(tenant.unitId)?.code}` : ''} width={460}
      footer={<><Button title="Cancel" variant="secondary" onPress={onClose} /><Button title="Move tenant" disabled={!unitId} onPress={() => { if (tenant) { moveTenant(tenant.id, unitId); toast(`${tenant.name} moved to ${lookup.property(state.units.find((u) => u.id === unitId)?.propertyId)?.short} ${state.units.find((u) => u.id === unitId)?.code}`); onClose(); } }} /></>}>
      <Select label="New unit" required value={unitId} onChange={setUnitId} options={vacant.map((u) => ({ value: u.id, label: `${lookup.property(u.propertyId)?.short} · ${u.code}`, sub: `${u.type} · ${naira(u.rent)}/yr` }))} hint="Only vacant units are listed. The current lease moves with the tenant at the new unit's rent." />
    </Dialog>
  );
}

// ---------------------------------------------------------------- Profile

export function TenantProfileScreen({ id }: { id: string }) {
  const { state, me, approveTenant, deactivateTenant, updateTenant, addDocument } = useStore();
  const lookup = useLookup();
  const { navigate, route } = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(route.params.edit === '1');
  const [moveOpen, setMoveOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const t = state.tenants.find((x) => x.id === id);
  const [form, setForm] = useState({ name: t?.name ?? '', email: t?.email ?? '', phone: t?.phone ?? '', address: t?.address ?? '', kinName: t?.nextOfKin.name ?? '', kinPhone: t?.nextOfKin.phone ?? '', kinRel: t?.nextOfKin.relationship ?? '' });
  if (!t) return <Page><Card><EmptyState icon={Users} title="Tenant not found" action={<Button title="Back to tenants" onPress={() => navigate('tenants')} />} /></Card></Page>;
  const unit = lookup.unit(t.unitId);
  const prop = lookup.property(t.propertyId);
  const block = lookup.block(unit?.blockId);
  const lease = lookup.currentLease(t.id);
  const leases = state.leases.filter((l) => l.tenantId === t.id).sort((a, b) => (a.start < b.start ? 1 : -1));
  const reqs = state.requests.filter((r) => r.tenantId === t.id);
  const docs = state.documents.filter((d) => d.tenantId === t.id);
  const comms = state.notifications.filter((n) => n.audience === t.id).slice(0, 4);
  const logs = state.logs.filter((l) => l.record === t.name || leases.some((x) => x.id === l.record) || reqs.some((r) => r.id === l.record)).slice(0, 12);
  const canEdit = me?.role === 'super_admin' || me?.role === 'manager';
  const days = lease ? daysUntil(lease.end) : 0;
  const total = lease ? daysBetween(lease.start, lease.end) : 1;

  const overview = (
    <Grid cols={{ mobile: 1, tablet: 2, desktop: 3 }}>
      <Card>
        <CardHeader title="Personal information" />
        <Grid cols={{ mobile: 2 }} gap={14}>
          <KV label="Full name" value={t.name} /><KV label="Date of birth" value={fmtDate(t.dob)} />
          <KV label="Previous address" value={t.address || '—'} style={{ minWidth: 200 }} /><View />
          <KV label="Tenant since" value={fmtDate(t.joinedAt)} /><KV label="Onboarding"><Badge label={t.onboarding === 'approved' ? 'Approved' : 'Pending'} tone={t.onboarding === 'approved' ? 'success' : 'warning'} dot /></KV>
        </Grid>
      </Card>
      <Card>
        <CardHeader title="Next of kin" />
        <Grid cols={{ mobile: 2 }} gap={14}>
          <KV label="Name" value={t.nextOfKin.name || '—'} /><KV label="Relationship" value={t.nextOfKin.relationship || '—'} />
          <KV label="Phone" value={t.nextOfKin.phone || '—'} /><KV label="Address" value={t.nextOfKin.address || '—'} />
        </Grid>
      </Card>
      <Card>
        <CardHeader title="Current lease" right={lease ? <LeaseBadge s={leaseStatus(lease)} /> : null} />
        {lease ? (
          <View style={{ gap: 12 }}>
            <Row justify="space-between" align="flex-end"><KV label="Days remaining" value={<T size={26} weight="bold" color={days < 0 ? colors.danger : colors.text}>{days}</T>} /><KV label="Lease ID" value={lease.id} style={{ alignItems: 'flex-end' }} /></Row>
            <ProgressBar value={Math.min(1, (total - Math.max(0, days)) / total)} color={days <= 30 ? colors.vizMaint : colors.primary} />
            <Row justify="space-between"><T size={11} color={colors.subtext}>{fmtDate(lease.start)}</T><T size={11} color={colors.subtext}>{fmtDate(lease.end)}</T></Row>
            <Notice tone="info" icon={Info}>{days > 90 ? `First renewal reminder goes out automatically on ${fmtDate(toISODate(addDays(new Date(lease.end), -90)))} (90 days).` : days >= 0 ? `Renewal reminders are in progress. ${lease.tenantIntent === 'renew' ? 'Tenant plans to renew.' : ''}` : 'This lease has expired. Renew it or record a move-out.'}</Notice>
            <Button title="Open lease" variant="soft" onPress={() => navigate('lease', { id: lease.id })} />
          </View>
        ) : <T size={12.5} color={colors.subtext}>No active lease.</T>}
      </Card>
      <Card>
        <CardHeader title="Employment" right={t.identification.verified ? <Badge label="Verified" tone="success" /> : null} />
        <Grid cols={{ mobile: 2 }} gap={14}>
          <KV label="Status" value={t.employment.status} /><KV label="Employer" value={t.employment.employer || '—'} />
          <KV label="Occupation" value={t.employment.occupation || '—'} /><KV label="Work address" value={t.employment.workAddress || '—'} />
        </Grid>
      </Card>
      <Card>
        <CardHeader title="Identification" right={<Badge label={t.identification.verified ? 'Verified' : 'Not verified'} tone={t.identification.verified ? 'success' : 'warning'} />} />
        <Grid cols={{ mobile: 2 }} gap={14}>
          <KV label="Type" value={t.identification.type} />
          <KV label="Number"><Row gap={8}><T size={13.5} weight="semibold">{revealed ? t.identification.number.replace(/•+/g, '48210') : t.identification.number || '—'}</T>{canEdit && t.identification.number ? <Link size={12} onPress={() => setRevealed(!revealed)}>{revealed ? 'Hide' : 'Reveal'}</Link> : null}</Row></KV>
        </Grid>
        <Row gap={8} style={{ marginTop: 12 }} wrap>
          {docs.filter((d) => d.folder === 'Tenant ID and KYC').slice(0, 2).map((d) => <View key={d.id} style={{ flex: 1, minWidth: 130 }}><FileRow name={d.name} kind={d.kind} meta="Identification" /></View>)}
        </Row>
      </Card>
      <Card>
        <CardHeader title="Maintenance" right={<Link onPress={() => setTab('maintenance')}>All {reqs.length}</Link>} />
        <View style={{ gap: 10 }}>
          {reqs.slice(0, 3).map((r) => (
            <Touch key={r.id} onPress={() => navigate('request', { id: r.id })} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}><T size={13} weight="semibold" numberOfLines={1}>{r.title}</T><T size={11.5} color={colors.subtext}>{r.id} · {fmtShort(r.createdAt)}</T></View>
              <RequestStatusBadge s={r.status} />
            </Touch>
          ))}
          {!reqs.length ? <T size={12.5} color={colors.subtext}>No requests yet.</T> : null}
        </View>
      </Card>
      <Card>
        <CardHeader title="Lease history" right={<Link onPress={() => setTab('lease')}>All leases</Link>} />
        <DataTable rows={leases.slice(0, 3)} keyOf={(l) => l.id} onRowPress={(l) => navigate('lease', { id: l.id })} dense columns={[
          { key: 'i', title: 'Lease', min: 80, render: (l) => <T mono size={12} color={colors.primary}>{l.id}</T> },
          { key: 's', title: 'Start', min: 90, render: (l) => <T size={12.5}>{fmtDate(l.start)}</T> },
          { key: 'st', title: 'Status', min: 100, render: (l) => <LeaseBadge s={leaseStatus(l)} /> },
        ]} />
      </Card>
      <Card>
        <CardHeader title="Recent communication" right={<Link onPress={() => setTab('communication')}>All</Link>} />
        <View style={{ gap: 10 }}>
          {comms.map((n) => (
            <Row key={n.id} gap={10} align="flex-start">
              <IconTile icon={n.category === 'Announcement' ? MessageSquare : Mail} tone={n.category === 'Announcement' ? 'purple' : 'info'} size={28} iconSize={13} />
              <View style={{ flex: 1 }}><T size={12.5} weight="semibold" numberOfLines={1}>{n.title}</T><T size={11.5} color={colors.subtext}>{fmtShort(n.at)} · {n.read ? 'Read' : 'Delivered'}</T></View>
            </Row>
          ))}
          {!comms.length ? <T size={12.5} color={colors.subtext}>No messages yet.</T> : null}
        </View>
      </Card>
      <Card>
        <CardHeader title="Uploaded documents" right={canEdit ? <Button title="Upload" icon={Upload} size="sm" variant="secondary" onPress={() => { addDocument({ name: `Guarantor form – ${t.name}.pdf`, kind: 'pdf', folder: 'Tenant ID and KYC', linkedTo: `${prop?.short ?? ''} · ${unit?.code ?? ''}`, tenantId: t.id, propertyId: t.propertyId, sizeKb: 310 }); toast('Document uploaded'); }} /> : null} />
        <View style={{ gap: 8 }}>{docs.slice(0, 4).map((d) => <FileRow key={d.id} name={d.name} kind={d.kind} meta={`${d.folder} · ${(d.sizeKb / 1024).toFixed(1)} MB`} />)}</View>
      </Card>
    </Grid>
  );

  const tabContent = () => {
    if (tab === 'overview') return overview;
    if (tab === 'lease') return (
      <Card pad={0}><DataTable rows={leases} keyOf={(l) => l.id} onRowPress={(l) => navigate('lease', { id: l.id })} columns={[
        { key: 'i', title: 'Lease ID', min: 90, render: (l) => <T mono size={12.5} color={colors.primary}>{l.id}</T> },
        { key: 'u', title: 'Unit', min: 90, render: (l) => <T size={13}>{lookup.property(l.propertyId)?.short} {lookup.unit(l.unitId)?.code}</T> },
        { key: 's', title: 'Start', min: 100, render: (l) => <T size={13}>{fmtDate(l.start)}</T> },
        { key: 'e', title: 'End', min: 100, render: (l) => <T size={13}>{fmtDate(l.end)}</T> },
        { key: 'r', title: 'Annual rent', min: 110, render: (l) => <T size={13}>{naira(l.rent)}</T> },
        { key: 'st', title: 'Status', min: 110, render: (l) => <LeaseBadge s={leaseStatus(l)} /> },
      ]} /></Card>
    );
    if (tab === 'documents') return <Card><Grid cols={{ mobile: 1, tablet: 2, desktop: 3 }} gap={10}>{docs.map((d) => <FileRow key={d.id} name={d.name} kind={d.kind} meta={`${d.folder} · ${fmtDate(d.date)}`} />)}</Grid>{!docs.length ? <EmptyState icon={FileText} title="No documents" /> : null}</Card>;
    if (tab === 'maintenance') return (
      <Card pad={0}><DataTable rows={reqs} keyOf={(r) => r.id} onRowPress={(r) => navigate('request', { id: r.id })} empty={<EmptyState icon={FileText} title="No requests" />} columns={[
        { key: 'i', title: 'Request', min: 90, render: (r) => <T mono size={12.5} color={colors.primary}>{r.id}</T> },
        { key: 't', title: 'Issue', flex: 2, min: 180, render: (r) => <T size={13} numberOfLines={1}>{r.title}</T> },
        { key: 'd', title: 'Date', min: 90, render: (r) => <T size={13}>{fmtShort(r.createdAt)}</T> },
        { key: 's', title: 'Status', min: 110, render: (r) => <RequestStatusBadge s={r.status} /> },
      ]} /></Card>
    );
    if (tab === 'communication') return (
      <Card>{state.notifications.filter((n) => n.audience === t.id).map((n) => (
        <Row key={n.id} gap={10} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }} align="flex-start">
          <IconTile icon={Mail} tone="info" size={28} iconSize={13} />
          <View style={{ flex: 1 }}><T size={13} weight="semibold">{n.title}</T><T size={12} color={colors.subtext}>{n.body}</T></View>
          <T size={11.5} color={colors.subtext}>{fmtShort(n.at)}</T>
        </Row>
      ))}{!state.notifications.some((n) => n.audience === t.id) ? <EmptyState icon={Mail} title="No messages yet" /> : null}</Card>
    );
    return (
      <Card>{logs.map((l) => (
        <Row key={l.id} gap={10} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <T size={12} color={colors.subtext} style={{ width: 110 }}>{fmtShort(l.at)}, {new Date(l.at).toTimeString().slice(0, 5)}</T>
          <T size={13} style={{ flex: 1 }}><T size={13} weight="semibold">{l.user}</T> {l.action.toLowerCase()} <T size={13} color={colors.subtext}>{l.record}</T></T>
        </Row>
      ))}{!logs.length ? <EmptyState icon={FileText} title="No activity recorded" /> : null}</Card>
    );
  };

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Tenants', to: 'tenants' }, { label: t.name }]} title="" />
      <Card pad={20} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' }}>
          <Row gap={14} align="flex-start" style={{ flexShrink: 1 }}>
            <Avatar name={t.name} size={60} />
            <View style={{ flexShrink: 1 }}>
              <Row gap={8} wrap>
                <T size={22} weight="bold">{t.name}</T>
                <Badge label={TENANT_STATUS[t.status].label.replace('Active', 'Active tenant')} tone={TENANT_STATUS[t.status].tone} dot />
                {lease ? <Badge label={days < 0 ? `Lease expired ${-days} days` : `Lease active · ${days} days`} tone={days < 0 ? 'danger' : days <= 30 ? 'warning' : 'accent'} /> : null}
              </Row>
              <Row gap={14} wrap style={{ marginTop: 6 }}>
                <T size={12.5} color={colors.subtext}>{t.code}</T>
                <Row gap={4}><Phone size={12} color={colors.subtext} /><T size={12.5} color={colors.subtext}>{t.phone}</T></Row>
                <Row gap={4}><Mail size={12} color={colors.subtext} /><T size={12.5} color={colors.subtext}>{t.email}</T></Row>
              </Row>
              {prop ? <Row gap={14} wrap style={{ marginTop: 4 }}>
                <Row gap={4}><Building2 size={12} color={colors.subtext} /><Link size={12.5} weight="medium" onPress={() => navigate('property', { id: prop.id })}>{prop.name}</Link></Row>
                <Row gap={4}><MapPin size={12} color={colors.subtext} /><Link size={12.5} weight="medium" onPress={() => unit && navigate('unit', { id: unit.id })}>{block?.name} · Flat {unit?.code}</Link></Row>
              </Row> : null}
            </View>
          </Row>
          {canEdit ? (
            <Row gap={8} wrap style={{ alignSelf: 'flex-start' }}>
              {t.status === 'pending' ? <Button title="Approve tenant" icon={ShieldCheck} size="sm" onPress={() => { approveTenant(t.id); toast(`${t.name} approved — lease is now active`); }} /> : null}
              <Button title="Edit" icon={Pencil} size="sm" variant="secondary" onPress={() => setEditOpen(true)} />
              <Button title="Message" icon={MessageSquare} size="sm" variant="secondary" onPress={() => navigate('communications', { tenantId: t.id })} />
              {t.status === 'active' ? <Button title="Move tenant" icon={ArrowLeftRight} size="sm" variant="secondary" onPress={() => setMoveOpen(true)} /> : null}
              {lease ? <Button title="Renew lease" icon={RefreshCw} size="sm" onPress={() => navigate('renew', { id: lease.id })} /> : null}
              {t.status === 'active' || t.status === 'pending' ? <Button icon={UserMinus} size="sm" variant="dangerGhost" onPress={() => confirm.ask({ title: `Deactivate ${t.name}?`, body: 'Their lease will be ended, the unit marked vacant and portal access removed.', confirm: 'Deactivate', danger: true, onConfirm: () => { deactivateTenant(t.id); toast(`${t.name} deactivated`); } })} /> : null}
            </Row>
          ) : null}
        </View>
        <Tabs value={tab} onChange={setTab} style={{ marginTop: 16, borderBottomWidth: 0 }} tabs={[
          { value: 'overview', label: 'Overview' }, { value: 'lease', label: 'Lease' }, { value: 'documents', label: 'Documents', count: docs.length },
          { value: 'maintenance', label: 'Maintenance', count: reqs.length }, { value: 'communication', label: 'Communication' }, { value: 'activity', label: 'Activity' },
        ]} />
      </Card>
      {tabContent()}
      {confirm.node}
      <MoveTenantDialog tenant={moveOpen ? t : null} onClose={() => setMoveOpen(false)} />
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit tenant" subtitle={t.code} footer={<><Button title="Cancel" variant="secondary" onPress={() => setEditOpen(false)} /><Button title="Save changes" onPress={() => { updateTenant(t.id, { name: form.name, email: form.email, phone: form.phone, address: form.address, nextOfKin: { ...t.nextOfKin, name: form.kinName, phone: form.kinPhone, relationship: form.kinRel } }); setEditOpen(false); toast('Tenant details saved'); }} /></>}>
        <View style={{ gap: 14 }}>
          <Input label="Full name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
          <Row gap={12} align="flex-start"><Input fieldStyle={{ flex: 1 }} label="Phone" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} /><Input fieldStyle={{ flex: 1 }} label="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} autoCapitalize="none" /></Row>
          <Input label="Previous address" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} />
          <Divider />
          <T size={13} weight="semibold">Next of kin</T>
          <Row gap={12} align="flex-start"><Input fieldStyle={{ flex: 1 }} label="Name" value={form.kinName} onChangeText={(v) => setForm({ ...form, kinName: v })} /><Input fieldStyle={{ flex: 1 }} label="Relationship" value={form.kinRel} onChangeText={(v) => setForm({ ...form, kinRel: v })} /></Row>
          <Input label="Phone" value={form.kinPhone} onChangeText={(v) => setForm({ ...form, kinPhone: v })} />
        </View>
      </Dialog>
    </Page>
  );
}

// ---------------------------------------------------------------- Onboarding wizard

const STEPS = ['Personal info', 'Next of kin', 'Employment', 'Identification', 'Property allocation', 'Lease', 'Review'];

function emptyDraft(startedBy: string, unitId?: string, state?: ReturnType<typeof useStore>['state']): OnboardingDraft {
  const u = unitId && state ? state.units.find((x) => x.id === unitId) : undefined;
  const p = u && state ? state.properties.find((x) => x.id === u.propertyId) : undefined;
  const start = toISODate(addDays(new Date(), 7));
  return {
    id: uid('onb'), step: 1, startedBy, savedAt: new Date().toISOString(),
    personal: { name: '', phone: '', email: '', address: '', dob: '1992-01-01', gender: 'Female' },
    kin: { name: '', relationship: 'Sister', phone: '', email: '', address: '' },
    employment: { status: 'Employed', employer: '', occupation: '', workAddress: '' },
    id_: { type: 'National ID (NIN slip)', number: '', docUploaded: false, photoUploaded: false },
    allocation: { locationId: p?.locationId ?? '', propertyId: p?.id ?? '', blockId: u?.blockId ?? '', unitId: u?.id ?? '' },
    lease: { start, end: toISODate(addDays(addMonths(new Date(start), 12), -1)), agreementUploaded: false },
  };
}

export function OnboardingScreen() {
  const { state, me, saveDraft, discardDraft, submitOnboarding } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const { navigate, route, back } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const existing = route.params.draft ? state.drafts.find((d) => d.id === route.params.draft) : undefined;
  const [d, setD] = useState<OnboardingDraft>(() => existing ?? emptyDraft(me?.name ?? '', route.params.unitId, state));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(existing ? existing.savedAt : null);
  const step = d.step;
  const isAdmin = me?.role === 'super_admin';
  const progress = Math.round(((step - 1) / 6) * 100);

  const setP = (k: keyof OnboardingDraft['personal'], v: string) => setD((s) => ({ ...s, personal: { ...s.personal, [k]: v } }));
  const setK = (k: keyof OnboardingDraft['kin'], v: string) => setD((s) => ({ ...s, kin: { ...s.kin, [k]: v } }));
  const setE = (k: keyof OnboardingDraft['employment'], v: string) => setD((s) => ({ ...s, employment: { ...s.employment, [k]: v } as OnboardingDraft['employment'] }));
  const setI = (k: keyof OnboardingDraft['id_'], v: string | boolean) => setD((s) => ({ ...s, id_: { ...s.id_, [k]: v } }));
  const setA = (patch: Partial<OnboardingDraft['allocation']>) => setD((s) => ({ ...s, allocation: { ...s.allocation, ...patch } }));
  const setL = (patch: Partial<OnboardingDraft['lease']>) => setD((s) => ({ ...s, lease: { ...s.lease, ...patch } }));

  const validate = (n: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (n === 1) {
      if (d.personal.name.trim().split(' ').length < 2) e.name = 'Enter the full name as it appears on ID.';
      if (d.personal.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a valid phone number.';
      if (!/^\S+@\S+\.\S+$/.test(d.personal.email)) e.email = 'Enter a valid email.';
      if (!d.personal.address.trim()) e.address = 'Enter the current address.';
      if (state.tenants.some((t) => t.email.toLowerCase() === d.personal.email.toLowerCase() && t.status !== 'former' && t.status !== 'deactivated')) e.email = 'A tenant with this email already exists.';
    }
    if (n === 2) {
      if (!d.kin.name.trim()) e.kinName = 'Enter the next of kin’s name.';
      if (d.kin.phone.replace(/\D/g, '').length < 10) e.kinPhone = 'Enter a valid phone number.';
      if (!d.kin.address.trim()) e.kinAddress = 'Enter an address.';
    }
    if (n === 3 && (d.employment.status === 'Employed' || d.employment.status === 'Self-employed')) {
      if (!d.employment.employer.trim()) e.employer = 'Enter the employer or business name.';
      if (!d.employment.occupation.trim()) e.occupation = 'Enter the occupation.';
    }
    if (n === 4) {
      if (!d.id_.number.trim()) e.idNumber = 'Enter the ID number.';
      if (!d.id_.docUploaded) e.idDoc = 'Upload the identification document.';
      if (!d.id_.photoUploaded) e.photo = 'Upload a passport photograph.';
    }
    if (n === 5 && !d.allocation.unitId) e.unit = 'Choose a vacant flat.';
    if (n === 6) {
      if (!d.lease.start || !d.lease.end || d.lease.end <= d.lease.start) e.lease = 'The end date must be after the start date.';
    }
    return e;
  };

  const go = (n: number) => {
    if (n > step) {
      for (let s = step; s < n; s++) {
        const e = validate(s);
        if (Object.keys(e).length) { setErrors(e); setD((x) => ({ ...x, step: s })); toast('Complete the required fields to continue', 'danger'); return; }
      }
    }
    setErrors({});
    setD((x) => ({ ...x, step: n }));
  };

  const save = () => { saveDraft(d); setSaved(new Date().toISOString()); toast('Draft saved'); };
  const submit = (approve: boolean) => {
    for (let s = 1; s <= 6; s++) { const e = validate(s); if (Object.keys(e).length) { setErrors(e); setD((x) => ({ ...x, step: s })); toast('Some details are missing', 'danger'); return; } }
    const id = submitOnboarding(d, approve);
    toast(approve ? `${d.personal.name} approved — portal invite sent` : `Sent to the landlord for approval`);
    navigate('tenant', { id });
  };

  const unit = lookup.unit(d.allocation.unitId);
  const prop = lookup.property(d.allocation.propertyId);
  const block = lookup.block(d.allocation.blockId);

  const stepper = (
    <Card pad={12} style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: bp === 'mobile' ? 'wrap' : 'nowrap', gap: 6 }}>
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < step, cur = n === step;
          return (
            <React.Fragment key={s}>
              <Touch onPress={() => go(n)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: done ? colors.primary : colors.card, borderWidth: cur ? 2 : 1, borderColor: done || cur ? colors.primary : colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                  {done ? <Check size={12} color={colors.white} strokeWidth={3} /> : <T size={11} weight="bold" color={cur ? colors.primary : colors.subtext}>{n}</T>}
                </View>
                {bp !== 'mobile' || cur ? <T size={12} weight={cur ? 'semibold' : 'medium'} color={cur || done ? colors.text : colors.subtext} numberOfLines={1}>{s}</T> : null}
              </Touch>
              {i < STEPS.length - 1 ? <View style={{ flex: 1, minWidth: 10, height: 2, backgroundColor: done ? colors.primary : colors.border }} /> : null}
            </React.Fragment>
          );
        })}
      </View>
    </Card>
  );

  const unitGrid = () => {
    const units = state.units.filter((u) => u.propertyId === d.allocation.propertyId && (!d.allocation.blockId || u.blockId === d.allocation.blockId));
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {units.map((u) => {
          const ok = u.status === 'vacant' && !state.tenants.some((t) => t.unitId === u.id && t.status === 'pending');
          const sel = u.id === d.allocation.unitId;
          return (
            <Touch key={u.id} disabled={!ok} onPress={() => setA({ unitId: u.id, blockId: u.blockId })} style={{ width: 92, borderRadius: radius.md, borderWidth: sel ? 2 : 1, borderStyle: ok && !sel ? 'dashed' : 'solid', borderColor: sel ? colors.primary : ok ? colors.vizVacant : colors.border, backgroundColor: sel ? colors.primaryTint : ok ? colors.card : colors.cardAlt, padding: 9, opacity: ok ? 1 : 0.6 }}>
              <T size={12.5} weight="bold" color={ok ? colors.text : colors.subtext}>{u.code}</T>
              <T size={11} color={sel ? colors.primary : ok ? colors.info : colors.faint}>{sel ? 'Selected' : ok ? 'Available' : u.status === 'maintenance' ? 'Maintenance' : 'Occupied'}</T>
            </Touch>
          );
        })}
      </View>
    );
  };

  const body = () => {
    switch (step) {
      case 1: return (
        <>
          <CardHeader title="Personal information" subtitle="As it appears on the tenant's identification document." />
          <View style={{ gap: 14 }}>
            <Input label="Full name" required value={d.personal.name} onChangeText={(v) => setP('name', v)} error={errors.name} placeholder="e.g. Segun Afolabi" />
            <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
              <Input label="Phone number" required value={d.personal.phone} onChangeText={(v) => setP('phone', v)} error={errors.phone} keyboardType="phone-pad" placeholder="+234 816 332 9087" />
              <Input label="Email address" required value={d.personal.email} onChangeText={(v) => setP('email', v)} error={errors.email} autoCapitalize="none" placeholder="name@mail.com" />
            </Grid>
            <Input label="Current residential address" required value={d.personal.address} onChangeText={(v) => setP('address', v)} error={errors.address} placeholder="7 Ogunlana Drive, Surulere, Lagos" />
            <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
              <Input label="Date of birth" required value={fmtSlash(d.personal.dob)} onChangeText={(v) => { const m = v.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/); if (m) setP('dob', `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`); }} right={<Calendar size={15} color={colors.faint} />} hint="DD / MM / YYYY" />
              <Select label="Gender" required value={d.personal.gender} onChange={(v) => setP('gender', v)} options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }]} />
            </Grid>
          </View>
        </>
      );
      case 2: return (
        <>
          <CardHeader title="Next of kin" subtitle="Who we contact in an emergency." />
          <View style={{ gap: 14 }}>
            <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
              <Input label="Full name" required value={d.kin.name} onChangeText={(v) => setK('name', v)} error={errors.kinName} placeholder="Bolanle Afolabi" />
              <Select label="Relationship" required value={d.kin.relationship} onChange={(v) => setK('relationship', v)} options={['Sister', 'Brother', 'Spouse', 'Mother', 'Father', 'Friend', 'Other'].map((x) => ({ value: x, label: x }))} />
              <Input label="Phone number" required value={d.kin.phone} onChangeText={(v) => setK('phone', v)} error={errors.kinPhone} keyboardType="phone-pad" placeholder="+234 802 190 4476" />
              <Input label="Email" optional value={d.kin.email} onChangeText={(v) => setK('email', v)} autoCapitalize="none" placeholder="name@example.com" />
            </Grid>
            <Input label="Address" required value={d.kin.address} onChangeText={(v) => setK('address', v)} error={errors.kinAddress} placeholder="21 Bode Thomas Street, Surulere, Lagos" />
          </View>
        </>
      );
      case 3: return (
        <>
          <CardHeader title="Employment information" subtitle="Helps assess affordability. Kept confidential." />
          <View style={{ gap: 14 }}>
            <View style={{ gap: 8 }}>
              <T size={12.5} weight="semibold" color={colors.textSoft}>Employment status <T size={12.5} color={colors.danger}>*</T></T>
              <Row wrap gap={8}>{(['Employed', 'Self-employed', 'Student', 'Retired', 'Unemployed'] as const).map((s) => <Chip key={s} label={s} active={d.employment.status === s} onPress={() => setE('status', s)} />)}</Row>
            </View>
            {d.employment.status === 'Employed' || d.employment.status === 'Self-employed' ? (
              <>
                <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
                  <Input label={d.employment.status === 'Employed' ? 'Employer' : 'Business name'} required value={d.employment.employer} onChangeText={(v) => setE('employer', v)} error={errors.employer} placeholder="Interswitch Group" />
                  <Input label="Occupation" required value={d.employment.occupation} onChangeText={(v) => setE('occupation', v)} error={errors.occupation} placeholder="Product Designer" />
                </Grid>
                <Input label="Work address" value={d.employment.workAddress} onChangeText={(v) => setE('workAddress', v)} placeholder="1648C Oko-Awo Street, Victoria Island, Lagos" />
              </>
            ) : <Notice tone="info">{d.employment.status === 'Student' ? 'A guarantor form is required for students. Upload it in the Documents tab after approval.' : 'No employer details needed. You can add a guarantor after approval.'}</Notice>}
          </View>
        </>
      );
      case 4: return (
        <>
          <CardHeader title="Identification" subtitle="Documents are encrypted and visible to admins and the assigned manager only." />
          <View style={{ gap: 14 }}>
            <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
              <Select label="Identification type" required value={d.id_.type} onChange={(v) => setI('type', v)} options={['National ID (NIN slip)', 'International passport', "Driver's licence", "Voter's card"].map((x) => ({ value: x, label: x }))} />
              <Input label="National ID / Passport number" required value={d.id_.number} onChangeText={(v) => setI('number', v)} error={errors.idNumber} placeholder="NIN 4821•••903" />
            </Grid>
            <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
              <View style={{ gap: 8 }}>
                <T size={12.5} weight="semibold" color={colors.textSoft}>Upload identification <T size={12.5} color={colors.danger}>*</T></T>
                {d.id_.docUploaded
                  ? <FileRow name="nin-slip-front.jpg" kind="jpg" meta="1.8 MB · uploaded" right={<Row gap={8}><CircleCheck size={16} color={colors.success} /><Touch onPress={() => setI('docUploaded', false)}><X size={15} color={colors.subtext} /></Touch></Row>} />
                  : <Touch onPress={() => setI('docUploaded', true)} style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: errors.idDoc ? colors.danger : colors.borderStrong, borderRadius: radius.md, padding: 16, alignItems: 'center', gap: 4 }} hoverStyle={{ borderColor: colors.primary }}><Upload size={16} color={colors.subtext} /><T size={12.5} weight="semibold">Upload front of ID</T><T size={11} color={colors.subtext}>JPG, PNG or PDF up to 10 MB</T></Touch>}
                <Link size={12} onPress={() => toast('Back of ID added')}>+ Add back of ID (optional)</Link>
                {errors.idDoc ? <T size={11.5} color={colors.danger}>{errors.idDoc}</T> : null}
              </View>
              <View style={{ gap: 8 }}>
                <T size={12.5} weight="semibold" color={colors.textSoft}>Upload passport photograph <T size={12.5} color={colors.danger}>*</T></T>
                <Row gap={12}>
                  <View style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: d.id_.photoUploaded ? colors.infoSoft : colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: errors.photo ? colors.danger : colors.border }}>
                    {d.id_.photoUploaded ? <T size={20} weight="bold" color={colors.info}>{d.personal.name ? d.personal.name.split(' ').map((x) => x[0]).slice(0, 2).join('') : 'SA'}</T> : <Upload size={16} color={colors.faint} />}
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <T size={11.5} color={colors.subtext}>Plain background, face clearly visible. JPG or PNG.</T>
                    <Row gap={10}>
                      <Button title={d.id_.photoUploaded ? 'Replace' : 'Upload'} size="sm" variant="secondary" onPress={() => setI('photoUploaded', true)} />
                      {d.id_.photoUploaded ? <Button title="Remove" size="sm" variant="ghost" onPress={() => setI('photoUploaded', false)} /> : null}
                    </Row>
                  </View>
                </Row>
                {errors.photo ? <T size={11.5} color={colors.danger}>{errors.photo}</T> : null}
              </View>
            </Grid>
          </View>
        </>
      );
      case 5: return (
        <>
          <CardHeader title="Property allocation" subtitle="Only vacant units can be selected." />
          <View style={{ gap: 14 }}>
            <Grid cols={{ mobile: 1, tablet: 3 }} gap={14}>
              <Select label="Location" required value={d.allocation.locationId} onChange={(v) => setA({ locationId: v, propertyId: '', blockId: '', unitId: '' })} options={scope.locations.map((l) => ({ value: l.id, label: l.name }))} />
              <Select label="Property" required value={d.allocation.propertyId} onChange={(v) => setA({ propertyId: v, blockId: '', unitId: '' })} options={scope.properties.filter((p) => !d.allocation.locationId || p.locationId === d.allocation.locationId).map((p) => ({ value: p.id, label: p.name }))} />
              <Select label="Block" value={d.allocation.blockId || 'all'} onChange={(v) => setA({ blockId: v === 'all' ? '' : v })} options={[{ value: 'all', label: 'All blocks' }, ...state.blocks.filter((b) => b.propertyId === d.allocation.propertyId).map((b) => ({ value: b.id, label: b.name }))]} />
            </Grid>
            <Row justify="space-between"><T size={12.5} weight="semibold" color={colors.textSoft}>Flat / unit <T size={12.5} color={colors.danger}>*</T></T><Row gap={12}><Row gap={5}><View style={{ width: 9, height: 9, borderRadius: 2, borderWidth: 1.5, borderColor: colors.vizVacant, borderStyle: 'dashed' }} /><T size={11.5} color={colors.subtext}>Available</T></Row><Row gap={5}><View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: colors.border }} /><T size={11.5} color={colors.subtext}>Unavailable</T></Row></Row></Row>
            {d.allocation.propertyId ? unitGrid() : <T size={12.5} color={colors.subtext}>Choose a property to see its units.</T>}
            {errors.unit ? <T size={11.5} color={colors.danger}>{errors.unit}</T> : null}
            {unit ? <Notice tone="success" icon={Check}>{`Flat ${unit.code} selected · ${unit.type} · ${unit.floor === 0 ? 'Ground floor' : `Floor ${unit.floor}`} · ${naira(unit.rent)} per year · vacant for ${Math.max(0, -daysUntil(unit.vacantSince ?? todayISO()))} days`}</Notice> : null}
          </View>
        </>
      );
      case 6: return (
        <>
          <CardHeader title="Lease" subtitle="Lease reminders are sent automatically at 90, 60 and 30 days before the end date." />
          <View style={{ gap: 14 }}>
            <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
              <DateField label="Lease start date" value={d.lease.start} onChange={(v) => setL({ start: v, end: toISODate(addDays(addMonths(new Date(v + 'T00:00:00'), 12), -1)) })} />
              <DateField label="Lease end date" value={d.lease.end} onChange={(v) => setL({ end: v })} hint={`Duration: ${Math.max(1, Math.round(daysBetween(d.lease.start, d.lease.end) / 30.4))} months`} />
            </Grid>
            {errors.lease ? <T size={11.5} color={colors.danger}>{errors.lease}</T> : null}
            {unit ? (
              <Grid cols={{ mobile: 2, tablet: 4 }} gap={12}>
                <KV label="Annual rent" value={naira(unit.rent)} /><KV label="Service charge" value={naira(unit.serviceCharge)} /><KV label="Caution deposit" value={naira(unit.deposit)} /><KV label="Payment" value="Annually, in advance" />
              </Grid>
            ) : null}
            {d.lease.agreementUploaded
              ? <FileRow name={`Tenancy agreement – ${d.personal.name || 'tenant'}.pdf`} kind="pdf" meta="Signed agreement · 2.4 MB" right={<Touch onPress={() => setL({ agreementUploaded: false })}><X size={15} color={colors.subtext} /></Touch>} />
              : <Touch onPress={() => setL({ agreementUploaded: true })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: radius.md, padding: 14 }} hoverStyle={{ borderColor: colors.primary }}>
                  <IconTile icon={Upload} tone="neutral" size={32} />
                  <View style={{ flex: 1 }}><T size={13} weight="semibold">Drop the signed agreement here</T><T size={11.5} color={colors.subtext}>PDF up to 20 MB · or <T size={11.5} weight="semibold" color={colors.primary}>browse</T></T></View>
                  <Badge label="E-signature · Phase 2" tone="neutral" size="sm" />
                </Touch>}
          </View>
        </>
      );
      default: return (
        <>
          <CardHeader title="Review & submit" subtitle="Check everything before sending for approval." right={<Badge label="All required fields complete" tone="success" dot />} />
          <View style={{ gap: 12 }}>
            <Row justify="space-between" style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 14 }} wrap gap={10}>
              <Row gap={12}><Avatar name={d.personal.name || 'New Tenant'} size={42} tone={[colors.infoSoft, colors.info]} /><View><T size={14.5} weight="semibold">{d.personal.name}</T><T size={12} color={colors.subtext}>{d.personal.phone} · {d.personal.email}</T></View></Row>
              <View style={{ alignItems: 'flex-end' }}><T size={11.5} color={colors.subtext}>Allocated unit</T><T size={13} weight="semibold">{prop?.short} · {unit?.code}</T></View>
            </Row>
            <Grid cols={{ mobile: 1, tablet: 2 }} gap={12}>
              <ReviewBlock title="Personal information" onEdit={() => go(1)} items={[['Date of birth', fmtDate(d.personal.dob)], ['Address', d.personal.address]]} />
              <ReviewBlock title="Next of kin" onEdit={() => go(2)} items={[['Name', d.kin.name], ['Relationship', d.kin.relationship]]} />
              <ReviewBlock title="Employment" onEdit={() => go(3)} items={[['Employer', d.employment.employer || d.employment.status], ['Occupation', d.employment.occupation || '—']]} />
              <ReviewBlock title="Identification" onEdit={() => go(4)} items={[['Type', d.id_.type.split(' (')[0]], ['Documents', `${d.id_.docUploaded ? 'ID' : ''}${d.id_.photoUploaded ? ' + photo ✓' : ''}`]]} />
            </Grid>
            <ReviewBlock title="Lease" onEdit={() => go(6)} items={[['Start', fmtPadded(d.lease.start)], ['End', fmtPadded(d.lease.end)], ['Duration', `${Math.round(daysBetween(d.lease.start, d.lease.end) / 30.4)} months`], ['Agreement', d.lease.agreementUploaded ? 'Uploaded ✓' : 'Not uploaded']]} />
          </View>
        </>
      );
    }
  };

  const side = (
    <View style={{ gap: 14, width: bp === 'desktop' ? 280 : '100%' }}>
      <Card pad={16}>
        <Row justify="space-between"><T size={13} weight="semibold">Progress</T><T size={13} weight="bold">{step === 7 ? 100 : progress}%</T></Row>
        <ProgressBar value={(step === 7 ? 100 : progress) / 100} style={{ marginTop: 10 }} />
        <T size={11.5} color={colors.subtext} style={{ marginTop: 8 }}>Draft ID {d.id.slice(-8).toUpperCase()} · started by {d.startedBy}</T>
      </Card>
      <Card pad={16}>
        <T size={13} weight="semibold" style={{ marginBottom: 12 }}>Approval flow</T>
        {[
          { t: 'Manager completes form', s: d.startedBy, done: step === 7 },
          { t: 'Landlord approves', s: state.users.find((u) => u.role === 'super_admin')?.name ?? 'Landlord', cur: step === 7 },
          { t: 'Tenant portal invite sent', s: 'Email • SMS' },
        ].map((x, i) => (
          <Row key={x.t} gap={10} align="flex-start">
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: x.done || x.cur || i === 0 ? colors.primary : colors.borderStrong, backgroundColor: x.done || i === 0 ? colors.primary : colors.card, alignItems: 'center', justifyContent: 'center' }}>{x.done ? <Check size={9} color={colors.white} strokeWidth={3} /> : null}</View>
              {i < 2 ? <View style={{ width: 2, height: 24, backgroundColor: colors.border }} /> : null}
            </View>
            <View style={{ flex: 1 }}><T size={12.5} weight="semibold">{x.t}</T><T size={11.5} color={colors.subtext}>{x.s}</T></View>
          </Row>
        ))}
      </Card>
      {unit ? <Notice tone="info" icon={Info}>{`Unit ${unit.code} is held for this tenant for 48 hours while the onboarding is in draft.`}</Notice> : null}
    </View>
  );

  return (
    <Page footer={
      <StickyFooter>
        <Button title="Save draft" icon={Save} variant="ghost" onPress={save} />
        {saved ? <T size={11.5} color={colors.subtext}>Saved {timeAgo(saved)}</T> : null}
        <View style={{ flex: 1 }} />
        {step > 1 ? <Button title="Previous" icon={ChevronLeft} variant="secondary" onPress={() => go(step - 1)} /> : null}
        {step < 7 ? <Button title="Next" iconRight={ChevronRight} onPress={() => go(step + 1)} /> : (
          <>
            <Button title="Submit for approval" variant="secondary" onPress={() => submit(false)} />
            {isAdmin ? <Button title="Approve tenant" icon={Check} onPress={() => submit(true)} /> : null}
          </>
        )}
      </StickyFooter>
    }>
      <PageHeader crumbs={[{ label: 'Tenants', to: 'tenants' }, { label: 'New tenant onboarding' }]} title="Onboard a new tenant"
        subtitle={`Step ${step} of 7 · ${STEPS[step - 1]}${saved ? ` · Draft saved ${timeAgo(saved)}` : ''}`}
        actions={<Button title="Exit onboarding" variant="ghost" onPress={() => { if (!existing) discardDraft(d.id); back('tenants'); }} />} />
      {stepper}
      <View style={{ flexDirection: bp === 'desktop' ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ flex: 1, width: '100%', minHeight: 420 }}>{body()}</Card>
        {side}
      </View>
    </Page>
  );
}

function ReviewBlock({ title, items, onEdit }: { title: string; items: Array<[string, string]>; onEdit: () => void }) {
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, flex: 1 }}>
      <Row justify="space-between" style={{ marginBottom: 10 }}><T size={12.5} weight="semibold">{title}</T><Link size={12} onPress={onEdit}>Edit</Link></Row>
      <Row gap={18} wrap align="flex-start">{items.map(([k, v]) => <KV key={k} label={k} value={v} />)}</Row>
    </View>
  );
}

/** Simple date picker: text field + month calendar popover. */
export function DateField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(value + 'T00:00:00'));
  const sel = new Date(value + 'T00:00:00');
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((startDow + days) / 7) * 7 }).map((_, i) => i - startDow + 1);
  return (
    <View style={{ gap: 6 }}>
      <T size={12.5} weight="semibold" color={colors.textSoft}>{label} <T size={12.5} color={colors.danger}>*</T></T>
      <Touch onPress={() => { setMonth(new Date(value + 'T00:00:00')); setOpen(!open); }} style={{ height: 42, borderWidth: 1, borderColor: open ? colors.primary : colors.border, borderRadius: radius.md, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card }}>
        <T size={13.5} style={{ flex: 1 }}>{fmtPadded(value)}</T>
        <Calendar size={15} color={colors.subtext} />
      </Touch>
      {hint ? <T size={11.5} color={colors.subtext}>{hint}</T> : null}
      {open ? (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, backgroundColor: colors.card, maxWidth: 300 }}>
          <Row justify="space-between" style={{ marginBottom: 8 }}>
            <Touch onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={{ padding: 4 }}><ChevronLeft size={16} color={colors.textSoft} /></Touch>
            <T size={13} weight="semibold">{month.toLocaleString('en-GB', { month: 'long' })} {month.getFullYear()}</T>
            <Touch onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={{ padding: 4 }}><ChevronRight size={16} color={colors.textSoft} /></Touch>
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((w) => <View key={w} style={{ width: '14.28%', alignItems: 'center', paddingVertical: 4 }}><T size={11} color={colors.subtext}>{w}</T></View>)}
            {cells.map((n, i) => {
              const valid = n >= 1 && n <= days;
              const isSel = valid && sel.getFullYear() === month.getFullYear() && sel.getMonth() === month.getMonth() && sel.getDate() === n;
              return (
                <Touch key={i} disabled={!valid} onPress={() => { onChange(toISODate(new Date(month.getFullYear(), month.getMonth(), n))); setOpen(false); }} style={{ width: '14.28%', alignItems: 'center', paddingVertical: 3 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? colors.primary : 'transparent' }}>
                    <T size={12} weight={isSel ? 'bold' : 'regular'} color={isSel ? colors.white : valid ? colors.text : 'transparent'}>{valid ? n : ''}</T>
                  </View>
                </Touch>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export { Flag, Segmented, Checkbox };
