import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  Bell, Building2, Check, CheckCheck, Download, Ellipsis, FileText, Folder, FolderPlus, House, Image as ImageIcon, KeyRound, Mail, Megaphone, MessageSquare,
  Paperclip, Pencil, Plug, Receipt, Search, Send, Settings as SettingsIcon, Shield, ShieldCheck, SlidersHorizontal, Upload, UserPlus, Users, Wrench, X, TriangleAlert,
  CircleHelp, Phone, BookOpen, LifeBuoy, RotateCcw,
} from 'lucide-react-native';
import { colors, radius, useBreakpoint } from '../../theme';
import { useLookup, useScope, useStore, type AuthResult, type CreateUserInput } from '../../store/AppContext';
import { useRouter } from '../../nav/router';
import { Page, PageHeader, roleLabel } from '../../components/shell';
import {
  Avatar, Badge, Button, Card, CardHeader, Checkbox, Chip, Dialog, Divider, EmptyState, Grid, IconTile, Input, KV, Link, Menu, Notice, ProgressBar, Row,
  Segmented, Select, T, Tabs, Toggle, Touch, useConfirm, useToast,
} from '../../components/ui';
import type { Tone } from '../../components/ui';
import { DataTable, FileIcon, Pagination, usePaged } from '../../components/data';
import { TrackBars } from '../../components/charts';
import { usePortfolio, usePropertyStats } from '../../lib/stats';
import { downloadCSV, printPage } from '../../lib/export';
import type { Announcement, AppNotification, DocFile, Priority, Role, User } from '../../types';
import { MONTHS, addMonths, daysUntil, feedStamp, fmtDate, fmtShort, fmtStamp, fmtTime, isToday, naira, parseDate, pct, timeAgo } from '../../utils';

// ---------------------------------------------------------------- Communications

type Audience = 'all' | 'property' | 'block' | 'selected' | 'overdue';

