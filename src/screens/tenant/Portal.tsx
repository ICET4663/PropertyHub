import React, { useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import {
  Bug, Building2, Check, CheckCheck, Clock, Download, Droplet, Fan, FileText, Flame, Hammer, House, Info, Paperclip, Phone, Plus, Send,
  Shield, Sparkles, Star, TriangleAlert, Upload, Wrench, Zap, Siren, CircleHelp, Hourglass, CircleCheck, Megaphone, Snowflake,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, radius, useBreakpoint } from '../../theme';
import { useLookup, useStore } from '../../store/AppContext';
import { useRouter } from '../../nav/router';
import { LiveTag, Page, PageHeader } from '../../components/shell';
import {
  Avatar, Badge, Button, CallButton, Card, CardHeader, Checkbox, EmptyState, Grid, IconTile, Input, KV, Link, Notice, ProgressBar, Row, Select, T, Tabs, Toggle, Touch, useToast, Divider,
} from '../../components/ui';
import { AccountSecurityCard } from '../../components/account';
import { FileRow, PRIORITY, RequestStatusBadge } from '../../components/data';
import { PhotoPicker, RequestPhotos, usePick, useOpenDocument } from '../../components/files';
import { TRANSITION_LABEL, TransitionDialog } from '../../components/requests';
import { ChargesToPay, PaymentLine, ReceiptDialog, isOutstanding } from '../../components/payments';
import { DONE_STATUSES, allowedTransitions, isOpen, newClientKey, type Transition } from '../../lib/workflow';
import { ACCEPT, ID_TYPES, pickDocuments, pickPhotos, uploadFile, type PickedFile } from '../../lib/files';
import { NotificationList } from '../staff/Admin';
import type { Category, MaintenanceRequest, Payment } from '../../types';
import { daysBetween, daysUntil, fmtDate, fmtShort, fmtStamp, greeting, leaseStatus, naira, nairaCompact } from '../../utils';

function useMine() {
  const { state, myTenant } = useStore();
  const lookup = useLookup();
  return useMemo(() => {
    const t = myTenant;
    const unit = lookup.unit(t?.unitId);
    const prop = lookup.property(t?.propertyId);
    const lease = t ? state.leases.find((l) => l.tenantId === t.id && !l.renewedTo && !l.terminated) : undefined;
    const requests = t ? state.requests.filter((r) => r.tenantId === t.id) : [];
    const manager = state.users.find((u) => u.id === prop?.managerId);
    const caretaker = state.users.find((u) => u.role === 'caretaker' && u.propertyIds?.includes(prop?.id ?? ''));
    return { t, unit, prop, lease, requests, manager, caretaker, block: lookup.block(unit?.blockId), location: lookup.location(prop?.locationId) };
  }, [state, myTenant, lookup]);
}

function PendingNotice() {
  const { t, prop, unit } = useMine();
  if (t?.status !== 'pending') return null;
  return (
    <Notice tone="warning" icon={Hourglass} style={{ marginBottom: 16 }} title="Your account is awaiting approval">
      {`Your property manager is confirming your tenancy${prop ? ` at ${prop.short}${unit ? `, Flat ${unit.code}` : ''}` : ''}. You'll get full access to your lease and requests once it's approved.`}
    </Notice>
  );
}

// ---------------------------------------------------------------- Home

export function TenantHomeScreen() {
  const { state } = useStore();
  const [action, setAction] = useState<{ id: string; t: Transition } | null>(null);
  const lookup = useLookup();
  const { navigate } = useRouter();
  const { bp } = useBreakpoint();
  const { t, unit, prop, lease, requests, manager, caretaker, block, location } = useMine();
  if (!t) return null;
  const days = lease ? daysUntil(lease.end) : 0;
  const total = lease ? daysBetween(lease.start, lease.end) : 1;
  const awaiting = requests.find((r) => r.status === 'resolved');
  const open = requests.filter((r) => isOpen(r));
  const paid = lease ? state.payments.find((p) => p.leaseId === lease.id && p.status === 'paid' && p.label.startsWith('Rent')) : undefined;
  const owed = state.payments.filter((p) => p.tenantId === t.id && isOutstanding(p));
  const owedTotal = owed.reduce((sum, p) => sum + p.amount, 0);
  const late = owed.some((p) => p.status === 'overdue' || daysUntil(p.date) < 0);
  const announcements = state.notifications.filter((n) => n.audience === t.id && n.category === 'Announcement').slice(0, 2);
  const recent = requests.slice(0, 3);

  return (
    <Page>
      <PendingNotice />
      <View style={{ backgroundColor: colors.sidebar, borderRadius: radius.xl, padding: bp === 'mobile' ? 20 : 26, marginBottom: 16, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -30, top: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: colors.accent, opacity: 0.07 }} />
        <View style={{ flexDirection: bp === 'mobile' ? 'column' : 'row', justifyContent: 'space-between', alignItems: bp === 'mobile' ? 'flex-start' : 'center', gap: 16 }}>
          <View>
            <T size={13} color={colors.sidebarText}>{greeting()},</T>
            <T size={26} weight="bold" color={colors.white} style={{ letterSpacing: -0.5 }}>{t.name.split(' ')[0]}</T>
            <T size={12.5} color={colors.sidebarMuted} style={{ marginTop: 4 }}>{prop ? `${prop.name} · ${block?.name} · Flat ${unit?.code} · ${location?.name}` : 'Your home will appear here once your tenancy is confirmed.'}</T>
          </View>
          <Row gap={10}>
            <Button title="Report an issue" icon={Plus} variant="accent" onPress={() => navigate('reportIssue')} disabled={t.status !== 'active'} />
            <Button title="View my lease" variant="dark" onPress={() => navigate('myLease')} />
          </Row>
        </View>
      </View>

      {awaiting ? (
        <Notice tone="success" icon={CheckCheck} style={{ marginBottom: 16 }} action={
          <Row gap={8}>
            <Button title="Still a problem" size="sm" variant="secondary" onPress={() => setAction({ id: awaiting.id, t: 'dispute' })} />
            <Button title="Yes, it's fixed" size="sm" onPress={() => setAction({ id: awaiting.id, t: 'confirm' })} />
          </Row>
        }>
          <T size={13} color={colors.text}><T size={13} weight="semibold">Your {awaiting.title.toLowerCase()} request was marked as fixed.</T> Is it working now?</T>
        </Notice>
      ) : null}

      {owed.length ? (
        <Notice tone={late ? 'danger' : 'warning'} style={{ marginBottom: 16 }} action={<Button title="Pay now" size="sm" onPress={() => navigate('myLease')} />}>
          <T size={13} color={colors.text}><T size={13} weight="semibold">{naira(owedTotal)} {late ? 'is overdue' : 'is due'}.</T> {owed.length === 1 ? owed[0].label : `${owed.length} charges`}. You can pay online with a card or bank transfer.</T>
        </Notice>
      ) : null}

      <Grid cols={{ mobile: 1, tablet: 3 }} gap={14}>
        <Card onPress={() => navigate('myLease')}>
          <Row gap={8}><IconTile icon={FileText} tone="primary" size={28} iconSize={14} /><T size={12.5} color={colors.textSoft}>Lease</T></Row>
          {lease ? <>
            <T size={24} weight="bold" style={{ marginTop: 10 }}>{Math.max(0, days)} <T size={13} color={colors.subtext}>days left</T></T>
            <ProgressBar value={Math.min(1, (total - Math.max(0, days)) / total)} style={{ marginTop: 10 }} color={days <= 60 ? colors.vizMaint : colors.primary} />
            <T size={11.5} color={colors.subtext} style={{ marginTop: 6 }}>{fmtDate(lease.start)} – {fmtDate(lease.end)} · Renewal opens {fmtShort(new Date(new Date(lease.end).getTime() - 90 * 86400000).toISOString())}</T>
          </> : <T size={13} color={colors.subtext} style={{ marginTop: 10 }}>No lease yet.</T>}
        </Card>
        <Card onPress={() => navigate('myLease')}>
          <Row gap={8}><IconTile icon={House} tone="accent" size={28} iconSize={14} /><T size={12.5} color={colors.textSoft}>Rent</T></Row>
          {lease ? <>
            <T size={24} weight="bold" style={{ marginTop: 10 }}>{nairaCompact(lease.rent)} <T size={13} color={colors.subtext}>/ year</T></T>
            <Badge label={owed.length ? `${naira(owedTotal)} to pay` : paid ? `Paid to ${fmtDate(lease.end)}` : 'Nothing due'} tone={owed.length ? (late ? 'danger' : 'warning') : 'success'} dot style={{ marginTop: 10 }} />
          </> : <T size={13} color={colors.subtext} style={{ marginTop: 10 }}>—</T>}
        </Card>
        <Card onPress={() => navigate('myRequests')}>
          <Row gap={8}><IconTile icon={Wrench} tone="warning" size={28} iconSize={14} /><T size={12.5} color={colors.textSoft}>My requests</T></Row>
          <T size={24} weight="bold" style={{ marginTop: 10 }}>{open.length + (awaiting ? 1 : 0)} <T size={13} color={colors.subtext}>open</T></T>
          <T size={11.5} color={colors.subtext} style={{ marginTop: 6 }}>{awaiting ? 'Waiting for you to confirm the fix' : open.length ? `${open.length} being worked on` : 'Nothing outstanding'}</T>
        </Card>
      </Grid>
      <View style={{ height: 14 }} />
      <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
        <Card>
          <CardHeader title="Recent requests" right={<Link onPress={() => navigate('myRequests')}>See all</Link>} />
          <View style={{ gap: 12 }}>
            {recent.map((r) => (
              <Touch key={r.id} onPress={() => navigate('myRequests', { id: r.id })} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <IconTile icon={CAT_ICON[r.category] ?? Wrench} tone={r.status === 'closed' ? 'neutral' : 'info'} size={32} iconSize={15} />
                <View style={{ flex: 1 }}><T size={13} weight="semibold" numberOfLines={1}>{r.title}</T><T size={11.5} color={colors.subtext} numberOfLines={1}>{r.id} · Reported {fmtShort(r.createdAt)}{r.vendorId ? ` · ${lookup.vendor(r.vendorId)?.name}` : ''}</T></View>
                {r.status === 'resolved' ? <Badge label="Fixed, please confirm" tone="success" dot /> : <RequestStatusBadge s={r.status} />}
              </Touch>
            ))}
            {!recent.length ? <EmptyState icon={Wrench} title="No requests yet" body="If something in your flat needs fixing, report it here." action={<Button title="Report an issue" size="sm" onPress={() => navigate('reportIssue')} />} /> : null}
          </View>
        </Card>
        <Card>
          <CardHeader title="From management" right={<Link onPress={() => navigate('myNotifications')}>All updates</Link>} />
          <View style={{ gap: 14 }}>
            {announcements.map((a) => (
              <View key={a.id}>
                <Row justify="space-between"><T size={13} weight="semibold" style={{ flex: 1 }}>{a.title.replace(/\.$/, '')}</T><T size={11.5} color={colors.subtext}>{fmtShort(a.at)}</T></Row>
                <T size={12.5} color={colors.subtext} style={{ marginTop: 2 }}>{a.body}</T>
              </View>
            ))}
            {!announcements.length ? <T size={12.5} color={colors.subtext}>No announcements right now.</T> : null}
          </View>
        </Card>
      </Grid>
      <View style={{ height: 14 }} />
      <Card>
        <CardHeader title="Need help?" />
        <Grid cols={{ mobile: 1, tablet: 3 }} gap={14}>
          {manager ? <Row gap={10}><Avatar name={manager.name} size={34} /><View style={{ flex: 1 }}><T size={13} weight="semibold">{manager.name}</T><T size={11.5} color={colors.subtext}>Your property manager</T><T size={11.5} color={colors.subtext}>{manager.phone}</T></View><CallButton phone={manager.phone} name={manager.name} compact /></Row> : null}
          {caretaker ? <Row gap={10}><Avatar name={caretaker.name} size={34} tone={[colors.primarySoft, colors.primary]} /><View style={{ flex: 1 }}><T size={13} weight="semibold">{caretaker.name}</T><T size={11.5} color={colors.subtext}>Caretaker</T><T size={11.5} color={colors.subtext}>{caretaker.phone}</T></View><CallButton phone={caretaker.phone} name={caretaker.name} compact /></Row> : null}
          {state.settings.phone ? <Row gap={10}><IconTile icon={Siren} tone="danger" size={34} /><View style={{ flex: 1 }}><T size={13} weight="semibold">Management office</T><T size={11.5} color={colors.subtext}>Fire, gas, flooding or security: call now</T><T size={11.5} weight="semibold" color={colors.danger}>{state.settings.phone}</T></View><CallButton phone={state.settings.phone} name="the management office" compact /></Row> : null}
        </Grid>
      </Card>
      {action && requests.find((r) => r.id === action.id) ? <TransitionDialog request={requests.find((r) => r.id === action.id)!} transition={action.t} onClose={() => setAction(null)} actorIsTenant /> : null}
    </Page>
  );
}

// ---------------------------------------------------------------- My lease

export function MyLeaseScreen() {
  const { state, setTenantIntent } = useStore();
  const toast = useToast();
  const openDoc = useOpenDocument();
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const { t, unit, prop, lease, manager } = useMine();
  if (!t) return null;
  if (!lease || lease.draft) return <Page><PageHeader crumbs={[{ label: 'Home', to: 'home' }, { label: 'My Lease' }]} title="My lease" /><PendingNotice /><Card><EmptyState icon={FileText} title="No lease yet" body="Your lease appears here once your property manager approves your tenancy." /></Card></Page>;
  const days = daysUntil(lease.end);
  const total = daysBetween(lease.start, lease.end);
  const payments = state.payments.filter((p) => p.tenantId === t.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const docs = state.documents.filter((d) => d.tenantId === t.id && (d.folder === 'Lease agreements' || d.folder === 'Receipts' || d.folder === 'Property papers'));
  const offerDate = new Date(new Date(lease.end).getTime() - 90 * 86400000).toISOString();
  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Home', to: 'home' }, { label: 'My Lease' }]} title="My lease" badge={<Badge label={leaseStatus(lease) === 'expiring' ? 'Expiring soon' : leaseStatus(lease) === 'expired' ? 'Expired' : 'Active'} tone={leaseStatus(lease) === 'active' ? 'success' : leaseStatus(lease) === 'expired' ? 'danger' : 'warning'} dot />}
        actions={(() => {
          const signed = state.documents.find((d) => d.storagePath && d.storagePath === lease.agreement);
          return signed ? <Button title="Download signed lease" icon={Download} variant="secondary" onPress={() => openDoc(signed, true)} /> : undefined;
        })()} />
      <ChargesToPay style={{ marginBottom: 16 }} />
      <Grid cols={{ mobile: 1, desktop: 3 }} spans={[{ mobile: 1, desktop: 2 }, 1]}>
        <View style={{ gap: 16 }}>
          <Card>
            <CardHeader title="Lease summary" right={<T mono size={12} color={colors.subtext}>{lease.id}</T>} />
            <Row justify="space-between"><T size={12} color={colors.subtext}>{fmtDate(lease.start)} start</T><T size={12} weight="semibold" color={colors.primary}>{Math.max(0, days)} days left</T><T size={12} color={colors.subtext}>end {fmtDate(lease.end)}</T></Row>
            <ProgressBar value={Math.min(1, (total - Math.max(0, days)) / total)} style={{ marginVertical: 10 }} height={8} />
            <Grid cols={{ mobile: 2, tablet: 3 }} gap={16} style={{ marginTop: 6 }}>
              <KV label="Home" value={`${prop?.name}, ${unit?.code}`} /><KV label="Type" value={`${unit?.type.replace(' Bedroom', '-bedroom')} flat`} /><KV label="Term" value={`${lease.termMonths} months`} />
              <KV label="Annual rent" value={naira(lease.rent)} /><KV label="Service charge" value={`${naira(lease.serviceCharge)} / year`} /><KV label="Caution deposit" value={`${naira(lease.deposit)} (held)`} />
              <KV label="Payment cycle" value={lease.paymentCycle} /><KV label="Landlord" value={state.settings.orgName} /><KV label="Manager" value={manager?.name ?? '—'} />
            </Grid>
          </Card>
          <Card>
            <CardHeader title="Key terms" />
            <View style={{ gap: 10 }}>
              {[`Give at least ${lease.noticeMonths} months' notice if you will not renew.`, 'Report repairs through this portal. Emergencies go to the 24-hour line.', 'No structural changes to the flat without written approval.', 'Deposit is returned within 30 days of move-out, less agreed repair costs.'].map((k) => (
                <Row key={k} gap={10} align="flex-start"><Check size={15} color={colors.primary} style={{ marginTop: 2 }} /><T size={13} color={colors.textSoft} style={{ flex: 1 }}>{k}</T></Row>
              ))}
            </View>
          </Card>
          <Card>
            <CardHeader title="Documents" />
            <View style={{ gap: 8 }}>
              {docs.slice(0, 5).map((d) => <FileRow key={d.id} name={d.name} kind={d.kind} meta={`${fmtDate(d.date)} · ${(d.sizeKb / 1024).toFixed(1)} MB`} onPress={() => openDoc(d)} right={<Button title="Download" size="sm" variant="secondary" onPress={() => openDoc(d, true)} />} />)}
              {!docs.length ? <T size={12.5} color={colors.subtext}>Your signed lease appears here once your manager uploads it.</T> : null}
            </View>
          </Card>
        </View>
        <View style={{ gap: 16 }}>
          <Card>
            <CardHeader title="Renewal" />
            {lease.tenantIntent ? (
              <Notice tone={lease.tenantIntent === 'renew' ? 'success' : 'warning'}>{lease.tenantIntent === 'renew' ? 'You told us you plan to renew. Your manager will send the new agreement here.' : `You told us you plan to move out on ${fmtDate(lease.end)}. Your manager will arrange the move-out inspection.`}</Notice>
            ) : (
              <Notice tone="info" icon={Info}>{days > 90 ? `Your renewal offer will arrive by ${fmtDate(offerDate)}. You can tell us your plans now.` : 'Your renewal window is open. Let your manager know your plans.'}</Notice>
            )}
            <View style={{ gap: 8, marginTop: 12 }}>
              <Button title="I plan to renew" variant="soft" onPress={() => { setTenantIntent(lease.id, 'renew'); toast('Thanks — your manager has been told you plan to renew'); }} />
              <Button title="I plan to move out" variant="secondary" onPress={() => { setTenantIntent(lease.id, 'move_out'); toast('Your notice has been sent to your manager'); }} />
            </View>
          </Card>
          <Card>
            <CardHeader title="Payment history" />
            <View style={{ gap: 12 }}>
              {payments.filter((p) => p.status === 'paid').map((p) => <PaymentLine key={p.id} p={p} onReceipt={setReceipt} />)}
              {!payments.some((p) => p.status === 'paid') ? <T size={12.5} color={colors.subtext}>No payments yet.</T> : null}
            </View>
          </Card>
        </View>
      </Grid>
      <ReceiptDialog payment={receipt} onClose={() => setReceipt(null)} />
    </Page>
  );
}

// ---------------------------------------------------------------- My requests

const CAT_ICON: Partial<Record<Category, LucideIcon>> = { Plumbing: Droplet, Electrical: Zap, 'Air conditioning': Snowflake, Generator: Fan, 'Water supply': Droplet, 'Building repairs': Hammer, Security: Shield, Cleaning: Sparkles, Pests: Bug, Other: Wrench };

export function MyRequestsScreen() {
  const { me, addComment } = useStore();
  const [action, setAction] = useState<Transition | null>(null);
  const lookup = useLookup();
  const { navigate, route } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const { t, requests } = useMine();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const openList = requests.filter((r) => !DONE_STATUSES.includes(r.status));
  const closed = requests.filter((r) => DONE_STATUSES.includes(r.status));
  const list = tab === 'open' ? openList : closed;
  const [selId, setSelId] = useState<string | undefined>(route.params.id ?? openList[0]?.id ?? requests[0]?.id);
  const [msg, setMsg] = useState('');
  const [photoVersion, setPhotoVersion] = useState(0);
  const [attaching, setAttaching] = useState(false);
  const pick = usePick();
  const sel = requests.find((r) => r.id === selId);
  const attachPhoto = async (requestId: string) => {
    const [f] = await pick(() => pickPhotos('library'), 'maintenance-photos', ACCEPT.images);
    if (!f) return;
    setAttaching(true);
    try {
      await uploadFile('maintenance-photos', requestId, f);
      addComment(requestId, 'Added a photo', true);
      setPhotoVersion((v) => v + 1);
      toast('Photo added to your request');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setAttaching(false);
    }
  };
  if (!t) return null;
  const steps = ['Received', 'Vendor assigned', 'Being fixed', 'You confirm', 'Closed'];
  const stepIdx = (r: MaintenanceRequest) => ({ new: 0, cancelled: 0, assigned: 1, in_progress: 2, resolved: 3, disputed: 3, closed: 4 })[r.status];
  const statusFor = (r: MaintenanceRequest) => (r.status === 'resolved' ? <Badge label="Fixed" tone="success" dot /> : <RequestStatusBadge s={r.status} />);
  const can = sel ? allowedTransitions(sel, me, t.id) : [];
  const assignee = sel ? [lookup.vendor(sel.vendorId)?.name, lookup.user(sel.caretakerId)?.name].filter(Boolean).join(' and ') : '';
  const shared = sel ? sel.events.filter((e) => !e.internal).slice().reverse() : [];

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Home', to: 'home' }, { label: 'My Requests' }]} title="My requests" badge={<LiveTag />} actions={t.status === 'active' ? <Button title="Report an issue" icon={Plus} onPress={() => navigate('reportIssue')} /> : undefined} />
      <PendingNotice />
      <View style={{ flexDirection: bp === 'mobile' ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>
        <Card pad={0} style={{ width: bp === 'mobile' ? '100%' : 320 }}>
          <View style={{ paddingHorizontal: 14 }}><Tabs value={tab} onChange={setTab} tabs={[{ value: 'open', label: 'Open', count: openList.length }, { value: 'closed', label: 'Closed', count: closed.length }]} style={{ borderBottomWidth: 0 }} /></View>
          {list.map((r) => (
            <Touch key={r.id} onPress={() => setSelId(r.id)} style={{ padding: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: r.id === selId ? colors.primaryTint : colors.card, borderLeftWidth: 3, borderLeftColor: r.id === selId ? colors.primary : 'transparent' }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
              <Row justify="space-between" gap={8}><T size={13} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>{r.title}</T>{statusFor(r)}</Row>
              <T size={11.5} color={colors.subtext} style={{ marginTop: 3 }}>{r.id} · {r.category} · {fmtShort(r.createdAt)}</T>
            </Touch>
          ))}
          {!list.length ? <EmptyState icon={Wrench} title={tab === 'open' ? 'No open requests' : 'No closed requests'} /> : null}
        </Card>
        {sel ? (
          <Card style={{ flex: 1, width: '100%' }}>
            <Row justify="space-between" wrap gap={8}>
              <View style={{ flex: 1 }}>
                <Row gap={8} wrap><T size={18} weight="bold">{sel.title}</T><Badge label={PRIORITY[sel.priority].label} tone={PRIORITY[sel.priority].tone} dot={sel.priority !== 'urgent'} /></Row>
                <T size={12} color={colors.subtext} style={{ marginTop: 2 }}>{sel.id} · {sel.category} · {sel.where}</T>
              </View>
              {sel.status === 'resolved' ? <Badge label="Fixed, please confirm" tone="success" dot /> : statusFor(sel)}
            </Row>
            <Row gap={6} style={{ marginVertical: 18 }} wrap={bp === 'mobile'}>
              {steps.map((s, i) => {
                const idx = stepIdx(sel);
                const done = i < idx || sel.status === 'closed', cur = i === idx && !DONE_STATUSES.includes(sel.status);
                return (
                  <React.Fragment key={s}>
                    <Row gap={6}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: done ? colors.primary : colors.card, borderWidth: cur ? 2 : 1, borderColor: done || cur ? colors.primary : colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>{done ? <Check size={12} color={colors.white} strokeWidth={3} /> : <T size={11} weight="bold" color={cur ? colors.primary : colors.subtext}>{i + 1}</T>}</View>
                      {bp !== 'mobile' || cur ? <T size={11.5} weight={cur ? 'semibold' : 'medium'} color={done || cur ? colors.text : colors.subtext}>{s}</T> : null}
                    </Row>
                    {i < steps.length - 1 ? <View style={{ flex: 1, minWidth: 6, height: 2, backgroundColor: done ? colors.primary : colors.border }} /> : null}
                  </React.Fragment>
                );
              })}
            </Row>
            {can.includes('confirm') ? (
              <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 18 }}>
                <T size={13.5} weight="semibold">Is the {sel.title.toLowerCase()} sorted?</T>
                <T size={12.5} color={colors.subtext} style={{ marginTop: 3 }}>The request stays open until you tell us.</T>
                <Row gap={8} style={{ marginTop: 12 }} wrap>
                  <Button title={TRANSITION_LABEL.confirm} onPress={() => setAction('confirm')} />
                  <Button title={TRANSITION_LABEL.dispute} variant="secondary" onPress={() => setAction('dispute')} />
                </Row>
              </View>
            ) : null}
            {sel.status === 'disputed' ? <Notice tone="warning" style={{ marginBottom: 16 }} title="You said it’s still a problem">{`${sel.disputeReason ?? ''} Your manager has been told and will arrange another visit.`.trim()}</Notice> : null}
            {sel.visit && assignee && (sel.status === 'assigned' || sel.status === 'in_progress') ? <Notice tone="info" icon={Clock} style={{ marginBottom: 16 }}>{`${assignee} ${assignee.includes(' and ') ? 'are' : 'is'} booked for ${fmtDate(sel.visit.date)}, ${sel.visit.window}.`}</Notice> : null}
            {can.includes('cancel') ? <Row style={{ marginBottom: 12 }}><Button title="Cancel this request" size="sm" variant="ghost" onPress={() => setAction('cancel')} /></Row> : null}
            <RequestPhotos requestId={sel.id} title="Your photos" version={photoVersion} />
            <RequestPhotos requestId={sel.id} title="Photos of the finished work" completion version={sel.status === 'resolved' ? 1 : 0} />
            <T size={12.5} weight="semibold" color={colors.textSoft} style={{ marginBottom: 10, marginTop: 16 }}>Updates</T>
            {shared.map((e, i) => (
              <Row key={e.id} gap={12} align="flex-start">
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: i === 0 ? colors.primary : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Check size={11} color={i === 0 ? colors.white : colors.primary} strokeWidth={3} /></View>
                  {i < shared.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 16, backgroundColor: colors.border }} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 14 }}>
                  <T size={13} weight="semibold">{e.kind === 'created' ? 'You reported this issue' : e.text}</T>
                  <T size={11.5} color={colors.subtext}>{fmtStamp(e.at)}{e.kind === 'created' ? ` · “${sel.description.slice(0, 80)}${sel.description.length > 80 ? '…' : ''}”` : ` · ${e.by}`}</T>
                </View>
              </Row>
            ))}
            {!DONE_STATUSES.includes(sel.status) ? (
              <View style={{ marginTop: 6, gap: 10 }}>
                <T size={12.5} weight="semibold" color={colors.textSoft}>Message your manager</T>
                <Input value={msg} onChangeText={setMsg} multiline placeholder="Add a note or ask a question..." />
                <Row justify="space-between">
                  <Button title={attaching ? 'Uploading…' : 'Attach photo'} icon={Paperclip} size="sm" variant="ghost" disabled={attaching} onPress={() => void attachPhoto(sel.id)} />
                  <Button title="Send" icon={Send} size="sm" disabled={!msg.trim()} onPress={() => { addComment(sel.id, msg.trim(), true); setMsg(''); toast('Message sent to your manager'); }} />
                </Row>
              </View>
            ) : sel.rating ? <Row gap={4} style={{ marginTop: 6 }}><T size={12.5} color={colors.subtext}>You rated this repair</T>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} color={colors.accent} fill={n <= (sel.rating ?? 0) ? colors.accent : 'transparent'} />)}</Row> : null}
          </Card>
        ) : <Card style={{ flex: 1, width: '100%' }}><EmptyState icon={Wrench} title="Select a request" body="Pick a request to see its progress." /></Card>}
      </View>
      {sel ? <TransitionDialog request={sel} transition={action} onClose={() => setAction(null)} actorIsTenant /> : null}
    </Page>
  );
}

