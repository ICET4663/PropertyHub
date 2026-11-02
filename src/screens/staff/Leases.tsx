import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  ArrowRight, Bell, Check, Clock, Download, Eye, FileText, Pencil, Plus, RefreshCw, Search, Send, TriangleAlert, Upload, XCircle, CalendarClock, RotateCw,
} from 'lucide-react-native';
import { colors, radius, useBreakpoint } from '../../theme';
import { usePick, useOpenDocument } from '../../components/files';
import { DOC_TYPES, pickDocuments } from '../../lib/files';
import { useLookup, useScope, useStore } from '../../store/AppContext';
import { useRouter } from '../../nav/router';
import { Page, PageHeader, StickyFooter } from '../../components/shell';
import { Avatar, Badge, Button, Card, CardHeader, Checkbox, Dialog, EmptyState, Grid, IconTile, Input, KV, Link, Notice, Row, Segmented, Select, T, Touch, useConfirm, useToast } from '../../components/ui';
import { DataTable, FileRow, LeaseBadge, Pagination, usePaged } from '../../components/data';
import { Timeline } from '../../components/charts';
import { DateField } from './Tenants';
import { addDays, addMonths, daysBetween, daysUntil, fmtDate, leaseStatus, naira, pct, toISODate } from '../../utils';