export function CommunicationsScreen() {
  const { state, sendAnnouncement } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const { route } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const [tab, setTab] = useState('new');
  const initialTenant = route.params.tenantId ? lookup.tenant(route.params.tenantId) : undefined;
  const [audience, setAudience] = useState<Audience>(initialTenant ? 'selected' : 'property');
  const [propertyId, setPropertyId] = useState(initialTenant?.propertyId ?? scope.properties[0]?.id ?? '');
  const [blockId, setBlockId] = useState('all');
  const [tenantIds, setTenantIds] = useState<string[]>(initialTenant ? [initialTenant.id] : []);
  const [channels, setChannels] = useState<Announcement['channels']>(['In-app', 'SMS']);
  const tpl = state.announcements.find((a) => a.id === 'tpl-1');
  const [subject, setSubject] = useState(initialTenant ? '' : 'Scheduled water supply interruption, Thursday');
  const [message, setMessage] = useState(initialTenant ? `Dear {first_name},\n\n` : tpl?.message ?? '');
  const [attach, setAttach] = useState<string | null>(initialTenant ? null : 'Water-schedule-Sep.pdf');
  const [later, setLater] = useState(false);

  const recipients = useMemo(() => {
    const active = scope.tenants.filter((t) => t.status === 'active');
    if (audience === 'all') return active;
    if (audience === 'property') return active.filter((t) => t.propertyId === propertyId && (blockId === 'all' || lookup.unit(t.unitId)?.blockId === blockId));
    if (audience === 'block') return active.filter((t) => lookup.unit(t.unitId)?.blockId === blockId);
    if (audience === 'overdue') return active.filter((t) => state.payments.some((p) => p.tenantId === t.id && p.status === 'overdue'));
    return active.filter((t) => tenantIds.includes(t.id));
  }, [audience, propertyId, blockId, tenantIds, scope.tenants, state.payments, lookup]);
  const vacantSkipped = audience === 'property' ? state.units.filter((u) => u.propertyId === propertyId && u.status !== 'occupied' && (blockId === 'all' || u.blockId === blockId)).length : 0;
  const sms = channels.includes('SMS');
  const smsParts = Math.max(1, Math.ceil(message.length / 160));
  const preview = message.replace('{first_name}', recipients[0]?.name.split(' ')[0] ?? 'Aisha').replace('{flat}', lookup.unit(recipients[0]?.unitId)?.code ?? 'B7').replace('{property}', lookup.property(recipients[0]?.propertyId ?? propertyId)?.name ?? '');
  const sent = state.announcements.filter((a) => a.status === 'sent');
  const scheduled = state.announcements.filter((a) => a.status === 'scheduled');
  const templates = state.announcements.filter((a) => a.status === 'template');
  const toggleCh = (c: Announcement['channels'][number]) => setChannels(channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c]);
  const audienceLabel = audience === 'all' ? 'All tenants' : audience === 'overdue' ? 'Overdue tenants' : audience === 'selected' ? `${recipients.length} selected tenants` : `${lookup.property(propertyId)?.name}${blockId !== 'all' ? ` · ${lookup.block(blockId)?.name}` : ''}`;

  const send = (status: Announcement['status']) => {
    if (!subject.trim() || !message.trim()) { toast('Add a subject and message first', 'danger'); return; }
    if (status !== 'template' && (!recipients.length || !channels.length)) { toast('Choose at least one recipient and channel', 'danger'); return; }
    sendAnnouncement({ subject: subject.trim(), message, audience: status === 'template' ? 'Template' : audienceLabel, propertyId: audience === 'property' ? propertyId : undefined, channels, recipients: recipients.length, status, scheduledFor: status === 'scheduled' ? new Date(Date.now() + 86400000).toISOString() : undefined });
    toast(status === 'template' ? 'Saved as template' : status === 'scheduled' ? `Scheduled for ${recipients.length} tenants tomorrow` : `Sent to ${recipients.length} tenants`);
    if (status === 'sent') setTab('sent');
  };

  const history = (list: Announcement[]) => (
    <Card pad={0}>
      <DataTable rows={list} keyOf={(a) => a.id} empty={<EmptyState icon={Megaphone} title="Nothing here yet" />} columns={[
        { key: 's', title: 'Subject', flex: 2, min: 220, render: (a) => <View><T size={13} weight="semibold">{a.subject}</T><T size={11.5} color={colors.subtext} numberOfLines={1}>{a.message.split('\n').filter(Boolean)[0]}</T></View> },
        { key: 'a', title: 'Audience', flex: 1.2, min: 150, render: (a) => <T size={12.5} color={colors.textSoft}>{a.audience}</T> },
        { key: 'c', title: 'Channels', min: 150, render: (a) => <Row gap={4} wrap>{a.channels.map((c) => <Badge key={c} label={c} size="sm" tone="neutral" />)}</Row> },
        { key: 'd', title: 'Date', min: 110, render: (a) => <T size={12.5} color={colors.textSoft}>{a.status === 'template' ? '—' : fmtStamp(a.sentAt)}</T> },
        { key: 'r', title: 'Reach', min: 120, render: (a) => a.status === 'sent' ? <T size={12.5}>{a.recipients} sent · <T size={12.5} weight="semibold" color={colors.success}>{a.readPct}% read</T></T> : a.status === 'scheduled' ? <Badge label={`${a.recipients} scheduled`} tone="info" /> : <Button title="Use" size="sm" variant="secondary" onPress={() => { setSubject(a.subject); setMessage(a.message); setChannels(a.channels); setTab('new'); }} /> },
      ]} />
    </Card>
  );

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Communications' }]} title="Communications"
        actions={<Segmented value={tab} onChange={setTab} options={[{ value: 'new', label: 'New announcement' }, { value: 'sent', label: `Sent (${sent.length})` }, { value: 'scheduled', label: `Scheduled (${scheduled.length})` }, { value: 'templates', label: 'Templates' }]} />} />
      {tab === 'sent' ? history(sent) : tab === 'scheduled' ? history(scheduled) : tab === 'templates' ? history(templates) : (
        <View style={{ flexDirection: bp === 'desktop' ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
          <Card style={{ flex: 1, width: '100%' }}>
            <CardHeader title="Write an announcement" />
            <T size={12.5} weight="semibold" color={colors.textSoft} style={{ marginBottom: 8 }}>Send to</T>
            <Row wrap gap={8}>
              {([['all', 'All tenants'], ['property', 'A property'], ['block', 'A block'], ['selected', 'Selected tenants'], ['overdue', 'Tenants with overdue rent']] as Array<[Audience, string]>).map(([k, l]) => <Chip key={k} label={l} active={audience === k} onPress={() => { setAudience(k); if (k === 'block' && blockId === 'all') setBlockId(scope.blocks[0]?.id ?? 'all'); }} />)}
            </Row>
            {audience === 'property' || audience === 'block' ? (
              <Row gap={12} style={{ marginTop: 12 }} align="flex-start">
                <Select fieldStyle={{ flex: 1 }} value={propertyId} onChange={(v) => { setPropertyId(v); setBlockId(audience === 'block' ? state.blocks.find((b) => b.propertyId === v)?.id ?? 'all' : 'all'); }} options={scope.properties.map((p) => ({ value: p.id, label: p.name }))} />
                <Select fieldStyle={{ flex: 1 }} value={blockId} onChange={setBlockId} options={[...(audience === 'property' ? [{ value: 'all', label: `All blocks (${state.units.filter((u) => u.propertyId === propertyId).length} flats)` }] : []), ...state.blocks.filter((b) => b.propertyId === propertyId).map((b) => ({ value: b.id, label: b.name }))]} />
              </Row>
            ) : null}
            {audience === 'selected' ? (
              <Select fieldStyle={{ marginTop: 12 }} value="" placeholder={tenantIds.length ? `${tenantIds.length} tenants selected — add another` : 'Add a tenant'} onChange={(v) => setTenantIds(tenantIds.includes(v) ? tenantIds.filter((x) => x !== v) : [...tenantIds, v])} options={scope.tenants.filter((t) => t.status === 'active').map((t) => ({ value: t.id, label: `${tenantIds.includes(t.id) ? '✓ ' : ''}${t.name}`, sub: `${lookup.property(t.propertyId)?.short} ${lookup.unit(t.unitId)?.code}` }))} />
            ) : null}
            {audience === 'selected' && tenantIds.length ? <Row wrap gap={6} style={{ marginTop: 8 }}>{tenantIds.map((id) => <Chip key={id} label={lookup.tenant(id)?.name ?? ''} active icon={X} onPress={() => setTenantIds(tenantIds.filter((x) => x !== id))} />)}</Row> : null}
            <T size={11.5} color={colors.subtext} style={{ marginTop: 8 }}>{recipients.length} tenants will receive this.{vacantSkipped ? ` ${vacantSkipped} flats are vacant or under maintenance.` : ''}</T>
            <T size={12.5} weight="semibold" color={colors.textSoft} style={{ marginTop: 16, marginBottom: 8 }}>Channels</T>
            <Row gap={16} wrap>{(['In-app', 'Email', 'SMS', 'WhatsApp'] as const).map((c) => <Checkbox key={c} checked={channels.includes(c)} onChange={() => toggleCh(c)} label={c} />)}</Row>
            <Input fieldStyle={{ marginTop: 16 }} label="Subject" value={subject} onChangeText={setSubject} placeholder="e.g. Estate sanitation this Saturday" />
            <Input fieldStyle={{ marginTop: 14 }} label="Message" value={message} onChangeText={setMessage} multiline style={{ minHeight: 150 }} />
            <Row justify="space-between" style={{ marginTop: 6 }} wrap>
              <T size={11.5} color={colors.subtext}>Insert: <T size={11.5} weight="semibold" color={colors.primary} onPress={() => setMessage(message + '{first_name}')}>{'{first_name}'}</T>  <T size={11.5} weight="semibold" color={colors.primary} onPress={() => setMessage(message + '{flat}')}>{'{flat}'}</T>  <T size={11.5} weight="semibold" color={colors.primary} onPress={() => setMessage(message + '{property}')}>{'{property}'}</T></T>
              {sms ? <T size={11.5} color={colors.subtext}>SMS: {smsParts} message{smsParts > 1 ? 's' : ''} ({message.length} characters)</T> : null}
            </Row>
            {attach ? (
              <Row gap={10} style={{ marginTop: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10 }}>
                <FileIcon kind="pdf" /><View style={{ flex: 1 }}><T size={12.5} weight="semibold">{attach}</T><T size={11} color={colors.subtext}>148 KB</T></View>
                <Touch onPress={() => setAttach(null)}><X size={15} color={colors.subtext} /></Touch>
              </Row>
            ) : <Button title="Attach file" icon={Paperclip} size="sm" variant="ghost" style={{ alignSelf: 'flex-start', marginTop: 10 }} onPress={() => setAttach('Notice.pdf')} />}
            <Row justify="space-between" style={{ marginTop: 18 }} wrap gap={10}>
              <Checkbox checked={later} onChange={setLater} label="Schedule for later" />
              <Row gap={8}>
                <Button title="Save as template" variant="secondary" onPress={() => send('template')} />
                <Button title={later ? `Schedule for ${recipients.length} tenants` : `Send to ${recipients.length} tenants`} icon={Send} onPress={() => send(later ? 'scheduled' : 'sent')} />
              </Row>
            </Row>
          </Card>
          <View style={{ width: bp === 'desktop' ? 330 : '100%', gap: 16 }}>
            <Card>
              <CardHeader title={sms ? 'SMS preview' : 'Preview'} />
              <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                  <T size={12.5} color={colors.textSoft} style={{ lineHeight: 19 }}>{preview.replace(/\n+/g, ' ').slice(0, sms ? 320 : 600) || 'Your message preview appears here.'}</T>
                </View>
              </View>
            </Card>
            <Card>
              <CardHeader title="Recently sent" right={<Link onPress={() => setTab('sent')}>View all</Link>} />
              <View style={{ gap: 12 }}>
                {sent.slice(0, 3).map((a) => (
                  <View key={a.id}>
                    <Row justify="space-between"><T size={12.5} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>{a.subject}</T><T size={11.5} color={colors.subtext}>{fmtShort(a.sentAt)}</T></Row>
                    <T size={11.5} color={colors.subtext}>{a.audience} · {a.recipients} sent · {a.readPct}% read</T>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        </View>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------- Reports

export function ReportsScreen() {
  const { state } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const pf = usePortfolio();
  const props = usePropertyStats();
  const { navigate, route } = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState(route.params.tab ?? 'occupancy');
  const [loc, setLoc] = useState('all');
  const [period, setPeriod] = useState('ytd');

  const visibleProps = props.filter((p) => loc === 'all' || p.property.locationId === loc);
  const units = visibleProps.flatMap((p) => p.units);
  const occ = units.filter((u) => u.status === 'occupied').length;
  const vacantUnits = units.filter((u) => u.status === 'vacant');
  const avgVacancy = vacantUnits.length ? Math.round(vacantUnits.reduce((s, u) => s + Math.max(0, -daysUntil(u.vacantSince ?? '')), 0) / vacantUnits.length) : 0;
  const ending90 = pf.leaseDays.filter((x) => x.d >= 0 && x.d <= 90 && (loc === 'all' || lookup.property(x.l.propertyId)?.locationId === loc));
  const renewing = ending90.filter((x) => x.l.tenantIntent === 'renew').length;
  const months = Array.from({ length: 9 }).map((_, i) => {
    const d = addMonths(new Date(), i - 8);
    const base = occ / Math.max(1, units.length);
    const v = i === 8 ? base : Math.max(0.6, Math.min(1, base - (8 - i) * 0.004 + (((i * 5) % 3) - 1) * 0.006));
    return { label: MONTHS[d.getMonth()], value: v, display: `${(v * 100).toFixed(1)}%` };
  });

  const overdue = state.payments.filter((p) => p.status === 'overdue' && scope.tenants.some((t) => t.id === p.tenantId));
  const collected = state.payments.filter((p) => p.status === 'paid' && parseDate(p.date).getFullYear() === new Date().getFullYear() && scope.tenants.some((t) => t.id === p.tenantId));

  const exportExcel = () => {
    let rows: Array<Record<string, string | number | undefined>> = [];
    if (tab === 'occupancy') rows = visibleProps.map((p) => ({ Property: p.property.name, Units: p.total, Occupied: p.occupied, Vacant: p.vacant, Maintenance: p.maintenance, Occupancy: pct(p.occupied, p.total) }));
    else if (tab === 'rent') rows = [...overdue.map((p) => ({ Tenant: lookup.tenant(p.tenantId)?.name, Type: p.label, Amount: p.amount, Date: p.date, Status: 'Overdue' })), ...collected.map((p) => ({ Tenant: lookup.tenant(p.tenantId)?.name, Type: p.label, Amount: p.amount, Date: p.date, Status: 'Paid' }))];
    else if (tab === 'leases') rows = pf.leaseDays.filter((x) => x.d <= 120).map((x) => ({ Lease: x.l.id, Tenant: lookup.tenant(x.l.tenantId)?.name, Property: lookup.property(x.l.propertyId)?.name, Unit: lookup.unit(x.l.unitId)?.code, End: x.l.end, 'Days left': x.d }));
    else if (tab === 'maintenance') rows = scope.requests.map((r) => ({ Request: r.id, Property: lookup.property(r.propertyId)?.name, Category: r.category, Priority: r.priority, Status: r.status, Created: r.createdAt.slice(0, 10), Cost: r.cost ?? '' }));
    else if (tab === 'vendors') rows = state.vendors.map((v) => ({ Vendor: v.name, Trade: v.trade, Completed: v.completed, 'Avg days': v.avgDays, Rating: v.rating, 'Spend this month': v.spendThisMonth }));
    else rows = scope.tenants.map((t) => ({ Tenant: t.name, Code: t.code, Property: lookup.property(t.propertyId)?.name, Unit: lookup.unit(t.unitId)?.code, Status: t.status, Since: t.joinedAt }));
    const ok = downloadCSV(`report-${tab}-${new Date().toISOString().slice(0, 10)}`, rows);
    toast(ok ? 'Report exported (opens in Excel)' : 'Export is available on the web app', ok ? 'success' : 'info');
  };

  const tile = (label: string, value: React.ReactNode, sub: string, subTone?: string) => (
    <Card pad={16}>
      <T size={12} color={colors.subtext}>{label}</T>
      <View style={{ marginTop: 6 }}>{typeof value === 'string' || typeof value === 'number' ? <T size={26} weight="bold">{value}</T> : value}</View>
      <T size={11.5} color={subTone ?? colors.subtext}>{sub}</T>
    </Card>
  );

  const content = () => {
    if (tab === 'occupancy') return (
      <>
        <Grid cols={{ mobile: 2, desktop: 4 }} gap={12}>
          {tile('Occupancy rate', pct(occ, units.length), '+3.1 pts since January', colors.success)}
          {tile('Occupied flats', <T size={26} weight="bold">{occ}<T size={15} color={colors.subtext}> / {units.length}</T></T>, `${visibleProps.length} properties, ${visibleProps.reduce((s, p) => s + p.blocks, 0)} blocks`)}
          {tile('Average vacancy', <T size={26} weight="bold">{avgVacancy}<T size={15} color={colors.subtext}>d</T></T>, 'Time to re-let a flat')}
          {tile('Leases ending in 90 days', ending90.length, `${renewing} renewals in progress`)}
        </Grid>
        <View style={{ height: 16 }} />
        <Grid cols={{ mobile: 1, desktop: 3 }} spans={[{ mobile: 1, desktop: 2 }, 1]}>
          <Card>
            <CardHeader title="Occupancy by month" subtitle="Share of flats with an active lease" right={<Row gap={12}><Row gap={5}><View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: colors.primary }} /><T size={11.5} color={colors.subtext}>Occupied</T></Row><Row gap={5}><View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: colors.neutralSoft }} /><T size={11.5} color={colors.subtext}>Vacant</T></Row></Row>} />
            <TrackBars data={months} height={230} />
          </Card>
          <Card>
            <CardHeader title="By property" />
            <View style={{ gap: 14 }}>
              {[...visibleProps].sort((a, b) => b.occupancy - a.occupancy).map((p) => (
                <Touch key={p.property.id} onPress={() => navigate('property', { id: p.property.id })} style={{ gap: 6 }}>
                  <Row justify="space-between"><T size={12.5} weight="semibold">{p.property.name}</T><T size={12} color={colors.subtext}><T size={12} weight="bold" color={colors.text}>{pct(p.occupied, p.total)}</T> {p.occupied}/{p.total}</T></Row>
                  <ProgressBar value={p.occupancy} color={p.occupancy < 0.8 ? colors.vizMaint : colors.primary} />
                </Touch>
              ))}
            </View>
          </Card>
        </Grid>
        <View style={{ height: 16 }} />
        <Card pad={0}>
          <View style={{ padding: 20, paddingBottom: 12 }}><CardHeader style={{ marginBottom: 0 }} title="Vacant flats" right={<T size={12} color={colors.subtext}>{vacantUnits.length} flats</T>} /></View>
          <DataTable rows={[...vacantUnits].sort((a, b) => (a.vacantSince ?? '') < (b.vacantSince ?? '') ? -1 : 1)} keyOf={(u) => u.id} onRowPress={(u) => navigate('unit', { id: u.id })} columns={[
            { key: 'f', title: 'Flat', min: 60, flex: 0.5, render: (u) => <T size={13} weight="bold">{u.code}</T> },
            { key: 'p', title: 'Property', flex: 1.5, min: 160, render: (u) => <T size={13} color={colors.textSoft}>{lookup.property(u.propertyId)?.name}</T> },
            { key: 't', title: 'Type', min: 90, render: (u) => <T size={13} color={colors.textSoft}>{u.type.replace(' Bedroom', ' bed')}</T> },
            { key: 'r', title: 'Rent / year', min: 110, render: (u) => <T size={13}>{naira(u.rent)}</T> },
            { key: 'v', title: 'Vacant since', min: 110, render: (u) => <T size={13} color={colors.textSoft}>{fmtDate(u.vacantSince)}</T> },
            { key: 'd', title: 'Days vacant', min: 90, render: (u) => <T size={13} weight="semibold">{Math.max(0, -daysUntil(u.vacantSince ?? ''))}</T> },
            { key: 's', title: 'Status', min: 120, render: (u) => <Badge label={u.vacantNote ?? 'Listed'} tone={u.vacantNote === 'Viewing booked' ? 'warning' : u.vacantNote === 'Repairs' ? 'danger' : 'info'} dot /> },
          ]} />
        </Card>
      </>
    );
    if (tab === 'rent') {
      const due = overdue.reduce((s, p) => s + p.amount, 0);
      const coll = collected.reduce((s, p) => s + p.amount, 0);
      return (
        <>
          <Grid cols={{ mobile: 2, desktop: 4 }} gap={12}>
            {tile('Collected this year', naira(coll), `${collected.length} payments`)}
            {tile('Outstanding arrears', naira(due), `${overdue.length} tenants`, colors.danger)}
            {tile('Collection rate', pct(coll, coll + due), 'Paid vs billed')}
            {tile('Expected next 90 days', naira(ending90.reduce((s, x) => s + x.l.rent + x.l.serviceCharge, 0)), `${ending90.length} renewals`)}
          </Grid>
          <View style={{ height: 16 }} />
          <Card pad={0}>
            <View style={{ padding: 20, paddingBottom: 12 }}><T size={15.5} weight="semibold">Arrears</T></View>
            <DataTable rows={overdue} keyOf={(p) => p.id} onRowPress={(p) => navigate('tenant', { id: p.tenantId })} empty={<EmptyState icon={Receipt} title="No arrears" />} columns={[
              { key: 't', title: 'Tenant', flex: 1.4, min: 160, render: (p) => <T size={13} weight="semibold">{lookup.tenant(p.tenantId)?.name}</T> },
              { key: 'u', title: 'Property · unit', flex: 1.4, min: 160, render: (p) => <T size={13} color={colors.textSoft}>{lookup.property(lookup.tenant(p.tenantId)?.propertyId)?.short} · {lookup.unit(lookup.tenant(p.tenantId)?.unitId)?.code}</T> },
              { key: 'a', title: 'Amount', min: 120, render: (p) => <T size={13} weight="semibold" color={colors.danger}>{naira(p.amount)}</T> },
              { key: 'd', title: 'Due since', min: 110, render: (p) => <T size={13} color={colors.textSoft}>{fmtDate(p.date)} · {-daysUntil(p.date)}d</T> },
            ]} />
          </Card>
        </>
      );
    }
    if (tab === 'leases') return (
      <Card pad={0}>
        <View style={{ padding: 20, paddingBottom: 12 }}><T size={15.5} weight="semibold">Leases ending in the next 120 days</T></View>
        <DataTable rows={pf.leaseDays.filter((x) => x.d <= 120).sort((a, b) => a.d - b.d)} keyOf={(x) => x.l.id} onRowPress={(x) => navigate('lease', { id: x.l.id })} columns={[
          { key: 'i', title: 'Lease', min: 90, render: (x) => <T mono size={12.5} color={colors.primary}>{x.l.id}</T> },
          { key: 't', title: 'Tenant', flex: 1.4, min: 150, render: (x) => <T size={13} weight="semibold">{lookup.tenant(x.l.tenantId)?.name}</T> },
          { key: 'p', title: 'Property', flex: 1.2, min: 140, render: (x) => <T size={13} color={colors.textSoft}>{lookup.property(x.l.propertyId)?.short} · {lookup.unit(x.l.unitId)?.code}</T> },
          { key: 'e', title: 'Ends', min: 100, render: (x) => <T size={13}>{fmtDate(x.l.end)}</T> },
          { key: 'd', title: 'Days', min: 70, render: (x) => <T size={13} weight="bold" color={x.d < 0 ? colors.danger : x.d <= 30 ? colors.warning : colors.text}>{x.d}</T> },
          { key: 'n', title: 'Tenant intent', min: 120, render: (x) => x.l.tenantIntent ? <Badge label={x.l.tenantIntent === 'renew' ? 'Renewing' : 'Moving out'} tone={x.l.tenantIntent === 'renew' ? 'success' : 'warning'} /> : <T size={12.5} color={colors.faint}>No response</T> },
        ]} />
      </Card>
    );
    if (tab === 'maintenance') {
      const res = scope.requests.filter((r) => r.resolvedAt);
      return (
        <Grid cols={{ mobile: 2, desktop: 4 }} gap={12}>
          {tile('Requests (30 days)', pf.last30.length, `${pf.open.length} still open`)}
          {tile('Avg resolution', `${(res.reduce((s, r) => s + (parseDate(r.resolvedAt!).getTime() - parseDate(r.createdAt).getTime()) / 86400000, 0) / Math.max(1, res.length)).toFixed(1)}d`, 'Target 3 days')}
          {tile('Spend (30 days)', naira(pf.last30.reduce((s, r) => s + (r.cost ?? 0), 0)), 'Completed jobs')}
          {tile('Tenant rating', `${(res.filter((r) => r.rating).reduce((s, r) => s + (r.rating ?? 0), 0) / Math.max(1, res.filter((r) => r.rating).length)).toFixed(1)} / 5`, 'Confirmed fixes')}
        </Grid>
      );
    }
    if (tab === 'vendors') return (
      <Card pad={0}>
        <DataTable rows={[...state.vendors].sort((a, b) => b.completed - a.completed)} keyOf={(v) => v.id} columns={[
          { key: 'v', title: 'Vendor', flex: 1.6, min: 180, render: (v) => <T size={13} weight="semibold">{v.name}</T> },
          { key: 't', title: 'Trade', min: 120, render: (v) => <T size={13} color={colors.textSoft}>{v.trade}</T> },
          { key: 'c', title: 'Completed', min: 90, render: (v) => <T size={13}>{v.completed}</T> },
          { key: 'a', title: 'Avg days', min: 90, render: (v) => <T size={13}>{v.avgDays}</T> },
          { key: 'r', title: 'Rating', min: 80, render: (v) => <T size={13} weight="semibold">{v.rating.toFixed(1)}</T> },
          { key: 's', title: 'Spend this month', min: 130, render: (v) => <T size={13}>{naira(v.spendThisMonth)}</T> },
        ]} />
      </Card>
    );
    const newThis = scope.tenants.filter((t) => Date.now() - parseDate(t.joinedAt).getTime() < 90 * 86400000);
    return (
      <Grid cols={{ mobile: 2, desktop: 4 }} gap={12}>
        {tile('Active tenants', pf.activeTenants.length, `${pf.pendingTenants.length} awaiting approval`)}
        {tile('New in 90 days', newThis.length, 'Onboarded or self sign-up')}
        {tile('Moved out', scope.tenants.filter((t) => t.status === 'former' || t.status === 'deactivated').length, 'All time')}
        {tile('Renewal rate', pct(state.leases.filter((l) => l.renewedTo).length, state.leases.filter((l) => l.renewedTo || l.terminated).length, 0), 'Leases renewed vs ended')}
      </Grid>
    );
  };

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Reports' }]} title="Reports"
        actions={<>
          <Select compact value={loc} onChange={setLoc} options={[{ value: 'all', label: 'All locations' }, ...scope.locations.map((l) => ({ value: l.id, label: l.name }))]} style={{ minWidth: 150 }} />
          <Select compact value={period} onChange={setPeriod} options={[{ value: 'ytd', label: `Jan – ${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}` }, { value: '12m', label: 'Last 12 months' }]} style={{ minWidth: 150 }} />
          <Button title="Export PDF" icon={Download} variant="secondary" onPress={() => { if (!printPage()) toast('PDF export is available on the web app', 'info'); }} />
          <Button title="Export Excel" icon={Download} variant="secondary" onPress={exportExcel} />
        </>} />
      <Tabs value={tab} onChange={setTab} style={{ marginBottom: 18 }} tabs={[{ value: 'occupancy', label: 'Occupancy' }, { value: 'rent', label: 'Rent and arrears' }, { value: 'leases', label: 'Lease expiry' }, { value: 'maintenance', label: 'Maintenance' }, { value: 'vendors', label: 'Vendors' }, { value: 'tenants', label: 'Tenants' }]} />
      {content()}
    </Page>
  );
}

// ---------------------------------------------------------------- Documents

const FOLDERS: Array<{ key: DocFile['folder'] | 'all'; label: string; icon: any }> = [
  { key: 'all', label: 'All documents', icon: Folder }, { key: 'Lease agreements', label: 'Lease agreements', icon: FileText }, { key: 'Tenant ID and KYC', label: 'Tenant ID and KYC', icon: Users },
  { key: 'Receipts', label: 'Receipts', icon: Receipt }, { key: 'Property papers', label: 'Property papers', icon: Building2 }, { key: 'Maintenance', label: 'Maintenance', icon: Wrench }, { key: 'Vendor contracts', label: 'Vendor contracts', icon: FileText },
];

export function DocumentsScreen() {
  const { state, addDocument } = useStore();
  const scope = useScope();
  const { route } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const [folder, setFolder] = useState<DocFile['folder'] | 'all'>('all');
  const [q, setQ] = useState('');
  const [prop, setProp] = useState(route.params.propertyId ?? 'all');
  const [kind, setKind] = useState('all');
  const [expiring, setExpiring] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const docs = scope.documents;
  const rows = docs.filter((d) => (folder === 'all' || d.folder === folder) && (!q || `${d.name} ${d.linkedTo}`.toLowerCase().includes(q.toLowerCase())) && (prop === 'all' || d.propertyId === prop) && (kind === 'all' || d.kind === kind) && (!expiring || (d.expires && daysUntil(d.expires) <= 30)));
  const pg = usePaged(rows, 10, `${folder}${q}${prop}${kind}${expiring}`);
  const expCount = docs.filter((d) => d.expires && daysUntil(d.expires) <= 30).length;
  const usedMb = docs.reduce((s, d) => s + d.sizeKb, 0) / 1024;
  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Documents' }]} title="Documents"
        actions={<><Button title="New folder" icon={FolderPlus} variant="secondary" onPress={() => toast('Folders are managed by your administrator in this version', 'info')} /><Button title="Upload" icon={Upload} onPress={() => setUploadOpen(true)} /></>} />
      <View style={{ flexDirection: bp === 'mobile' ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>
        <Card pad={10} style={{ width: bp === 'mobile' ? '100%' : 230 }}>
          {FOLDERS.map((f) => {
            const on = f.key === folder;
            const n = f.key === 'all' ? docs.length : docs.filter((d) => d.folder === f.key).length;
            return (
              <Touch key={f.key} onPress={() => setFolder(f.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 8, backgroundColor: on ? colors.primarySoft : 'transparent' }} hoverStyle={{ backgroundColor: on ? colors.primarySoft : colors.cardAlt }}>
                <f.icon size={15} color={on ? colors.primary : colors.subtext} />
                <T size={12.5} weight={on ? 'semibold' : 'medium'} color={on ? colors.primary : colors.textSoft} style={{ flex: 1 }}>{f.label}</T>
                <T size={11.5} color={colors.subtext}>{n}</T>
              </Touch>
            );
          })}
          <View style={{ padding: 10, marginTop: 8, gap: 6 }}>
            <Row justify="space-between"><T size={11.5} color={colors.subtext}>Storage</T><T size={11.5} weight="semibold">{(usedMb / 1024).toFixed(1)} of 10 GB</T></Row>
            <ProgressBar value={usedMb / 10240} />
          </View>
        </Card>
        <Card pad={0} style={{ flex: 1, width: '100%' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14 }}>
            <View style={{ flexBasis: 220, flexGrow: 2 }}><Input leftIcon={Search} value={q} onChangeText={setQ} placeholder="Search file name, tenant or flat" /></View>
            <View style={{ flexBasis: 140, flexGrow: 1 }}><Select compact value={prop} onChange={setProp} options={[{ value: 'all', label: 'All properties' }, ...scope.properties.map((p) => ({ value: p.id, label: p.short }))]} /></View>
            <View style={{ flexBasis: 110, flexGrow: 1 }}><Select compact value={kind} onChange={setKind} options={[{ value: 'all', label: 'Any type' }, { value: 'pdf', label: 'PDF' }, { value: 'jpg', label: 'Image' }, { value: 'doc', label: 'Word' }]} /></View>
            <Chip label={`Expiring IDs (${expCount})`} icon={TriangleAlert} active={expiring} onPress={() => setExpiring(!expiring)} />
          </View>
          <DataTable rows={pg.slice} keyOf={(d) => d.id} empty={<EmptyState icon={Folder} title="No documents" body="Upload a file or change the filters." />} columns={[
            { key: 'n', title: 'Name', flex: 2.2, min: 240, render: (d) => <Row gap={10}><FileIcon kind={d.kind} size={28} /><T size={12.5} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>{d.name}</T>{d.expires && daysUntil(d.expires) <= 30 ? <Badge label={`Expires ${fmtShort(d.expires)}`} tone="warning" size="sm" /> : null}</Row> },
            { key: 'l', title: 'Linked to', flex: 1.2, min: 140, render: (d) => <T size={12.5} color={colors.textSoft} numberOfLines={1}>{d.linkedTo}</T> },
            { key: 'f', title: 'Folder', flex: 1.1, min: 130, render: (d) => <T size={12.5} color={colors.textSoft}>{d.folder}</T> },
            { key: 'u', title: 'Uploaded by', min: 110, render: (d) => <T size={12.5} color={colors.textSoft}>{d.uploadedBy}</T> },
            { key: 'd', title: 'Date', min: 100, render: (d) => <T size={12.5} color={colors.textSoft}>{fmtDate(d.date)}</T> },
            { key: 'a', title: '', min: 50, flex: 0.3, align: 'right', render: (d) => <Touch onPress={() => toast(`Downloading ${d.name}`)} style={{ padding: 6 }}><Download size={15} color={colors.subtext} /></Touch> },
          ]} />
          <Pagination page={pg.page} pages={pg.pages} onPage={pg.setPage} label={`Showing ${pg.from}–${pg.to} of ${rows.length} documents`} />
        </Card>
      </View>
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUpload={(d) => { addDocument(d); toast(`${d.name} uploaded`); setUploadOpen(false); }} />
    </Page>
  );
}

function UploadDialog({ open, onClose, onUpload }: { open: boolean; onClose: () => void; onUpload: (d: Omit<DocFile, 'id' | 'date' | 'uploadedBy'>) => void }) {
  const scope = useScope();
  const [name, setName] = useState('');
  const [folder, setFolder] = useState<DocFile['folder']>('Lease agreements');
  const [prop, setProp] = useState(scope.properties[0]?.id ?? '');
  const [picked, setPicked] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title="Upload document" width={480} footer={<><Button title="Cancel" variant="secondary" onPress={onClose} /><Button title="Upload" disabled={!picked || !name.trim()} onPress={() => { onUpload({ name: name.trim(), kind: name.toLowerCase().endsWith('.jpg') || name.toLowerCase().endsWith('.png') ? 'jpg' : name.toLowerCase().endsWith('.doc') || name.toLowerCase().endsWith('.docx') ? 'doc' : 'pdf', folder, linkedTo: scope.properties.find((p) => p.id === prop)?.short ?? '', propertyId: prop, sizeKb: 640 }); setPicked(false); setName(''); }} /></>}>
      <View style={{ gap: 14 }}>
        <Touch onPress={() => { setPicked(true); if (!name) setName('Tenancy agreement 2026.pdf'); }} style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: picked ? colors.primary : colors.borderStrong, backgroundColor: picked ? colors.primaryTint : colors.card, borderRadius: radius.md, padding: 22, alignItems: 'center', gap: 6 }}>
          {picked ? <Check size={18} color={colors.primary} /> : <Upload size={18} color={colors.subtext} />}
          <T size={13} weight="semibold">{picked ? 'File ready to upload' : 'Choose a file'}</T>
          <T size={11.5} color={colors.subtext}>PDF, JPG, PNG or Word up to 20 MB</T>
        </Touch>
        <Input label="File name" value={name} onChangeText={setName} />
        <Select label="Folder" value={folder} onChange={setFolder} options={FOLDERS.filter((f) => f.key !== 'all').map((f) => ({ value: f.key as DocFile['folder'], label: f.label }))} />
        <Select label="Property" value={prop} onChange={setProp} options={scope.properties.map((p) => ({ value: p.id, label: p.name }))} />
      </View>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Notifications (staff)

const TONE_ICON: Record<string, any> = { Maintenance: Wrench, Leases: FileText, Rent: Receipt, Tenants: Users, System: Shield, Announcement: Megaphone, 'My requests': Wrench };

export function NotificationList({ items, onOpen }: { items: AppNotification[]; onOpen: (n: AppNotification) => void }) {
  const today = items.filter((n) => isToday(n.at));
  const week = items.filter((n) => !isToday(n.at) && Date.now() - parseDate(n.at).getTime() < 7 * 86400000);
  const older = items.filter((n) => Date.now() - parseDate(n.at).getTime() >= 7 * 86400000);
  const group = (title: string, list: AppNotification[]) => list.length ? (
    <View key={title}>
      <T size={10.5} weight="bold" color={colors.faint} upper style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>{title}</T>
      {list.map((n) => {
        const Icon = TONE_ICON[n.category] ?? Bell;
        return (
          <Touch key={n.id} onPress={() => onOpen(n)} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: n.read ? colors.card : colors.primaryTint }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
            <IconTile icon={Icon} tone={n.tone as Tone} size={30} iconSize={14} />
            <View style={{ flex: 1 }}>
              <T size={13} color={colors.textSoft}><T size={13} weight="semibold" color={colors.text}>{n.title}</T> {n.body}</T>
              <T size={11.5} color={colors.subtext} style={{ marginTop: 2 }}>{n.meta}</T>
            </View>
            <Row gap={6} align="flex-start"><T size={11.5} color={colors.subtext}>{feedStamp(n.at)}</T>{!n.read ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginTop: 4 }} /> : null}</Row>
          </Touch>
        );
      })}
    </View>
  ) : null;
  if (!items.length) return <EmptyState icon={Bell} title="You're all caught up" body="New alerts will show up here." />;
  return <View>{group('Today', today)}{group('Earlier this week', week)}{group('Older', older)}</View>;
}