// ---------------------------------------------------------------- Report an issue

const ISSUE_CATS: { c: Category; icon: LucideIcon }[] = [
  { c: 'Plumbing', icon: Droplet }, { c: 'Electrical', icon: Zap }, { c: 'Air conditioning', icon: Snowflake }, { c: 'Generator', icon: Fan }, { c: 'Water supply', icon: Droplet },
  { c: 'Building repairs', icon: Hammer }, { c: 'Security', icon: Shield }, { c: 'Cleaning', icon: Sparkles }, { c: 'Pests', icon: Bug }, { c: 'Other', icon: CircleHelp },
];

export function ReportIssueScreen() {
  const { state, createRequest } = useStore();
  const { navigate, back } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const { t, prop, unit, manager } = useMine();
  const [cat, setCat] = useState<Category | null>(null);
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'urgent'>('medium');
  const [where, setWhere] = useState('Kitchen');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [photos, setPhotos] = useState<PickedFile[]>([]);
  const [sending, setSending] = useState(false);
  const [clientKey] = useState(newClientKey); // a retried submit returns the same request
  const [caretaker, setCaretaker] = useState(false);
  const [times, setTimes] = useState('Weekdays after 5pm, Saturday any time');
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!t) return null;
  if (t.status !== 'active') return <Page><PageHeader crumbs={[{ label: 'Home', to: 'home' }, { label: 'Report an issue' }]} title="Report an issue" /><PendingNotice /></Page>;

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!cat) e.cat = 'Choose what the problem is.';
    if (!title.trim()) e.title = 'Give it a short title.';
    if (desc.trim().length < 10) e.desc = 'Tell us a little more so the repairer comes prepared.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSending(true);
    try {
      const id = await createRequest({ tenantId: t.id, category: cat!, title: title.trim(), description: desc.trim(), where, urgency, photos, caretakerAccess: caretaker, access: times, clientKey });
      toast(`Request ${id} sent to your manager`);
      navigate('myRequests', { id });
    } catch (e) {
      setSending(false);
      toast(`Couldn’t send your request: ${e instanceof Error ? e.message : e}`, 'danger');
    }
  };

  const section = (n: number, label: string) => <T size={13} weight="semibold" style={{ marginBottom: 10 }}>{n}. {label}</T>;
  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Home', to: 'home' }, { label: 'Report an issue' }]} title="Report an issue" subtitle={`${prop?.name}, Flat ${unit?.code}. Your property manager is notified straight away.`} />
      <View style={{ flexDirection: bp === 'desktop' ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ flex: 1, width: '100%' }}>
          {section(1, "What's the problem?")}
          <Grid cols={{ mobile: 3, tablet: 5 }} gap={10}>
            {ISSUE_CATS.map(({ c, icon: Icon }) => {
              const on = cat === c;
              return (
                <Touch key={c} onPress={() => setCat(c)} style={{ borderWidth: on ? 1.5 : 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primaryTint : colors.card, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', gap: 6 }} hoverStyle={{ borderColor: on ? colors.primary : colors.borderStrong }}>
                  <Icon size={19} color={on ? colors.primary : colors.textSoft} />
                  <T size={11.5} weight={on ? 'semibold' : 'medium'} color={on ? colors.primary : colors.textSoft} center>{c}</T>
                </Touch>
              );
            })}
          </Grid>
          {errors.cat ? <T size={11.5} color={colors.danger} style={{ marginTop: 6 }}>{errors.cat}</T> : null}
          <View style={{ height: 22 }} />
          {section(2, 'How urgent is it?')}
          <Grid cols={{ mobile: 1, tablet: 3 }} gap={10}>
            {([['low', 'Can wait', 'Fix within a few days'], ['medium', 'Soon', 'Affecting daily life'], ['urgent', 'Emergency', 'Danger or serious damage']] as const).map(([k, l, s]) => (
              <Touch key={k} onPress={() => setUrgency(k)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: urgency === k ? 1.5 : 1, borderColor: urgency === k ? (k === 'urgent' ? colors.danger : colors.primary) : colors.border, backgroundColor: urgency === k ? (k === 'urgent' ? colors.dangerSoft : colors.primaryTint) : colors.card, borderRadius: radius.md, padding: 12 }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: urgency === k ? (k === 'urgent' ? colors.danger : colors.primary) : colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>{urgency === k ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k === 'urgent' ? colors.danger : colors.primary }} /> : null}</View>
                <View><T size={13} weight="semibold">{l}</T><T size={11.5} color={colors.subtext}>{s}</T></View>
              </Touch>
            ))}
          </Grid>
          <View style={{ height: 22 }} />
          {section(3, 'Tell us more')}
          <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
            <Select label="Where in the flat?" value={where} onChange={setWhere} options={['Kitchen', 'Bathroom', 'Bedroom', 'Living room', 'Balcony', 'Whole flat', 'Common area'].map((x) => ({ value: x, label: x }))} />
            <Input label="Short title" value={title} onChangeText={setTitle} placeholder="e.g. Kitchen socket not working" error={errors.title} />
          </Grid>
          <Input fieldStyle={{ marginTop: 14 }} label="Description" value={desc} onChangeText={setDesc} multiline placeholder="The double socket beside the fridge stopped working this morning. Other sockets in the kitchen are fine." error={errors.desc} />
          <View style={{ height: 22 }} />
          {section(4, 'Add photos (optional, up to 5)')}
          <PhotoPicker photos={photos} onChange={setPhotos} />
          <View style={{ height: 22 }} />
          {section(5, 'Access')}
          <Checkbox checked={caretaker} onChange={setCaretaker} label="The caretaker can let the repairer in if I'm not home" />
          <Input fieldStyle={{ marginTop: 12 }} label="Best times to visit" value={times} onChangeText={setTimes} />
          <Row justify="space-between" style={{ marginTop: 22 }}>
            <Button title="Cancel" variant="ghost" onPress={() => back('home')} />
            <Button title={sending ? (photos.length ? 'Uploading photos…' : 'Sending…') : 'Submit request'} onPress={submit} size="lg" loading={sending} disabled={sending} />
          </Row>
        </Card>
        <View style={{ width: bp === 'desktop' ? 300 : '100%', gap: 14 }}>
          <Notice tone="danger" icon={Flame} title="Smell gas, see sparks or flooding?">{`Leave the flat if unsafe and call the management office${state.settings.phone ? `: ${state.settings.phone}` : ''}.`}</Notice>
          <Card>
            <CardHeader title="What happens next" />
            {[[`${manager?.name.split(' ')[0] ?? 'Your manager'} reviews your request`, 'Usually within 4 hours'], ['A repairer is booked', "We'll tell you who and when"], ["You confirm it's fixed", 'Then we close the request']].map(([a, b], i) => (
              <Row key={a} gap={10} align="flex-start" style={{ marginBottom: 12 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><T size={10.5} weight="bold" color={colors.primary}>{i + 1}</T></View>
                <View style={{ flex: 1 }}><T size={12.5} weight="semibold">{a}</T><T size={11.5} color={colors.subtext}>{b}</T></View>
              </Row>
            ))}
          </Card>
        </View>
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------- Notifications

export function TenantNotificationsScreen() {
  const { state, markNotificationRead, markAllNotificationsRead } = useStore();
  const { navigate } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const { t } = useMine();
  const [tab, setTab] = useState('all');
  if (!t) return null;
  const all = state.notifications.filter((n) => n.audience === t.id).sort((a, b) => (a.at < b.at ? 1 : -1));
  const unread = all.filter((n) => !n.read).length;
  const rows = tab === 'all' ? all : tab === 'requests' ? all.filter((n) => n.category === 'My requests') : tab === 'announcements' ? all.filter((n) => n.category === 'Announcement') : all.filter((n) => n.category === 'Leases');
  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Home', to: 'home' }, { label: 'Notifications' }]} title="Notifications" actions={<Button title="Mark all as read" icon={CheckCheck} variant="secondary" onPress={() => { markAllNotificationsRead(t.id); toast('All caught up'); }} />} />
      <View style={{ flexDirection: bp === 'desktop' ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <Card pad={0} style={{ flex: 1, width: '100%' }}>
          <View style={{ paddingHorizontal: 16 }}><Tabs value={tab} onChange={setTab} style={{ borderBottomWidth: 0 }} tabs={[{ value: 'all', label: 'All', count: `${unread} unread` }, { value: 'requests', label: 'My requests' }, { value: 'announcements', label: 'Announcements' }, { value: 'lease', label: 'Lease' }]} /></View>
          <NotificationList items={rows} onOpen={(n) => { markNotificationRead(n.id); if (n.link) navigate(n.link.name, n.link.params); }} />
        </Card>
        <Card style={{ width: bp === 'desktop' ? 320 : '100%' }}>
          <CardHeader title="How we reach you" subtitle="Emergencies always come by SMS and call." />
          <View style={{ gap: 12 }}>
            <Row justify="space-between"><T size={13} weight="semibold">Request updates</T><Row gap={4}><Badge label="App" size="sm" />{t.prefs.smsUpdates ? <Badge label="SMS" size="sm" /> : null}</Row></Row>
            <Row justify="space-between"><T size={13} weight="semibold">Announcements</T><Row gap={4}><Badge label="App" size="sm" />{t.prefs.emailAnnouncements ? <Badge label="Email" size="sm" /> : null}</Row></Row>
            <Row justify="space-between"><T size={13} weight="semibold">Lease and rent</T><Row gap={4}><Badge label="Email" size="sm" /><Badge label="SMS" size="sm" /></Row></Row>
          </View>
          <Link size={12.5} onPress={() => navigate('profile')}>Change preferences</Link>
        </Card>
      </View>

    </Page>
  );
}

// ---------------------------------------------------------------- Profile

export function TenantProfileSelfScreen() {
  const { updateTenant } = useStore();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const { t, prop, unit, lease } = useMine();
  const initial = () => ({
    email: t?.email ?? '', phone: t?.phone ?? '', whatsapp: t?.whatsapp ?? t?.phone ?? '', language: t?.language ?? 'English',
    kinName: t?.nextOfKin.name ?? '', kinRel: t?.nextOfKin.relationship ?? '', kinPhone: t?.nextOfKin.phone ?? '',
    smsUpdates: t?.prefs.smsUpdates ?? true, emailAnnouncements: t?.prefs.emailAnnouncements ?? true, whatsappPref: t?.prefs.whatsapp ?? false,
  });
  const [f, setF] = useState(initial);
  const [base, setBase] = useState(initial);
  if (!t) return null;
  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  const save = () => {
    updateTenant(t.id, { email: f.email, phone: f.phone, whatsapp: f.whatsapp, language: f.language, nextOfKin: { ...t.nextOfKin, name: f.kinName, relationship: f.kinRel, phone: f.kinPhone }, prefs: { smsUpdates: f.smsUpdates, emailAnnouncements: f.emailAnnouncements, whatsapp: f.whatsappPref } });
    setBase(f);
    toast('Profile saved');
  };
  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Home', to: 'home' }, { label: 'Profile' }]} title="Profile" actions={<><Button title="Cancel" variant="secondary" disabled={!dirty} onPress={() => setF(base)} /><Button title="Save changes" disabled={!dirty} onPress={save} /></>} />
      <View style={{ flexDirection: bp === 'desktop' ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ width: bp === 'desktop' ? 280 : '100%', alignItems: 'center' }}>
          <Avatar name={t.name} size={72} tone={[colors.accent, colors.sidebar]} />
          <T size={16} weight="semibold" style={{ marginTop: 12 }}>{t.name}</T>
          <T size={12} color={colors.subtext}>Tenant since {fmtDate(t.joinedAt).split(' ').slice(1).join(' ')} · {t.code}</T>
          <Badge label={t.identification.verified ? 'Verified' : 'Pending verification'} tone={t.identification.verified ? 'success' : 'warning'} dot style={{ alignSelf: 'center', marginTop: 8 }} />
          <Button title="Change photo" size="sm" variant="secondary" style={{ marginTop: 12 }} onPress={() => toast('Photo updated')} />
          <Divider style={{ alignSelf: 'stretch', marginVertical: 16 }} />
          <View style={{ alignSelf: 'stretch', gap: 8 }}>
            <Row justify="space-between"><T size={12.5} color={colors.subtext}>Home</T><T size={12.5} weight="semibold">{prop ? `${prop.short}, ${unit?.code}` : '—'}</T></Row>
            <Row justify="space-between"><T size={12.5} color={colors.subtext}>Lease</T><T size={12.5} weight="semibold">{lease?.id ?? '—'}</T></Row>
            <Row justify="space-between"><T size={12.5} color={colors.subtext}>Ends</T><T size={12.5} weight="semibold">{lease ? fmtDate(lease.end) : '—'}</T></Row>
          </View>
        </Card>
        <View style={{ flex: 1, gap: 16, width: '100%' }}>
          <Card>
            <CardHeader title="Contact details" />
            <Grid cols={{ mobile: 1, tablet: 2 }} gap={14}>
              <Input label="Email" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} autoCapitalize="none" />
              <Input label="Phone" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} hint="Verified. Changing it needs a new code." />
              <Input label="WhatsApp" optional value={f.whatsapp} onChangeText={(v) => setF({ ...f, whatsapp: v })} />
              <Select label="Preferred language" value={f.language} onChange={(v) => setF({ ...f, language: v })} options={['English', 'Yoruba', 'Igbo', 'Hausa', 'Pidgin'].map((x) => ({ value: x, label: x }))} />
            </Grid>
          </Card>
          <Card>
            <CardHeader title="Next of kin" />
            <Grid cols={{ mobile: 1, tablet: 3 }} gap={14}>
              <Input label="Name" value={f.kinName} onChangeText={(v) => setF({ ...f, kinName: v })} />
              <Input label="Relationship" value={f.kinRel} onChangeText={(v) => setF({ ...f, kinRel: v })} />
              <Input label="Phone" value={f.kinPhone} onChangeText={(v) => setF({ ...f, kinPhone: v })} />
            </Grid>
          </Card>
          <Card>
            <CardHeader title="Notifications" />
            <View style={{ gap: 14 }}>
              <Row justify="space-between" gap={12}><View style={{ flex: 1 }}><T size={13} weight="semibold">Updates on my requests by SMS</T><T size={11.5} color={colors.subtext}>When a repairer is booked or the job is done</T></View><Toggle value={f.smsUpdates} onChange={(v) => setF({ ...f, smsUpdates: v })} /></Row>
              <Row justify="space-between" gap={12}><View style={{ flex: 1 }}><T size={13} weight="semibold">Announcements by email</T><T size={11.5} color={colors.subtext}>Estate news, water and power schedules</T></View><Toggle value={f.emailAnnouncements} onChange={(v) => setF({ ...f, emailAnnouncements: v })} /></Row>
              <Row justify="space-between" gap={12}><View style={{ flex: 1 }}><T size={13} weight="semibold">WhatsApp messages</T><T size={11.5} color={colors.subtext}>Get everything on WhatsApp as well</T></View><Toggle value={f.whatsappPref} onChange={(v) => setF({ ...f, whatsappPref: v })} /></Row>
            </View>
          </Card>
          <AccountSecurityCard />
        </View>
      </View>

    </Page>
  );
}