export function LeasesScreen() {
  const { me, sendLeaseReminder } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const { navigate, route } = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('all');
  const [prop, setProp] = useState(route.params.propertyId ?? 'all');
  const [status, setStatus] = useState('all');
  const [bucket, setBucket] = useState<string>(route.params.filter ?? 'action');
  const canEdit = me?.role === 'super_admin' || me?.role === 'manager';

  const all = useMemo(() => scope.currentLeases.map((l) => ({ l, d: daysUntil(l.end), s: leaseStatus(l) })), [scope.currentLeases]);
  const expired = all.filter((x) => x.d < 0);
  const w30 = all.filter((x) => x.d >= 0 && x.d <= 30);
  const w60 = all.filter((x) => x.d > 30 && x.d <= 60);
  const w90 = all.filter((x) => x.d > 60 && x.d <= 90);
  const renewalsDue = expired.length + w30.length;
  const thisWeek = w30.filter((x) => x.d <= 14).length;

  const rows = all.filter((x) => {
    if (bucket === 'action' && !(x.d <= 30)) return false;
    if (bucket === 'expired' && x.d >= 0) return false;
    if (bucket === '30' && !(x.d >= 0 && x.d <= 30)) return false;
    if (bucket === '60' && !(x.d > 30 && x.d <= 60)) return false;
    if (bucket === '90' && !(x.d > 60 && x.d <= 90)) return false;
    if (status !== 'all' && x.s !== status) return false;
    if (loc !== 'all' && lookup.property(x.l.propertyId)?.locationId !== loc) return false;
    if (prop !== 'all' && x.l.propertyId !== prop) return false;
    if (q && !`${x.l.id} ${lookup.tenant(x.l.tenantId)?.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => a.d - b.d);
  const pg = usePaged(rows, 10, `${bucket}${status}${loc}${prop}${q}`);

  const bulk = () => {
    const ids = [...w30, ...w60].map((x) => x.l.id);
    sendLeaseReminder(ids);
    toast(`Renewal reminders sent to ${ids.length} tenants`);
  };



  const dayBar = (d: number) => {
    const c = d < 0 ? colors.danger : d <= 30 ? colors.vizMaint : colors.primary;
    const w = d < 0 ? 1 : Math.max(0.08, Math.min(1, d / 180));
    return (
      <Row gap={8} style={{ width: '100%' }}>
        <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.neutralSoft, overflow: 'hidden', maxWidth: 90 }}><View style={{ width: `${w * 100}%`, height: '100%', backgroundColor: c }} /></View>
        <T size={12.5} weight="bold" color={d < 0 ? colors.danger : colors.text} style={{ width: 36 }}>{d}</T>
      </Row>
    );
  };

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Leases' }]} title="Lease management" subtitle={`${all.length} leases on record · reminders send automatically at 90, 60 and 30 days`}
        actions={canEdit ? <><Button title="Send bulk reminders" icon={Bell} variant="secondary" onPress={bulk} /><Button title="Create lease" icon={Plus} onPress={() => navigate('onboarding')} /></> : undefined} />
      <Grid cols={{ mobile: 2, tablet: 3, desktop: 6 }} gap={12}>
        <Stat icon={Check} tone="success" label="Active leases" value={all.filter((x) => x.d >= 0).length} sub={`${pct(all.filter((x) => x.d >= 0).length, scope.tenants.filter((t) => t.status === 'active').length, 0)} of tenants`} onPress={() => setBucket('all')} active={bucket === 'all'} />
        <Stat icon={Clock} tone="warning" label="Expiring ≤ 30 days" value={w30.length} sub={`${thisWeek} act this week`} onPress={() => setBucket('30')} active={bucket === '30'} />
        <Stat icon={CalendarClock} tone="accent" label="31–60 days" value={w60.length} sub="Reminder sent" onPress={() => setBucket('60')} active={bucket === '60'} />
        <Stat icon={CalendarClock} tone="neutral" label="61–90 days" value={w90.length} sub="Upcoming" onPress={() => setBucket('90')} active={bucket === '90'} />
        <Stat icon={TriangleAlert} tone="danger" label="Expired" value={expired.length} sub="Tenants still in unit" onPress={() => setBucket('expired')} active={bucket === 'expired'} />
        <Stat icon={RotateCw} tone="purple" label="Renewals due" value={renewalsDue} sub="Expired + ≤ 30 days" onPress={() => setBucket('action')} active={bucket === 'action'} />
      </Grid>
      <View style={{ height: 16 }} />
      <Card pad={0}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14, alignItems: 'center' }}>
          <View style={{ flexBasis: 220, flexGrow: 2 }}><Input leftIcon={Search} value={q} onChangeText={setQ} placeholder="Search lease ID or tenant" /></View>
          <View style={{ flexBasis: 140, flexGrow: 1 }}><Select compact value={loc} onChange={setLoc} options={[{ value: 'all', label: 'All locations' }, ...scope.locations.map((l) => ({ value: l.id, label: l.name }))]} /></View>
          <View style={{ flexBasis: 150, flexGrow: 1 }}><Select compact value={prop} onChange={setProp} options={[{ value: 'all', label: 'All properties' }, ...scope.properties.map((p) => ({ value: p.id, label: p.short }))]} /></View>
          <View style={{ flexBasis: 130, flexGrow: 1 }}><Select compact value={status} onChange={setStatus} options={[{ value: 'all', label: 'Any status' }, { value: 'active', label: 'Active' }, { value: 'expiring', label: 'Expiring soon' }, { value: 'expired', label: 'Expired' }]} /></View>
          <Segmented size="sm" value={bucket} onChange={setBucket} options={[{ value: 'all', label: 'All' }, { value: 'action', label: 'Needs action' }, { value: '30', label: '≤ 30 days' }, { value: '60', label: '≤ 60' }, { value: '90', label: '≤ 90' }, { value: 'expired', label: 'Expired' }]} />
        </View>
        <DataTable rows={pg.slice} keyOf={(x) => x.l.id} onRowPress={(x) => navigate('lease', { id: x.l.id })}
          empty={<EmptyState icon={FileText} title="No leases in this view" body="Try another filter." />}
          columns={[
            { key: 'i', title: 'Lease ID', min: 90, render: (x) => <T mono size={12.5} color={colors.primary}>{x.l.id}</T> },
            { key: 't', title: 'Tenant', flex: 1.4, min: 160, render: (x) => <Row gap={8}><Avatar name={lookup.tenant(x.l.tenantId)?.name ?? ''} size={26} /><T size={13} weight="semibold" numberOfLines={1}>{lookup.tenant(x.l.tenantId)?.name}</T></Row> },
            { key: 'p', title: 'Property', flex: 1.2, min: 140, render: (x) => <T size={13} color={colors.textSoft} numberOfLines={1}>{lookup.property(x.l.propertyId)?.short}</T> },
            { key: 'u', title: 'Unit', min: 60, flex: 0.5, render: (x) => <T size={13} color={colors.textSoft}>{lookup.unit(x.l.unitId)?.code}</T> },
            { key: 's', title: 'Start date', min: 100, render: (x) => <T size={13} color={colors.textSoft}>{fmtDate(x.l.start)}</T> },
            { key: 'e', title: 'End date', min: 100, render: (x) => <T size={13} color={colors.textSoft}>{fmtDate(x.l.end)}</T> },
            { key: 'd', title: 'Days remaining', min: 140, render: (x) => dayBar(x.d) },
            { key: 'st', title: 'Status', min: 120, render: (x) => <LeaseBadge s={x.s} /> },
            { key: 'a', title: 'Actions', min: 170, align: 'right', render: (x) => canEdit ? (
              <Row gap={6}>
                {x.d >= 0 && x.d <= 60 ? <Button title="Remind" size="sm" variant="ghost" onPress={() => { sendLeaseReminder([x.l.id]); toast(`Reminder sent to ${lookup.tenant(x.l.tenantId)?.name}`); }} /> : null}
                {x.d <= 90 ? <Button title="Renew" size="sm" onPress={() => navigate('renew', { id: x.l.id })} /> : <Button title="View" size="sm" variant="secondary" onPress={() => navigate('lease', { id: x.l.id })} />}
              </Row>
            ) : <Button title="View" size="sm" variant="secondary" onPress={() => navigate('lease', { id: x.l.id })} /> },
          ]} />
        <Pagination page={pg.page} pages={pg.pages} onPage={pg.setPage} label={`${renewalsDue} renewals need action · showing expired and ≤ 30 days first`} />
      </Card>
    </Page>
  );
}

// ---------------------------------------------------------------- Lease details

export function LeaseDetailScreen({ id }: { id: string }) {
  const { state, me, sendLeaseReminder, terminateLease, uploadLeaseAgreement } = useStore();
  const pick = usePick();
  const openDoc = useOpenDocument();
  const [uploading, setUploading] = useState(false);
  const lookup = useLookup();
  const { navigate } = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { bp } = useBreakpoint();
  const [editOpen, setEditOpen] = useState(false);
  const l = state.leases.find((x) => x.id === id);
  if (!l) return <Page><Card><EmptyState icon={FileText} title="Lease not found" action={<Button title="Back to leases" onPress={() => navigate('leases')} />} /></Card></Page>;
  const t = lookup.tenant(l.tenantId)!;
  const u = lookup.unit(l.unitId)!;
  const p = lookup.property(l.propertyId)!;
  const block = lookup.block(u?.blockId);
  const s = leaseStatus(l);
  const d = daysUntil(l.end);
  const total = daysBetween(l.start, l.end);
  const elapsed = Math.max(0, Math.min(total, total - d));
  const chain = state.leases.filter((x) => x.tenantId === l.tenantId).sort((a, b) => (a.start < b.start ? 1 : -1));
  const canEdit = me?.role === 'super_admin' || me?.role === 'manager';
  const endD = new Date(l.end + 'T00:00:00');
  // Uploaded agreements are stored as a path; older leases only have a file name.
  const agreementDoc = l.agreement.includes('/') ? state.documents.find((x) => x.storagePath === l.agreement) : undefined;
  const agreementName = agreementDoc?.name ?? (l.agreement.includes('/') ? l.agreement.split('/').pop()! : l.agreement);
  const uploadAgreement = async () => {
    const [f] = await pick(() => pickDocuments(DOC_TYPES), 'documents', DOC_TYPES);
    if (!f) return;
    setUploading(true);
    try {
      await uploadLeaseAgreement(l.id, f);
      toast('Signed agreement uploaded');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setUploading(false);
    }
  };
  const at = (days: number) => Math.min(1, Math.max(0, (total - days) / total));
  const marks = [
    { at: 0, label: fmtDate(l.start), sub: 'Agreement signed', tone: 'done' as const },
    { at: at(90), label: fmtDate(toISODate(addDays(endD, -90))), sub: '90-day', tone: d <= 90 ? 'done' as const : 'todo' as const },
    { at: at(60), label: fmtDate(toISODate(addDays(endD, -60))), sub: '60-day', tone: d <= 60 ? 'done' as const : 'todo' as const },
    { at: at(30), label: '30-day', sub: '', tone: d <= 30 ? 'done' as const : 'todo' as const },
    { at: 1, label: d < 0 ? 'Ended' : 'Lease ends', sub: fmtDate(l.end), tone: 'danger' as const },
  ];

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Leases', to: 'leases' }, { label: l.id }]} title={`Lease ${l.id}`}
        badge={<Badge label={s === 'expiring' ? `Expiring soon · ${d} days` : s === 'expired' ? `Expired ${-d} days ago` : LEASE_LABEL[s]} tone={s === 'expiring' ? 'warning' : s === 'expired' ? 'danger' : s === 'active' ? 'success' : 'neutral'} dot />}
        subtitle={`${t.name} · ${p.name} · ${block?.name} · Flat ${u.code}`}
        actions={canEdit && s !== 'renewed' && s !== 'terminated' ? <>
          <Button title="Edit lease" icon={Pencil} size="sm" variant="secondary" onPress={() => setEditOpen(true)} />
          <Button title={uploading ? 'Uploading…' : 'Upload agreement'} icon={Upload} size="sm" variant="secondary" disabled={uploading} onPress={() => void uploadAgreement()} />
          <Button title="Send reminder" icon={Send} size="sm" variant="secondary" onPress={() => { sendLeaseReminder([l.id]); toast(`Reminder sent to ${t.name}`); }} />
          <Button title="Terminate lease" size="sm" variant="dangerGhost" onPress={() => confirm.ask({ title: `Terminate ${l.id}?`, body: `${t.name} will be marked as moved out and Flat ${u.code} becomes vacant. This can’t be undone.`, confirm: 'Terminate lease', danger: true, onConfirm: () => { terminateLease(l.id); toast('Lease terminated'); } })} />
          <Button title="Renew lease" icon={RefreshCw} size="sm" onPress={() => navigate('renew', { id: l.id })} />
        </> : s === 'renewed' && l.renewedTo ? <Button title={`View current lease ${l.renewedTo}`} onPress={() => navigate('lease', { id: l.renewedTo! })} /> : undefined} />
      {s === 'expiring' || s === 'expired' ? (
        <Notice tone="warning" style={{ marginBottom: 16 }} action={canEdit ? <Button title="Start renewal" size="sm" onPress={() => navigate('renew', { id: l.id })} /> : undefined}>
          <T size={13} color={colors.text}><T size={13} weight="semibold">This lease {d < 0 ? 'ended' : 'ends'} on {fmtDate(l.end)}.</T> {l.tenantIntent === 'renew' ? `${t.name.split(' ')[0]} confirmed intent to renew.` : l.tenantIntent === 'move_out' ? `${t.name.split(' ')[0]} plans to move out.` : 'The tenant hasn’t responded yet.'} No renewal has been created yet.</T>
        </Notice>
      ) : null}
      <Card style={{ marginBottom: 16 }}>
        <CardHeader title="Lease timeline" right={<T size={12} color={colors.subtext}>{l.termMonths}-month lease · {elapsed} of {total} days elapsed</T>} />
        <Timeline progress={elapsed / total} marks={bp === 'mobile' ? [marks[0], marks[4]] : marks} />
      </Card>
      <Grid cols={{ mobile: 1, desktop: 3 }} spans={[{ mobile: 1, desktop: 2 }, 1]}>
        <View style={{ gap: 16 }}>
          <Card>
            <CardHeader title="Lease terms" />
            <Grid cols={{ mobile: 2, tablet: 4 }} gap={16}>
              <KV label="Tenant"><Link size={13.5} onPress={() => navigate('tenant', { id: t.id })}>{t.name}</Link></KV>
              <KV label="Property" value={p.name} /><KV label="Unit" value={`${block?.name} · Flat ${u.code}`} /><KV label="Unit type" value={u.type} />
              <KV label="Start date" value={fmtDate(l.start)} /><KV label="End date" value={fmtDate(l.end)} /><KV label="Lease duration" value={`${l.termMonths} months`} />
              <KV label="Lease status"><LeaseBadge s={s} /></KV>
              <KV label="Annual rent" value={naira(l.rent)} /><KV label="Service charge" value={naira(l.serviceCharge)} /><KV label="Notice period" value={`${l.noticeMonths} months`} /><KV label="Created by" value={l.createdBy} />
            </Grid>
          </Card>
          <Card pad={0}>
            <View style={{ padding: 20, paddingBottom: 12 }}><T size={15.5} weight="semibold">Renewal history</T></View>
            <DataTable rows={chain} keyOf={(x) => x.id} onRowPress={(x) => x.id !== l.id && navigate('lease', { id: x.id })} dense columns={[
              { key: 'i', title: 'Lease', min: 90, render: (x) => <T mono size={12.5} color={x.id === l.id ? colors.text : colors.primary}>{x.id}</T> },
              { key: 'p', title: 'Period', flex: 1.6, min: 180, render: (x) => <T size={12.5}>{fmtDate(x.start)} – {fmtDate(x.end)}</T> },
              { key: 'r', title: 'Rent', min: 110, render: (x) => <T size={12.5}>{naira(x.rent)}</T> },
              { key: 'c', title: 'Change', min: 80, render: (x) => { const prev = chain.find((y) => y.id === x.renewedFrom); const ch = prev ? Math.round(((x.rent - prev.rent) / prev.rent) * 100) : null; return <T size={12.5} color={ch && ch > 0 ? colors.warning : colors.subtext}>{ch === null ? '—' : `${ch > 0 ? '+' : ''}${ch}%`}</T>; } },
              { key: 'a', title: 'Approved by', min: 120, render: (x) => <T size={12.5} color={colors.textSoft}>{x.createdBy}</T> },
              { key: 'o', title: 'Outcome', min: 110, render: (x) => <Badge label={x.id === l.id ? 'Current' : x.renewedTo ? 'Renewed' : x.renewedFrom ? 'Renewal' : 'First lease'} tone={x.id === l.id ? 'accent' : 'neutral'} dot /> },
            ]} />
          </Card>
          <Card>
            <CardHeader title="Reminder log" />
            <View style={{ gap: 10 }}>
              {l.reminders.map((r, i) => (
                <Row key={i} gap={10}>
                  <Badge label={r.status} tone={r.status === 'Read' ? 'success' : r.status === 'Scheduled' ? 'neutral' : 'info'} size="sm" />
                  <T size={12.5} style={{ flex: 1 }}>{r.label} · <T size={12.5} color={colors.subtext}>{r.channels}</T></T>
                  <T size={12} color={colors.subtext}>{fmtDate(r.date)}</T>
                </Row>
              ))}
              {!l.reminders.length ? <T size={12.5} color={colors.subtext}>{d > 90 ? `The first reminder goes out on ${fmtDate(toISODate(addDays(endD, -90)))}.` : 'No reminders sent yet.'}</T> : null}
            </View>
          </Card>
        </View>
        <View style={{ gap: 16 }}>
          <Card>
            <CardHeader title="Tenancy agreement" right={<Badge label={l.signed ? 'Signed' : 'Awaiting signature'} tone={l.signed ? 'success' : 'warning'} />} />
            <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 7 }}>
              {[1, 0.9, 0.95, 0.7, 1, 0.85, 0.6].map((w, i) => <View key={i} style={{ height: 5, width: `${w * 100}%`, backgroundColor: colors.border, borderRadius: 3 }} />)}
              <Row justify="space-between" style={{ marginTop: 14 }}>
                <T size={15} color={colors.info} style={{ fontStyle: 'italic' }}>{l.signed ? `${t.name.split(' ')[0][0]}. ${t.name.split(' ')[1]}` : '—'}</T>
                <T size={15} color={colors.info} style={{ fontStyle: 'italic' }}>F. Adewale</T>
              </Row>
            </View>
            <FileRow name={agreementName} kind={agreementDoc?.kind ?? 'pdf'} meta={agreementDoc ? `${(agreementDoc.sizeKb / 1024).toFixed(1)} MB · uploaded ${fmtDate(agreementDoc.date)} by ${agreementDoc.uploadedBy}` : 'No signed copy uploaded yet'} onPress={agreementDoc ? () => openDoc(agreementDoc) : undefined} />
            <Row gap={8} style={{ marginTop: 10 }}>
              {agreementDoc ? <>
                <Button title="Open" icon={Eye} size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => openDoc(agreementDoc)} />
                <Button title="Download" icon={Download} size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => openDoc(agreementDoc, true)} />
              </> : null}
              {canEdit ? <Button title={uploading ? 'Uploading…' : agreementDoc ? 'Replace' : 'Upload signed copy'} icon={agreementDoc ? undefined : Upload} size="sm" variant={agreementDoc ? 'ghost' : 'secondary'} disabled={uploading} style={agreementDoc ? undefined : { flex: 1 }} onPress={() => void uploadAgreement()} /> : null}
            </Row>
          </Card>
          <Card>
            <CardHeader title="Tenant" />
            <Touch onPress={() => navigate('tenant', { id: t.id })} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Avatar name={t.name} size={38} />
              <View style={{ flex: 1 }}><T size={13.5} weight="semibold">{t.name}</T><T size={12} color={colors.subtext}>{t.phone}</T><T size={12} color={colors.subtext}>{t.email}</T></View>
            </Touch>
          </Card>
        </View>
      </Grid>
      {confirm.node}
      <EditLeaseDialog open={editOpen} onClose={() => setEditOpen(false)} leaseId={l.id} />
    </Page>
  );
}

const LEASE_LABEL: Record<string, string> = { active: 'Active', expiring: 'Expiring soon', expired: 'Expired', terminated: 'Terminated', renewed: 'Renewed', draft: 'Draft' };

function EditLeaseDialog({ open, onClose, leaseId }: { open: boolean; onClose: () => void; leaseId: string }) {
  const { state } = useStore();
  const toast = useToast();
  const l = state.leases.find((x) => x.id === leaseId)!;
  const [notice, setNotice] = useState(String(l.noticeMonths));
  return (
    <Dialog open={open} onClose={onClose} title={`Edit ${l.id}`} subtitle="Rent and dates change through a renewal so the history stays intact." width={440}
      footer={<><Button title="Cancel" variant="secondary" onPress={onClose} /><Button title="Save" onPress={() => { toast('Lease updated'); onClose(); }} /></>}>
      <View style={{ gap: 14 }}>
        <Input label="Notice period (months)" value={notice} onChangeText={setNotice} keyboardType="number-pad" />
        <Select label="Payment cycle" value="annual" onChange={() => {}} options={[{ value: 'annual', label: 'Annually, in advance' }, { value: 'biannual', label: 'Every 6 months' }]} />
      </View>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Renewal

export function RenewLeaseScreen({ id }: { id: string }) {
  const { state, renewLease } = useStore();
  const lookup = useLookup();
  const { navigate, back } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const l = state.leases.find((x) => x.id === id);
  const [start, setStart] = useState(() => (l ? toISODate(addDays(new Date(l.end + 'T00:00:00'), 1)) : ''));
  const [end, setEnd] = useState(() => (l ? toISODate(addMonths(new Date(l.end + 'T00:00:00'), 12)) : ''));
  const [increase, setIncrease] = useState('5');
  const [notify, setNotify] = useState(true);
  const [schedule, setSchedule] = useState(true);
  const [notes, setNotes] = useState(() => (l?.tenantIntent === 'renew' ? `Tenant confirmed intent to renew. Rent reviewed in line with the ${new Date().getFullYear()} estate-wide adjustment. No outstanding maintenance on the unit.` : ''));
  const [step, setStep] = useState(5);
  if (!l) return <Page><Card><EmptyState icon={FileText} title="Lease not found" /></Card></Page>;
  if (l.renewedTo) return <Page><Card><EmptyState icon={Check} title={`${l.id} was already renewed`} body={`The current lease is ${l.renewedTo}.`} action={<Button title="View current lease" onPress={() => navigate('lease', { id: l.renewedTo! })} />} /></Card></Page>;
  const t = lookup.tenant(l.tenantId)!;
  const u = lookup.unit(l.unitId)!;
  const p = lookup.property(l.propertyId)!;
  const pctUp = parseFloat(increase) || 0;
  const newRent = Math.round((l.rent * (1 + pctUp / 100)) / 10000) * 10000;
  const nextId = `LS-${String(Math.max(...state.leases.map((x) => parseInt(x.id.replace('LS-', ''), 10) || 0)) + 1).padStart(4, '0')}`;
  const months = Math.max(1, Math.round(daysBetween(start, end) / 30.4));
  const d = daysUntil(l.end);
  const steps = ['Current lease', 'Renewal details', 'New dates', 'Updated agreement', 'Review', 'Confirm'];

  const confirmRenewal = () => {
    if (end <= start) { toast('The end date must be after the start date', 'danger'); setStep(3); return; }
    renewLease(l.id, { start, end, rent: newRent, serviceCharge: l.serviceCharge, notifyTenant: notify, scheduleReminders: schedule }).then((newId) => {
      toast(notify ? `${newId} created — ${t.name.split(' ')[0]} has been notified` : `${newId} created`);
      navigate('lease', { id: newId });
    }, (e: unknown) => toast(`Couldn’t renew the lease: ${e instanceof Error ? e.message : e}`, 'danger'));
  };

  const row = (k: string, a: string, b?: React.ReactNode) => (
    <Row justify="space-between" style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <T size={12.5} color={colors.subtext}>{k}</T>
      {b ?? <T size={12.5} weight="semibold">{a}</T>}
    </Row>
  );

  return (
    <Page footer={
      <StickyFooter>
        <Button title="Previous" variant="secondary" onPress={() => (step > 1 ? setStep(step - 1) : back('leases'))} />
        <View style={{ flex: 1 }} />
        <Button title="Save draft" variant="ghost" onPress={() => toast('Renewal draft saved')} />
        {step < 5 ? <Button title="Next" onPress={() => setStep(step + 1)} /> : <Button title="Confirm renewal" icon={Check} onPress={confirmRenewal} />}
      </StickyFooter>
    }>
      <PageHeader crumbs={[{ label: 'Leases', to: 'leases' }, { label: l.id, to: 'lease', params: { id: l.id } }, { label: 'Renew' }]} title={`Renew lease · ${t.name}`} subtitle={`${p.name} · Flat ${u.code} · current lease ends ${fmtDate(l.end)}`}
        actions={<Button title="Cancel renewal" variant="ghost" onPress={() => back('leases')} />} />
      <Card pad={12} style={{ marginBottom: 16 }}>
        <Row gap={6} wrap={bp === 'mobile'}>
          {steps.map((s, i) => {
            const n = i + 1, done = n < step, cur = n === step;
            return (
              <React.Fragment key={s}>
                <Touch onPress={() => n <= 5 && setStep(n)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: done ? colors.primary : colors.card, borderWidth: cur ? 2 : 1, borderColor: done || cur ? colors.primary : colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>{done ? <Check size={12} color={colors.white} strokeWidth={3} /> : <T size={11} weight="bold" color={cur ? colors.primary : colors.subtext}>{n}</T>}</View>
                  {bp !== 'mobile' || cur ? <T size={12} weight={cur ? 'semibold' : 'medium'} color={done || cur ? colors.text : colors.subtext}>{s}</T> : null}
                </Touch>
                {i < steps.length - 1 ? <View style={{ flex: 1, minWidth: 8, height: 2, backgroundColor: done ? colors.primary : colors.border }} /> : null}
              </React.Fragment>
            );
          })}
        </Row>
      </Card>

      {step === 2 || step === 3 ? (
        <Card style={{ marginBottom: 16 }}>
          <CardHeader title={step === 2 ? 'Renewal details' : 'New dates'} subtitle={step === 2 ? 'Set the rent for the new term.' : 'The new lease starts the day after the current one ends.'} />
          {step === 2 ? (
            <Grid cols={{ mobile: 1, tablet: 3 }} gap={14}>
              <Input label="Rent change (%)" value={increase} onChangeText={setIncrease} keyboardType="numeric" hint={`Current ${naira(l.rent)} → ${naira(newRent)}`} />
              <KV label="New annual rent" value={<T size={20} weight="bold">{naira(newRent)}</T>} />
              <KV label="Service charge" value={`${naira(l.serviceCharge)} · unchanged`} />
            </Grid>
          ) : (
            <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
              <DateField label="New start date" value={start} onChange={(v) => { setStart(v); setEnd(toISODate(addDays(addMonths(new Date(v + 'T00:00:00'), 12), -1))); }} />
              <DateField label="New end date" value={end} onChange={setEnd} hint={`Duration: ${months} months`} />
            </Grid>
          )}
        </Card>
      ) : null}
      {step === 4 ? (
        <Card style={{ marginBottom: 16 }}>
          <CardHeader title="Updated agreement" subtitle="Attach the signed renewal, or send it to the tenant to sign." />
          <FileRow name={`${nextId}-renewal.pdf`} kind="pdf" meta="Generated from the current agreement with the new dates and rent" right={<Badge label="Draft" tone="info" />} />
        </Card>
      ) : null}

      <View style={{ flexDirection: bp === 'mobile' ? 'column' : 'row', alignItems: 'stretch', gap: 12 }}>
        <Card style={{ flex: 1 }}>
          <Row justify="space-between"><T size={10.5} weight="bold" color={colors.faint} upper>Previous lease</T><Badge label={d < 0 ? `Ended ${-d} days ago` : `Ends in ${d} days`} tone={d < 0 ? 'danger' : 'warning'} dot /></Row>
          <T size={17} weight="bold" style={{ marginVertical: 8 }}>{l.id}</T>
          {row('Start date', fmtDate(l.start))}{row('End date', fmtDate(l.end))}{row('Duration', `${l.termMonths} months`)}{row('Annual rent', naira(l.rent))}{row('Service charge', naira(l.serviceCharge))}{row('Agreement', l.agreement)}
        </Card>
        <View style={{ justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: bp === 'mobile' ? [{ rotate: '90deg' }] : [] }}><ArrowRight size={17} color={colors.white} /></View>
        </View>
        <Card style={{ flex: 1, borderColor: colors.primary, borderWidth: 1.5 }}>
          <Row justify="space-between"><T size={10.5} weight="bold" color={colors.primary} upper>New lease</T><T size={11.5} color={colors.subtext}>Not yet active</T></Row>
          <T size={17} weight="bold" style={{ marginVertical: 8 }}>{nextId} <T size={12} color={colors.subtext}>(draft)</T></T>
          {row('Start date', fmtDate(start))}{row('End date', fmtDate(end))}{row('Duration', `${months} months`)}
          {row('Annual rent', '', <Row gap={6}>{pctUp ? <Badge label={`${pctUp > 0 ? '+' : ''}${pctUp}%`} tone="accent" size="sm" /> : null}<T size={12.5} weight="semibold">{naira(newRent)}</T></Row>)}
          {row('Service charge', `${naira(l.serviceCharge)} · unchanged`)}{row('Agreement', `${nextId}-renewal.pdf`)}
        </Card>
      </View>
      <View style={{ height: 16 }} />
      <Grid cols={{ mobile: 1, tablet: 2 }}>
        <Card>
          <CardHeader title="Renewal notes" />
          <Input value={notes} onChangeText={setNotes} multiline placeholder="Add context for the audit trail" />
          <View style={{ gap: 10, marginTop: 14 }}>
            <Checkbox checked={notify} onChange={setNotify} label="Notify tenant by email and SMS once confirmed" />
            <Checkbox checked={schedule} onChange={setSchedule} label="Schedule reminders at 90, 60 and 30 days before the new end date" />
          </View>
        </Card>
        <Card>
          <CardHeader title="What happens next" />
          {[
            { t: 'You confirm the renewal', s: `${nextId} is created and linked to ${l.id}`, on: true },
            { t: 'Tenant is notified', s: notify ? 'New agreement appears in their portal' : 'Notification switched off' },
            { t: `New lease becomes active on ${fmtDate(start)}`, s: 'Previous lease is marked Renewed' },
          ].map((x, i) => (
            <Row key={i} gap={10} align="flex-start" style={{ marginBottom: 12 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: x.on ? colors.primary : colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{x.on ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} /> : null}</View>
              <View style={{ flex: 1 }}><T size={13} weight="semibold">{x.t}</T><T size={12} color={colors.subtext}>{x.s}</T></View>
            </Row>
          ))}
        </Card>
      </Grid>
    </Page>
  );
}

export { XCircle, Segmented };

const Stat = ({ icon, tone, label, value, sub, onPress, active }: any) => (
  <Card pad={16} onPress={onPress} style={active ? { borderColor: colors.primary } : undefined}>
    <Row gap={8}><IconTile icon={icon} tone={tone} size={26} iconSize={13} /><T size={12} color={colors.textSoft} numberOfLines={1}>{label}</T></Row>
    <T size={24} weight="bold" style={{ marginTop: 8 }}>{value}</T>
    <T size={11.5} color={colors.subtext}>{sub}</T>
  </Card>
);