export function NotificationsScreen() {
  const { state, markNotificationRead, markAllNotificationsRead } = useStore();
  const { navigate } = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState('all');
  const [prefsOpen, setPrefsOpen] = useState(false);
  const all = state.notifications.filter((n) => n.audience === 'staff').sort((a, b) => (a.at < b.at ? 1 : -1));
  const unread = all.filter((n) => !n.read).length;
  const cats: Record<string, string[]> = { maintenance: ['Maintenance'], leases: ['Leases'], rent: ['Rent'], tenants: ['Tenants'], system: ['System'] };
  const rows = tab === 'all' ? all : all.filter((n) => cats[tab]?.includes(n.category));
  return (
    <Page maxWidth={1100}>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Notifications' }]} title="Notifications"
        actions={<><Button title="Mark all as read" icon={CheckCheck} variant="secondary" onPress={() => { markAllNotificationsRead('staff'); toast('All caught up'); }} /><Button title="Preferences" icon={SlidersHorizontal} variant="secondary" onPress={() => setPrefsOpen(true)} /></>} />
      <Card pad={0}>
        <View style={{ paddingHorizontal: 16 }}>
          <Tabs value={tab} onChange={setTab} style={{ borderBottomWidth: 0 }} tabs={[{ value: 'all', label: 'All', count: `${unread} unread` }, { value: 'maintenance', label: 'Maintenance' }, { value: 'leases', label: 'Leases' }, { value: 'rent', label: 'Rent' }, { value: 'tenants', label: 'Tenants' }, { value: 'system', label: 'System' }]} />
        </View>
        <NotificationList items={rows} onOpen={(n) => { markNotificationRead(n.id); if (n.link) navigate(n.link.name, n.link.params); }} />
      </Card>
      <NotifPrefsDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </Page>
  );
}

function NotifPrefsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [p, setP] = useState({ urgent: true, newReq: true, lease: true, rent: true, digest: false });
  return (
    <Dialog open={open} onClose={onClose} title="Notification preferences" width={460} footer={<Button title="Save" onPress={() => { toast('Preferences saved'); onClose(); }} />}>
      <View style={{ gap: 14 }}>
        {([['urgent', 'Urgent maintenance by SMS'], ['newReq', 'New requests in-app'], ['lease', 'Lease expiry alerts by email'], ['rent', 'Rent overdue alerts'], ['digest', 'Daily email digest']] as const).map(([k, l]) => (
          <Row key={k} justify="space-between"><T size={13}>{l}</T><Toggle value={p[k]} onChange={(v) => setP({ ...p, [k]: v })} /></Row>
        ))}
      </View>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Users & permissions

const PERMS: Array<{ label: string; cells: [string, string, string, string] }> = [
  { label: 'Properties, blocks and units', cells: ['Full', 'Own sites', 'View', '—'] },
  { label: 'Tenants and onboarding', cells: ['Full', 'Own sites', 'View', '—'] },
  { label: 'Leases and renewals', cells: ['Full', 'Own sites', 'View', '—'] },
  { label: 'Maintenance requests', cells: ['Full', 'Own sites', 'View', 'Own sites'] },
  { label: 'Vendors', cells: ['Full', 'View', 'View', '—'] },
  { label: 'Send announcements', cells: ['Full', 'Own sites', '—', '—'] },
  { label: 'Reports and exports', cells: ['Full', 'Own sites', 'View', '—'] },
  { label: 'Users, roles and settings', cells: ['Full', '—', '—', '—'] },
];
const ROLE_TONE: Record<Role, Tone> = { super_admin: 'accent', manager: 'purple', accountant: 'info', caretaker: 'neutral', tenant: 'neutral' };

export function UsersScreen() {
  const { state, me, createUser, saveUserRole, refreshUsers, sendCode, updateUser } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('team');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const team = state.users.filter((u) => u.role !== 'tenant');
  const pending = team.filter((u) => u.status === 'invited');
  const cell = (v: string) => v === '—' ? <T size={12.5} color={colors.faint}>—</T> : <Badge label={v} tone={v === 'Full' ? 'success' : v === 'Own sites' ? 'accent' : 'info'} size="sm" />;
  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Users & Permissions' }]} title="Users & Permissions" actions={<><Button title="Refresh users" variant="secondary" onPress={() => { void refreshUsers().catch((e) => toast(String(e), 'danger')); }} /><Button title="Create user" icon={UserPlus} onPress={() => setInviteOpen(true)} /></>} />
      <Tabs value={tab} onChange={setTab} style={{ marginBottom: 16 }} tabs={[{ value: 'team', label: 'Team members', count: team.length }, { value: 'accounts', label: 'All accounts', count: state.users.length }, { value: 'roles', label: 'Roles', count: 5 }, { value: 'pending', label: 'Pending invites', count: pending.length }]} />
      {tab !== 'roles' ? (
        <Card pad={0} style={{ marginBottom: 16 }}>
          <DataTable rows={tab === 'pending' ? pending : tab === 'accounts' ? state.users : team} keyOf={(u) => u.id} empty={<EmptyState icon={UserPlus} title="No pending invites" />} columns={[
            { key: 'u', title: 'User', flex: 1.7, min: 210, render: (u) => <Row gap={10}><Avatar name={u.name} size={30} /><View style={{ flex: 1 }}><T size={13} weight="semibold">{u.name}{u.id === me?.id ? <T size={11.5} color={colors.subtext}>  (you)</T> : null}</T><T size={11.5} color={colors.subtext} numberOfLines={1}>{u.email}</T></View></Row> },
            { key: 'r', title: 'Role', min: 140, render: (u) => <Badge label={roleLabel(u.role)} tone={ROLE_TONE[u.role]} /> },
            { key: 'a', title: 'Access to', flex: 1.2, min: 150, render: (u) => <T size={12.5} color={colors.textSoft} numberOfLines={1}>{u.access}</T> },
            { key: 't', title: 'Two-step', min: 90, render: (u) => u.twoStep ? <Row gap={4}><Check size={13} color={colors.success} /><T size={12.5} color={colors.success}>On</T></Row> : <T size={12.5} color={colors.warning}>• Off</T> },
            { key: 'l', title: 'Last active', min: 110, render: (u) => <T size={12.5} color={colors.textSoft}>{u.status === 'invited' ? `Invited ${fmtShort(u.lastActive)}` : timeAgo(u.lastActive) === 'just now' ? 'Now' : timeAgo(u.lastActive)}</T> },
            { key: 's', title: 'Status', min: 100, render: (u) => <Badge label={u.status === 'active' ? 'Active' : u.status === 'invited' ? 'Invite sent' : 'Suspended'} tone={u.status === 'active' ? 'success' : u.status === 'invited' ? 'warning' : 'neutral'} dot /> },
            { key: 'm', title: '', min: 50, flex: 0.3, align: 'right', render: (u) => u.id === me?.id ? null : (
              <Menu width={200} trigger={(open) => <Touch onPress={open} style={{ padding: 6, borderRadius: 6 }} hoverStyle={{ backgroundColor: colors.neutralSoft }}><Ellipsis size={17} color={colors.subtext} /></Touch>}
                items={[
                  { label: 'Edit role and access', icon: Pencil, onPress: () => setEditingUser(u) },
                  { label: u.twoStep ? 'Turn off two-step' : 'Require two-step', icon: ShieldCheck, onPress: () => { updateUser(u.id, { twoStep: !u.twoStep }); toast(`Two-step ${u.twoStep ? 'turned off' : 'required'} for ${u.name}`); } },
                  { label: 'Reset password', icon: KeyRound, onPress: () => { void sendCode(u.email, 'reset').then((r) => toast(r.ok ? `Password reset email sent to ${u.email}` : r.error, r.ok ? 'success' : 'danger')); } },
                  u.status === 'suspended' ? { label: 'Reactivate', icon: RotateCcw, onPress: () => { updateUser(u.id, { status: 'active' }); toast(`${u.name} reactivated`); } }
                    : { label: 'Suspend access', icon: X, danger: true, onPress: () => confirm.ask({ title: `Suspend ${u.name}?`, body: 'They will be signed out and unable to sign in until reactivated.', confirm: 'Suspend', danger: true, onConfirm: () => { updateUser(u.id, { status: 'suspended' }); toast(`${u.name} suspended`); } }) },
                ]} />
            ) },
          ]} />
        </Card>
      ) : null}
      <Card pad={0}>
        <View style={{ padding: 20, paddingBottom: 12 }}><CardHeader style={{ marginBottom: 0 }} title="Role permissions" subtitle="What each role can do. Super Admin can do everything."  /></View>
        <DataTable rows={PERMS} keyOf={(p) => p.label} dense columns={[
          { key: 'p', title: 'Permission', flex: 2, min: 220, render: (p) => <T size={13}>{p.label}</T> },
          { key: 'a', title: 'Super Admin', min: 110, align: 'center', render: (p) => cell(p.cells[0]) },
          { key: 'm', title: 'Property Manager', min: 130, align: 'center', render: (p) => cell(p.cells[1]) },
          { key: 'c', title: 'Accountant', min: 110, align: 'center', render: (p) => cell(p.cells[2]) },
          { key: 't', title: 'Caretaker', min: 110, align: 'center', render: (p) => cell(p.cells[3]) },
        ]} />
      </Card>
      {confirm.node}
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onCreate={async (u) => {
        const result = await createUser(u);
        if (result.ok) { toast('Account created. The user must confirm their email if required by your authentication settings.', 'success'); setInviteOpen(false); }
        return result;
      }} />
      {editingUser ? <RoleDialog user={editingUser} onClose={() => setEditingUser(null)} onSave={async (role, ids, access) => {
        const result = await saveUserRole(editingUser.id, role, ids, access);
        if (result.ok) { toast('Role and access saved', 'success'); setEditingUser(null); }
        return result;
      }} /> : null}
    </Page>
  );
}

