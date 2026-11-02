/** The caretaker's phone screens: the day's jobs and who to call at each property. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Building2, ClipboardList, Clock, KeyRound, MapPin } from 'lucide-react-native';
import { colors } from '../../theme';
import { useLookup, useScope, useStore } from '../../store/AppContext';
import { useRouter } from '../../nav/router';
import { LiveTag, Page, PageHeader } from '../../components/shell';
import { Avatar, Button, CallButton, Card, CardHeader, EmptyState, Grid, Notice, Row, T } from '../../components/ui';
import { PriorityBadge, RequestStatusBadge } from '../../components/data';
import { TRANSITION_LABEL, TransitionDialog } from '../../components/requests';
import { allowedTransitions, type Transition } from '../../lib/workflow';
import type { MaintenanceRequest, Priority } from '../../types';
import { fmtShort, greeting, todayISO, toISODate } from '../../utils';

const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const byUrgency = (a: MaintenanceRequest, b: MaintenanceRequest) =>
  PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.visit?.date ?? '').localeCompare(b.visit?.date ?? '') || a.createdAt.localeCompare(b.createdAt);

// ---------------------------------------------------------------- Today's jobs

export function JobsScreen() {
  const { me } = useStore();
  const scope = useScope();
  const [action, setAction] = useState<{ id: string; t: Transition } | null>(null);
  if (!me) return null;
  const today = todayISO();
  const mine = scope.requests.filter((r) => r.caretakerId === me.id);
  const due = (r: MaintenanceRequest) => (r.visit?.date ?? today) <= today;
  const working = mine.filter((r) => r.status === 'in_progress').sort(byUrgency);
  const dueToday = mine.filter((r) => r.status === 'assigned' && due(r)).sort(byUrgency);
  const upcoming = mine.filter((r) => r.status === 'assigned' && !due(r)).sort(byUrgency);
  const disputed = mine.filter((r) => r.status === 'disputed');
  const waiting = mine.filter((r) => r.status === 'resolved');
  const fixedToday = mine.filter((r) => r.resolvedAt && toISODate(new Date(r.resolvedAt)) === today).length;
  const unassigned = scope.requests.filter((r) => r.status === 'new' && !r.caretakerId).length;
  const actionFor = action ? mine.find((r) => r.id === action.id) : undefined;
  const nothing = !working.length && !dueToday.length && !upcoming.length && !disputed.length && !waiting.length;

  const section = (title: string, list: MaintenanceRequest[], hint?: string) => list.length ? (
    <View style={{ marginBottom: 18 }}>
      <Row justify="space-between" style={{ marginBottom: 8 }}>
        <T size={12} weight="bold" color={colors.subtext} upper>{`${title} · ${list.length}`}</T>
        {hint ? <T size={11.5} color={colors.subtext}>{hint}</T> : null}
      </Row>
      <View style={{ gap: 12 }}>{list.map((r) => <JobCard key={r.id} r={r} onAction={(t) => setAction({ id: r.id, t })} />)}</View>
    </View>
  ) : null;

  return (
    <Page maxWidth={760}>
      <PageHeader title={`${greeting()}, ${me.name.split(' ')[0]}`} subtitle={`${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`} badge={<LiveTag />} />
      <Grid cols={{ mobile: 3 }} gap={10}>
        <Stat label="To do today" value={dueToday.length + working.length} />
        <Stat label="Waiting on tenant" value={waiting.length} />
        <Stat label="Fixed today" value={fixedToday} />
      </Grid>
      <View style={{ height: 18 }} />
      {disputed.length ? (
        <Notice tone="danger" title={`${disputed.length} job${disputed.length === 1 ? '' : 's'} disputed by the tenant`} style={{ marginBottom: 18 }}>
          Your manager will review and send it back to you if more work is needed.
        </Notice>
      ) : null}
      {section('In progress', working)}
      {section('Due today', dueToday, 'Start work when you arrive')}
      {section('Coming up', upcoming)}
      {section('Waiting for the tenant to confirm', waiting)}
      {nothing ? (
        <Card><EmptyState icon={ClipboardList} title="No jobs for you right now" body="Jobs show up here as soon as a manager assigns them to you. Pull down to check again." /></Card>
      ) : null}
      {unassigned ? <Notice tone="info" style={{ marginTop: 4 }}>{`${unassigned} new request${unassigned === 1 ? ' is' : 's are'} waiting for a manager to assign them at your properties.`}</Notice> : null}
      {actionFor && action ? <TransitionDialog request={actionFor} transition={action.t} onClose={() => setAction(null)} requirePhotos /> : null}
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card pad={12}>
      <T size={22} weight="bold">{value}</T>
      <T size={11.5} color={colors.subtext} numberOfLines={2}>{label}</T>
    </Card>
  );
}

function visitText(r: MaintenanceRequest, today: string): { text: string; late: boolean } {
  if (!r.visit) return { text: 'No visit time set', late: false };
  if (r.visit.date === today) return { text: `Today, ${r.visit.window}`, late: false };
  if (r.visit.date < today) return { text: `Visit was due ${fmtShort(r.visit.date)}, ${r.visit.window}`, late: r.status === 'assigned' };
  return { text: `${fmtShort(r.visit.date)}, ${r.visit.window}`, late: false };
}

function JobCard({ r, onAction }: { r: MaintenanceRequest; onAction: (t: Transition) => void }) {
  const { me } = useStore();
  const lookup = useLookup();
  const { navigate } = useRouter();
  const tenant = lookup.tenant(r.tenantId);
  const unit = lookup.unit(r.unitId);
  const prop = lookup.property(r.propertyId);
  const block = lookup.block(unit?.blockId);
  const visit = visitText(r, todayISO());
  const next = allowedTransitions(r, me).filter((t) => t === 'start' || t === 'complete');
  return (
    <Card pad={16}>
      <Row gap={6} wrap><PriorityBadge p={r.priority} /><RequestStatusBadge s={r.status} /><T size={11.5} color={colors.subtext}>{r.id}</T></Row>
      <T size={15.5} weight="semibold" style={{ marginTop: 8 }}>{r.title}</T>
      <View style={{ gap: 5, marginTop: 8 }}>
        <Row gap={8}><MapPin size={14} color={colors.subtext} /><T size={13} color={colors.textSoft} style={{ flex: 1 }}>{[prop?.short, block?.name, unit ? `Flat ${unit.code}` : null, r.where].filter(Boolean).join(' · ')}</T></Row>
        <Row gap={8}><Clock size={14} color={visit.late ? colors.danger : colors.subtext} /><T size={13} color={visit.late ? colors.danger : colors.textSoft} weight={visit.late ? 'semibold' : 'regular'}>{visit.text}</T></Row>
        {r.access ? <Row gap={8} align="flex-start"><KeyRound size={14} color={colors.subtext} style={{ marginTop: 2 }} /><T size={13} color={colors.textSoft} style={{ flex: 1 }}>{r.caretakerAccess ? `Can let yourself in. ${r.access}` : r.access}</T></Row> : null}
      </View>
      {tenant ? (
        <Row gap={10} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Avatar name={tenant.name} size={34} />
          <View style={{ flex: 1 }}><T size={13.5} weight="semibold" numberOfLines={1}>{tenant.name}</T><T size={12} color={colors.subtext}>Tenant</T></View>
          <CallButton phone={tenant.phone} name={tenant.name} compact />
        </Row>
      ) : null}
      <Row gap={10} style={{ marginTop: 12 }}>
        <Button title="Open job" variant="secondary" style={{ flex: 1 }} size="lg" onPress={() => navigate('request', { id: r.id })} />
        {next.map((t) => <Button key={t} title={TRANSITION_LABEL[t]} style={{ flex: 1 }} size="lg" onPress={() => onAction(t)} />)}
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------- Property contacts

export function ContactsScreen() {
  const { state, me } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const s = state.settings;
  const vendors = state.vendors.filter((v) => v.status === 'active').sort((a, b) => a.trade.localeCompare(b.trade) || a.name.localeCompare(b.name));
  return (
    <Page maxWidth={760}>
      <PageHeader title="Property contacts" subtitle="Managers, other caretakers and vendors for the properties you look after." />
      <View style={{ gap: 14 }}>
        <Card>
          <CardHeader title="Management office" />
          <ContactRow name={s.orgName} sub={[s.phone, s.email].filter(Boolean).join(' · ')} phone={s.phone} />
        </Card>
        {scope.properties.map((p) => {
          const manager = lookup.user(p.managerId);
          const others = state.users.filter((u) => u.role === 'caretaker' && u.id !== me?.id && u.status === 'active' && u.propertyIds?.includes(p.id));
          const loc = lookup.location(p.locationId);
          return (
            <Card key={p.id}>
              <CardHeader title={p.name} subtitle={[p.address, loc?.name].filter(Boolean).join(' · ')} />
              <View style={{ gap: 12 }}>
                {manager ? <ContactRow name={manager.name} sub={`Property manager${manager.phone ? ` · ${manager.phone}` : ''}`} phone={manager.phone} /> : null}
                {others.map((u) => <ContactRow key={u.id} name={u.name} sub={`Caretaker${u.phone ? ` · ${u.phone}` : ''}`} phone={u.phone} />)}
                {!manager && !others.length ? <T size={12.5} color={colors.subtext}>No contacts recorded for this property.</T> : null}
              </View>
            </Card>
          );
        })}
        {!scope.properties.length ? <Card><EmptyState icon={Building2} title="No properties linked to you" body="Ask your administrator to link you to the properties you look after." /></Card> : null}
        <Card>
          <CardHeader title="Vendors" subtitle="Call a vendor only when your manager has assigned them to the job." />
          <View style={{ gap: 12 }}>
            {vendors.map((v) => <ContactRow key={v.id} name={v.name} sub={`${v.trade} · ${v.contact} · ${v.phone}`} phone={v.phone} />)}
            {!vendors.length ? <T size={12.5} color={colors.subtext}>No active vendors.</T> : null}
          </View>
        </Card>
      </View>
    </Page>
  );
}

function ContactRow({ name, sub, phone }: { name: string; sub: string; phone?: string }) {
  return (
    <Row gap={10}>
      <Avatar name={name} size={36} />
      <View style={{ flex: 1 }}><T size={13.5} weight="semibold" numberOfLines={1}>{name}</T><T size={12} color={colors.subtext} numberOfLines={2}>{sub}</T></View>
      <CallButton phone={phone} name={name} compact />
    </Row>
  );
}