// ---------------------------------------------------------------- Documents

export function TenantDocumentsScreen() {
  const { state, addDocument } = useStore();
  const toast = useToast();
  const openDoc = useOpenDocument();
  const pick = usePick();
  const { t, prop, unit } = useMine();
  const [uploading, setUploading] = useState(false);
  if (!t) return null;
  const canUpload = state.settings.selfDocs;
  const idRequested = !t.identification.verified && state.notifications.some((n) => n.audience === t.id && n.title === 'Please upload a new ID.');
  const uploadId = async (source: 'files' | 'camera') => {
    const [f] = await pick(() => (source === 'camera' ? pickPhotos('camera') : pickDocuments(ID_TYPES)), 'documents', ID_TYPES);
    if (!f) return;
    setUploading(true);
    try {
      const ext = f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.')) : '';
      await addDocument({ name: `${t.identification.type.split(' (')[0] || 'ID'} – ${t.name}${ext}`, folder: 'Tenant ID and KYC', linkedTo: `${prop?.short ?? ''} · ${unit?.code ?? ''}`, tenantId: t.id, propertyId: t.propertyId }, f);
      toast('ID uploaded. Your manager will review it.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setUploading(false);
    }
  };
  const docs = state.documents.filter((d) => d.tenantId === t.id || (d.propertyId === t.propertyId && d.folder === 'Property papers' && d.name.startsWith('Estate rules')));
  const groups = ['Lease agreements', 'Receipts', 'Tenant ID and KYC', 'Property papers', 'Maintenance'] as const;
  return (
    <Page maxWidth={1000}>
      <PageHeader crumbs={[{ label: 'Home', to: 'home' }, { label: 'Documents' }]} title="Documents" subtitle="Your lease, receipts and estate papers in one place."
        actions={canUpload ? <Button title={uploading ? 'Uploading…' : 'Upload ID'} icon={Upload} variant="secondary" loading={uploading} disabled={uploading} onPress={() => void uploadId('files')} /> : undefined} />
      {idRequested ? (
        <Notice tone="warning" title="Your manager asked for a new ID" style={{ marginBottom: 14 }}
          action={canUpload ? <Row gap={8} wrap><Button title="Choose file" size="sm" disabled={uploading} onPress={() => void uploadId('files')} />{Platform.OS !== 'web' ? <Button title="Take photo" size="sm" variant="secondary" disabled={uploading} onPress={() => void uploadId('camera')} /> : null}</Row> : undefined}>
          {canUpload ? 'Upload a clear photo or scan of a valid ID. Check your notifications for the reason.' : 'Send the new ID to your property manager. Uploads from the portal are switched off.'}
        </Notice>
      ) : null}
      {groups.map((g) => {
        const list = docs.filter((d) => d.folder === g);
        if (!list.length) return null;
        return (
          <Card key={g} style={{ marginBottom: 14 }}>
            <CardHeader title={g === 'Tenant ID and KYC' ? 'My identification' : g === 'Property papers' ? 'Estate documents' : g} />
            <View style={{ gap: 8 }}>{list.map((d) => <FileRow key={d.id} name={d.name} kind={d.kind} meta={`${fmtDate(d.date)} · ${(d.sizeKb / 1024).toFixed(1)} MB`} onPress={() => openDoc(d)} right={<Button title="Download" size="sm" variant="secondary" onPress={() => openDoc(d, true)} />} />)}</View>
          </Card>
        );
      })}
      {!docs.length ? <Card><EmptyState icon={FileText} title="No documents yet" body="Your lease and receipts will appear here." /></Card> : null}
    </Page>
  );
}

export { Building2, Phone, TriangleAlert, Megaphone, CircleCheck };