function accessLabel(role: Role, ids: string[], properties: { id: string; name: string }[]) {
  if (role === 'super_admin') return 'All locations';
  if (role === 'accountant') return 'All locations, read only';
  if (role === 'tenant') return 'Own tenancy';
  return properties.filter((p) => ids.includes(p.id)).map((p) => p.name).join(', ') || 'None yet';
}

function InviteDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (u: CreateUserInput) => Promise<AuthResult> }) {
  const { state } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('manager');
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const valid = !!name.trim() && /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 8 && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  const submit = async () => {
    setLoading(true); setError('');
    try {
      const result = await onCreate({ name: name.trim(), email: email.trim(), password, role, access: accessLabel(role, ids, state.properties), propertyIds: ids });
      if (!result.ok) setError(result.error);
      else { setName(''); setEmail(''); setPassword(''); setIds([]); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onClose={() => { if (!loading) onClose(); }} title="Create a user account" footer={<><Button title="Cancel" variant="secondary" disabled={loading} onPress={onClose} /><Button title="Create account" loading={loading} disabled={!valid || loading} onPress={submit} /></>}>
      <View style={{ gap: 14 }}>
        <Notice tone="info">Use a real email address. The user confirms their email before signing in when email confirmation is enabled. Existing users can be assigned a role from All accounts.</Notice>
        <Input label="Full name" required value={name} onChangeText={setName} />
        <Input label="Email address" required value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Input label="Initial password" required value={password} onChangeText={setPassword} secure hint="At least 8 characters with a number and a symbol. Share this securely with the user." />
        <Select label="Role" required value={role} onChange={setRole} options={(['super_admin', 'manager', 'accountant', 'caretaker', 'tenant'] as Role[]).map((r) => ({ value: r, label: roleLabel(r) }))} />
        <PropertyAccess role={role} ids={ids} onChange={setIds} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </View>
    </Dialog>
  );
}

function PropertyAccess({ role, ids, onChange }: { role: Role; ids: string[]; onChange: (ids: string[]) => void }) {
  const { state } = useStore();
  if (role !== 'manager' && role !== 'caretaker') return null;
  return <View style={{ gap: 8 }}>
    <T size={12.5} weight="semibold">Access to properties</T>
    <Row wrap gap={8}>{state.properties.map((p) => <Chip key={p.id} label={p.name} active={ids.includes(p.id)} onPress={() => onChange(ids.includes(p.id) ? ids.filter((id) => id !== p.id) : [...ids, p.id])} />)}</Row>
    {!ids.length ? <Notice tone="info">Select properties to give this user access to their records.</Notice> : null}
  </View>;
}

function RoleDialog({ user, onClose, onSave }: { user: User; onClose: () => void; onSave: (role: Role, ids: string[], access: string) => Promise<AuthResult> }) {
  const { state } = useStore();
  const [role, setRole] = useState(user.role);
  const [ids, setIds] = useState(user.propertyIds ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  return <Dialog open onClose={() => { if (!loading) onClose(); }} title={`Role and access: ${user.name}`} footer={<><Button title="Cancel" variant="secondary" disabled={loading} onPress={onClose} /><Button title="Save access" loading={loading} disabled={loading} onPress={async () => {
    setLoading(true); setError('');
    try {
      const result = await onSave(role, ids, accessLabel(role, ids, state.properties));
      if (!result.ok) setError(result.error);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }} /></>}>
    <View style={{ gap: 14 }}>
      <T>{user.email}</T>
      <Select label="Role" value={role} onChange={setRole} options={(['super_admin', 'manager', 'accountant', 'caretaker', 'tenant'] as Role[]).map((r) => ({ value: r, label: roleLabel(r) }))} />
      <PropertyAccess role={role} ids={ids} onChange={setIds} />
      <Notice tone="info">Ask the user to sign out and sign back in after changing their role.</Notice>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </View>
  </Dialog>;
}

// ---------------------------------------------------------------- Activity logs

export function ActivityLogsScreen() {
  const { state } = useStore();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [user, setUser] = useState('all');
  const [area, setArea] = useState('all');
  const [range, setRange] = useState('7');
  const users = [...new Set(state.logs.map((l) => l.user))];
  const areas = [...new Set(state.logs.map((l) => l.area))];
  const rows = state.logs.filter((l) => (!q || `${l.action} ${l.record}`.toLowerCase().includes(q.toLowerCase())) && (user === 'all' || l.user === user) && (area === 'all' || l.area === area) && (range === 'all' || Date.now() - parseDate(l.at).getTime() <= parseInt(range, 10) * 86400000));
  const pg = usePaged(rows, 12, `${q}${user}${area}${range}`);
  const areaTone: Record<string, Tone> = { Maintenance: 'accent', Leases: 'purple', Communications: 'info', Properties: 'primary', Tenants: 'success', Reports: 'neutral', Users: 'danger', Security: 'neutral' };
  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Activity logs' }]} title="Activity logs"
        actions={<Button title="Export CSV" icon={Download} variant="secondary" onPress={() => { const ok = downloadCSV('activity-log', rows.map((l) => ({ Time: l.at, User: l.user, Action: l.action, Record: l.record, Area: l.area, 'IP / device': l.device }))); toast(ok ? `${rows.length} events exported` : 'Export is available on the web app', ok ? 'success' : 'info'); }} />} />
      <Card pad={0}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14 }}>
          <View style={{ flexBasis: 220, flexGrow: 2 }}><Input leftIcon={Search} value={q} onChangeText={setQ} placeholder="Search action or record" /></View>
          <View style={{ flexBasis: 140, flexGrow: 1 }}><Select compact value={user} onChange={setUser} options={[{ value: 'all', label: 'All users' }, ...users.map((u) => ({ value: u, label: u }))]} /></View>
          <View style={{ flexBasis: 140, flexGrow: 1 }}><Select compact value={area} onChange={setArea} options={[{ value: 'all', label: 'All areas' }, ...areas.map((a) => ({ value: a, label: a }))]} /></View>
          <View style={{ flexBasis: 130, flexGrow: 1 }}><Select compact value={range} onChange={setRange} options={[{ value: '1', label: 'Today' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: 'all', label: 'All time' }]} /></View>
        </View>
        <DataTable rows={pg.slice} keyOf={(l) => l.id} dense empty={<EmptyState icon={FileText} title="No events" />} columns={[
          { key: 't', title: 'Time', min: 110, render: (l) => <T size={12.5} color={colors.textSoft}>{fmtStamp(l.at)}</T> },
          { key: 'u', title: 'User', flex: 1.2, min: 150, render: (l) => <Row gap={8}><Avatar name={l.user} size={24} /><T size={12.5} weight="semibold">{l.user}</T></Row> },
          { key: 'a', title: 'Action', flex: 2, min: 220, render: (l) => <T size={12.5}>{l.action}</T> },
          { key: 'r', title: 'Record', min: 110, render: (l) => <T mono size={12} color={colors.textSoft}>{l.record}</T> },
          { key: 'ar', title: 'Area', min: 120, render: (l) => <Badge label={l.area} tone={areaTone[l.area] ?? 'neutral'} size="sm" /> },
          { key: 'd', title: 'IP / device', flex: 1.4, min: 180, render: (l) => <T size={12} color={colors.subtext} numberOfLines={1}>{l.device}</T> },
        ]} />
        <Pagination page={pg.page} pages={pg.pages} onPage={pg.setPage} label={`Showing ${pg.from}–${pg.to} of ${rows.length} events · Logs are kept for 2 years`} />
      </Card>
    </Page>
  );
}

// ---------------------------------------------------------------- Settings

export function SettingsScreen() {
  const { state, updateSettings } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const { bp } = useBreakpoint();
  const [section, setSection] = useState('org');
  const [s, setS] = useState(state.settings);
  const dirty = JSON.stringify(s) !== JSON.stringify(state.settings);
  const sections = [
    { key: 'org', label: 'Organisation', icon: Building2 }, { key: 'rent', label: 'Rent and billing', icon: Receipt }, { key: 'maint', label: 'Maintenance', icon: Wrench },
    { key: 'notif', label: 'Notifications', icon: Bell }, { key: 'lease', label: 'Lease templates', icon: FileText }, { key: 'security', label: 'Security', icon: Shield }, { key: 'integrations', label: 'Integrations', icon: Plug },
  ];
  const prio: Array<{ k: Priority; label: string; sub: string; tone: Tone }> = [
    { k: 'urgent', label: 'Urgent', sub: 'Gas, fire, sparking, flooding', tone: 'dangerSolid' }, { k: 'high', label: 'High', sub: 'No water, no power, leaks', tone: 'danger' },
    { k: 'medium', label: 'Medium', sub: 'Appliances, fittings', tone: 'warning' }, { k: 'low', label: 'Low', sub: 'Cosmetic, non-urgent', tone: 'neutral' },
  ];
  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Settings' }]} title="Settings"
        actions={<><Button title="Discard" variant="secondary" disabled={!dirty} onPress={() => setS(state.settings)} /><Button title="Save changes" disabled={!dirty} onPress={() => { updateSettings(s); toast('Settings saved'); }} /></>} />
      <View style={{ flexDirection: bp === 'mobile' ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>
        <Card pad={8} style={{ width: bp === 'mobile' ? '100%' : 220 }}>
          {sections.map((x) => (
            <Touch key={x.key} onPress={() => setSection(x.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 8, backgroundColor: section === x.key ? colors.primarySoft : 'transparent' }} hoverStyle={{ backgroundColor: section === x.key ? colors.primarySoft : colors.cardAlt }}>
              <x.icon size={15} color={section === x.key ? colors.primary : colors.subtext} />
              <T size={12.5} weight={section === x.key ? 'semibold' : 'medium'} color={section === x.key ? colors.primary : colors.textSoft}>{x.label}</T>
            </Touch>
          ))}
        </Card>
        <View style={{ flex: 1, gap: 16, width: '100%' }}>
          {section === 'org' || section === 'rent' ? (
            <>
              <Card>
                <CardHeader title="Organisation" subtitle="Shown on notices, receipts and messages to tenants." />
                <Row gap={14} style={{ marginBottom: 16 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: colors.sidebar, alignItems: 'center', justifyContent: 'center' }}><House size={24} color={colors.accent} /></View>
                  <View><Row gap={8}><Button title="Change logo" size="sm" variant="secondary" onPress={() => toast('Logo updated')} /><Button title="Remove" size="sm" variant="ghost" /></Row><T size={11.5} color={colors.subtext} style={{ marginTop: 4 }}>PNG or SVG, at least 256 × 256 px</T></View>
                </Row>
                <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
                  <Input label="Business name" value={s.orgName} onChangeText={(v) => setS({ ...s, orgName: v })} />
                  <Input label="RC number" value={s.rcNumber} onChangeText={(v) => setS({ ...s, rcNumber: v })} />
                  <Input label="Contact email" value={s.email} onChangeText={(v) => setS({ ...s, email: v })} autoCapitalize="none" />
                  <Input label="Contact phone" value={s.phone} onChangeText={(v) => setS({ ...s, phone: v })} />
                </Grid>
                <Input fieldStyle={{ marginTop: 14 }} label="Office address" value={s.address} onChangeText={(v) => setS({ ...s, address: v })} />
              </Card>
              <Card>
                <CardHeader title="Regional" />
                <Grid cols={{ mobile: 1, tablet: 3 }} gap={14}>
                  <Select label="Currency" value={s.currency} onChange={(v) => setS({ ...s, currency: v })} options={[{ value: 'Nigerian naira (₦)', label: 'Nigerian naira (₦)' }, { value: 'US dollar ($)', label: 'US dollar ($)' }]} />
                  <Select label="Time zone" value={s.timezone} onChange={(v) => setS({ ...s, timezone: v })} options={[{ value: 'West Africa Time (GMT+1)', label: 'West Africa Time (GMT+1)' }]} />
                  <Select label="Date format" value={s.dateFormat} onChange={(v) => setS({ ...s, dateFormat: v })} options={[{ value: '24 Sep 2026', label: '24 Sep 2026' }, { value: '24/09/2026', label: '24/09/2026' }]} />
                </Grid>
              </Card>
            </>
          ) : null}
          {section === 'org' || section === 'maint' ? (
            <Card>
              <CardHeader title="Maintenance response times" subtitle="Used to flag requests that are past their target." />
              <View style={{ gap: 10 }}>
                {prio.map((p) => (
                  <Row key={p.k} gap={12}>
                    <View style={{ width: 80 }}><Badge label={p.label} tone={p.tone} dot={p.k !== 'urgent'} /></View>
                    <T size={12.5} color={colors.subtext} style={{ flex: 1 }}>{p.sub}</T>
                    <View style={{ width: 70 }}><Input value={String(s.response[p.k])} onChangeText={(v) => setS({ ...s, response: { ...s.response, [p.k]: parseInt(v, 10) || 0 } })} keyboardType="number-pad" style={{ textAlign: 'right' }} /></View>
                    <T size={12.5} color={colors.subtext} style={{ width: 40 }}>{s.response[p.k] === 1 ? 'hour' : 'hours'}</T>
                  </Row>
                ))}
              </View>
            </Card>
          ) : null}
          {section === 'org' || section === 'notif' ? (
            <Card>
              <CardHeader title="Tenant self-service" />
              <View style={{ gap: 14 }}>
                {([['selfReport', 'Tenants can report issues from the portal', 'Requests go straight to the property’s manager'], ['selfDocs', 'Tenants can download their lease and receipts', 'From the Documents tab in their portal'], ['rateRepairs', 'Ask tenants to rate completed repairs', 'Ratings appear on the vendor’s record']] as const).map(([k, l, sub]) => (
                  <Row key={k} justify="space-between" gap={12}><View style={{ flex: 1 }}><T size={13} weight="semibold">{l}</T><T size={11.5} color={colors.subtext}>{sub}</T></View><Toggle value={s[k]} onChange={(v) => setS({ ...s, [k]: v })} /></Row>
                ))}
              </View>
            </Card>
          ) : null}
          {section === 'security' ? (
            <Card>
              <CardHeader title="Security" />
              <View style={{ gap: 14 }}>
                <Row justify="space-between"><View style={{ flex: 1 }}><T size={13} weight="semibold">Require two-step for admins</T><T size={11.5} color={colors.subtext}>Super admins and managers must use an authenticator app.</T></View><Toggle value onChange={() => toast('Two-step is always required for super admins', 'info')} /></Row>
                <Row justify="space-between"><View style={{ flex: 1 }}><T size={13} weight="semibold">Session timeout</T><T size={11.5} color={colors.subtext}>Sign staff out after inactivity.</T></View><Select compact value="8h" onChange={() => {}} options={[{ value: '1h', label: '1 hour' }, { value: '8h', label: '8 hours' }, { value: '24h', label: '24 hours' }]} style={{ width: 130 }} /></Row>
              </View>
            </Card>
          ) : null}
          {section === 'lease' || section === 'integrations' ? (
            <Card><EmptyState icon={section === 'lease' ? FileText : Plug} title={section === 'lease' ? 'Lease templates' : 'Integrations'} body={section === 'lease' ? 'Upload your standard tenancy agreement so new leases and renewals start from it.' : 'Payments, e-signature and accounting integrations arrive in Phase 2.'} action={section === 'lease' ? <Button title="Upload template" icon={Upload} variant="secondary" onPress={() => toast('Template uploaded')} /> : undefined} /></Card>
          ) : null}
        </View>
      </View>
      {confirm.node}
    </Page>
  );
}

// ---------------------------------------------------------------- Help & support

export function HelpScreen() {
  const { state, me } = useStore();
  const toast = useToast();
  const isTenant = me?.role === 'tenant';
  const [msg, setMsg] = useState('');
  const faqs = isTenant ? [
    ['How do I report a repair?', 'Go to Report an Issue, choose what the problem is, add a photo if you can and submit. Your manager is notified straight away.'],
    ['When will someone come?', 'Urgent issues get a response within the hour. For everything else you’ll see the booked visit time on the request once a repairer is assigned.'],
    ['How do I renew my lease?', 'Open My Lease and tap “I plan to renew”. Your manager will send the new agreement to your portal.'],
  ] : [
    ['How do reminders work?', 'Renewal reminders are sent automatically at 90, 60 and 30 days before a lease ends. You can also send one manually from any lease.'],
    ['Who sees what?', 'Super admins see everything. Managers only see the properties assigned to them. Accountants have read-only access.'],
    ['How do I onboard a tenant?', 'Use Quick Add → Add Tenant. The 7-step form holds the unit for 48 hours while it’s in draft, then goes to the landlord for approval.'],
    ['Can tenants sign up themselves?', 'Yes. They create an account with the invite code from their welcome message and appear under Tenants → Pending approval.'],
  ];
  return (
    <Page maxWidth={1000}>
      <PageHeader title="Help & Support" subtitle="Answers to common questions, or get in touch with the team." />
      <Grid cols={{ mobile: 1, tablet: 3 }} gap={12}>
        {[
          { icon: Phone, t: isTenant ? 'Emergency line, 24 hours' : 'Support line', s: '+234 1 700 2299', tone: 'danger' as Tone },
          { icon: Mail, t: 'Email', s: state.settings.email, tone: 'info' as Tone },
          { icon: BookOpen, t: 'Help centre', s: 'Guides and videos', tone: 'primary' as Tone },
        ].map((x) => (
          <Card key={x.t} pad={16}><Row gap={10}><IconTile icon={x.icon} tone={x.tone} size={34} /><View><T size={13} weight="semibold">{x.t}</T><T size={12.5} color={colors.subtext}>{x.s}</T></View></Row></Card>
        ))}
      </Grid>
      <View style={{ height: 16 }} />
      <Card>
        <CardHeader title="Frequently asked questions" />
        {faqs.map(([q, a], i) => (
          <View key={q} style={{ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <T size={13.5} weight="semibold">{q}</T>
            <T size={13} color={colors.textSoft} style={{ marginTop: 4, lineHeight: 20 }}>{a}</T>
          </View>
        ))}
      </Card>
      <View style={{ height: 16 }} />
      <Card>
        <CardHeader title="Send us a message" subtitle="We usually reply within one working day." />
        <Input value={msg} onChangeText={setMsg} multiline placeholder="How can we help?" />
        <Button title="Send message" icon={Send} style={{ alignSelf: 'flex-end', marginTop: 12 }} disabled={!msg.trim()} onPress={() => { setMsg(''); toast('Message sent to support'); }} />
      </Card>
    </Page>
  );
}

export { CircleHelp, LifeBuoy, ImageIcon, MessageSquare, Pencil, SettingsIcon, Divider, KV, fmtTime, useMemo };
