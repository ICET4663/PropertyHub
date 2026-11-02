import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import {
  ChevronDown, ChevronRight, Grid2x2, MapPin, Pencil, Plus, Search, Trash2, Wrench, Upload, X, Building2, UserPlus, List, Table2, TriangleAlert, Check,
} from 'lucide-react-native';
import { colors, radius, useBreakpoint } from '../../theme';
import { useLookup, useScope, useStore } from '../../store/AppContext';
import { useRouter } from '../../nav/router';
import { Page, PageHeader } from '../../components/shell';
import {
  Avatar, Badge, Button, Card, CardHeader, Dialog, EmptyState, Grid, IconTile, Input, KV, Link, Notice, ProgressBar, Row, Segmented, Select, Sheet,
  T, Touch, useToast, Divider,
} from '../../components/ui';
import { DataTable, FileRow, RequestStatusBadge, UNIT_STATUS, UnitBadge } from '../../components/data';
import { UploadDocumentDialog, useOpenDocument } from '../../components/files';
import { usePropertyStats } from '../../lib/stats';
import type { Location, Unit, UnitStatus, UnitType } from '../../types';
import { daysBetween, daysUntil, fmtDate, leaseStatus, naira, pct, todayISO } from '../../utils';

// ---------------------------------------------------------------- Locations

export function LocationsScreen() {
  const { state, me, addLocation, updateLocation, deleteLocation } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const stats = usePropertyStats();
  const { navigate, route } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(scope.locations[0]?.id ?? null);
  const [editing, setEditing] = useState<Location | 'new' | null>(route.params.create === '1' ? 'new' : null);
  const canEdit = me?.role === 'super_admin' || me?.role === 'manager';

  const locs = scope.locations.filter((l) => !q || `${l.name} ${l.area} ${l.city}`.toLowerCase().includes(q.toLowerCase()));
  const sel = state.locations.find((l) => l.id === selected);
  const locStats = (id: string) => {
    const ps = stats.filter((s) => s.property.locationId === id);
    const units = ps.reduce((s, x) => s + x.total, 0);
    const occ = ps.reduce((s, x) => s + x.occupied, 0);
    return { ps, units, occ, blocks: ps.reduce((s, x) => s + x.blocks, 0), occupancy: units ? occ / units : 0, open: ps.reduce((s, x) => s + x.openRequests, 0), tenants: ps.reduce((s, x) => s + x.activeTenants, 0) };
  };
  const cities = new Set(scope.locations.map((l) => l.city));

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Locations' }]} title="Locations" subtitle={`${scope.locations.length} locations: ${[...cities].join(' and ')}`}
        actions={<>
          <View style={{ width: 220 }}><Input leftIcon={Search} value={q} onChangeText={setQ} placeholder="Search locations" /></View>
          {canEdit ? <Button title="Create location" icon={Plus} onPress={() => setEditing('new')} /> : null}
        </>} />
      <View style={{ flexDirection: bp === 'desktop' ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, width: '100%' }}>
          <Grid cols={{ mobile: 1, tablet: 2 }}>
            {[...locs.map((l) => {
              const s = locStats(l.id);
              const on = l.id === selected;
              return (
                <Card key={l.id} onPress={() => setSelected(l.id)} style={on ? { borderColor: colors.primary, borderWidth: 1.5 } : undefined} pad={16}>
                  <Row justify="space-between" align="flex-start">
                    <Row gap={10} align="flex-start" style={{ flex: 1 }}>
                      <IconTile icon={MapPin} tone="primary" size={34} />
                      <View style={{ flex: 1 }}><T size={14.5} weight="semibold">{l.name}</T><T size={12} color={colors.subtext} numberOfLines={1}>{l.area}, {l.city}</T></View>
                    </Row>
                    {canEdit ? (
                      <Row gap={2}>
                        <Touch onPress={() => setEditing(l)} style={{ padding: 6, borderRadius: 6 }} hoverStyle={{ backgroundColor: colors.neutralSoft }}><Pencil size={14} color={colors.subtext} /></Touch>
                        <Touch onPress={() => { if (deleteLocation(l.id)) toast(`${l.name} deleted`); else toast(`Move or archive the ${s.ps.length} propert${s.ps.length === 1 ? 'y' : 'ies'} in ${l.name} first`, 'danger'); }} style={{ padding: 6, borderRadius: 6 }} hoverStyle={{ backgroundColor: colors.dangerSoft }}><Trash2 size={14} color={colors.subtext} /></Touch>
                      </Row>
                    ) : null}
                  </Row>
                  <Row gap={0} style={{ marginTop: 16 }}>
                    {[['Properties', s.ps.length], ['Blocks', s.blocks], ['Units', s.units]].map(([k, v]) => (
                      <View key={k as string} style={{ flex: 1 }}><T size={11} color={colors.subtext}>{k}</T><T size={17} weight="bold">{v}</T></View>
                    ))}
                  </Row>
                  <View style={{ marginTop: 12, gap: 6 }}>
                    <Row justify="space-between"><T size={11.5} color={colors.subtext}>Occupancy</T><T size={12} weight="bold">{pct(s.occ, s.units)}</T></Row>
                    <ProgressBar value={s.occupancy} color={s.occupancy < 0.8 ? colors.vizMaint : colors.primary} />
                  </View>
                </Card>
              );
            }),
            canEdit ? (
              <Touch key="new" onPress={() => setEditing('new')} style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: radius.lg, minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 8 }} hoverStyle={{ borderColor: colors.primary, backgroundColor: colors.card }}>
                <Plus size={20} color={colors.subtext} />
                <T size={13.5} weight="semibold" color={colors.textSoft}>Create location</T>
              </Touch>
            ) : null]}
          </Grid>
        </View>
        {sel ? (
          <Card pad={0} style={{ width: bp === 'desktop' ? 360 : '100%', overflow: 'hidden' }}>
            <MapArt />
            <View style={{ padding: 18, gap: 14 }}>
              <Row justify="space-between">
                <View style={{ flex: 1 }}><T size={16} weight="semibold">{sel.name}</T><T size={12} color={colors.subtext}>{sel.area}, {sel.city}</T></View>
                {canEdit ? <Button title="Edit" size="sm" variant="secondary" onPress={() => setEditing(sel)} /> : null}
              </Row>
              <T size={12.5} color={colors.textSoft}>{sel.description}</T>
              <T size={12} weight="semibold" color={colors.subtext}>Properties in this location</T>
              {locStats(sel.id).ps.map((s) => (
                <Touch key={s.property.id} onPress={() => navigate('property', { id: s.property.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10 }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
                  <View style={{ width: 30, height: 30, borderRadius: 7, backgroundColor: s.property.art.bg, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}><View style={{ width: 14, height: 20, backgroundColor: s.property.art.a }} /></View>
                  <View style={{ flex: 1 }}><T size={13} weight="semibold">{s.property.name}</T><T size={11.5} color={colors.subtext}>{s.blocks} blocks · {s.total} units · {pct(s.occupied, s.total)}</T></View>
                  <ChevronRight size={16} color={colors.subtext} />
                </Touch>
              ))}
              {!locStats(sel.id).ps.length ? <T size={12.5} color={colors.subtext}>No properties yet.</T> : null}
              <Grid cols={{ mobile: 2 }} gap={12}>
                <KV label="Active tenants" value={locStats(sel.id).tenants} />
                <KV label="Open requests" value={locStats(sel.id).open} />
                <KV label="Expiring leases" value={scope.currentLeases.filter((l) => lookup.property(l.propertyId)?.locationId === sel.id && daysUntil(l.end) <= 90).length} />
                <KV label="Manager" value={lookup.user(sel.managerId)?.name ?? '—'} />
              </Grid>
              <Button title="View all properties here" variant="soft" onPress={() => navigate('properties')} />
            </View>
          </Card>
        ) : null}
      </View>

      <LocationSheet
        location={editing}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing === 'new') { const id = addLocation(data); setSelected(id); toast(`${data.name} created`); }
          else if (editing) { updateLocation(editing.id, data); toast('Changes saved'); }
          setEditing(null);
        }}
        onDelete={(l) => { if (deleteLocation(l.id)) { toast(`${l.name} deleted`); setEditing(null); setSelected(scope.locations.find((x) => x.id !== l.id)?.id ?? null); } }}
        propertyCount={editing && editing !== 'new' ? locStats(editing.id).ps.length : 0}
      />
    </Page>
  );
}

function MapArt() {
  return (
    <View style={{ height: 150, backgroundColor: '#E6EDEA' }}>
      <Svg width="100%" height={150} viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={360} height={150} fill="#E6EDEA" />
        <Line x1={0} y1={100} x2={360} y2={60} stroke="#FFFFFF" strokeWidth={10} />
        <Line x1={120} y1={0} x2={170} y2={150} stroke="#FFFFFF" strokeWidth={7} />
        <Line x1={260} y1={0} x2={230} y2={150} stroke="#FFFFFF" strokeWidth={5} />
        <Rect x={20} y={14} width={70} height={40} rx={6} fill="#D7E4DE" />
        <Rect x={290} y={96} width={56} height={40} rx={6} fill="#D7E4DE" />
        <Circle cx={196} cy={72} r={20} fill={colors.primary} opacity={0.15} />
        <Circle cx={196} cy={72} r={8} fill={colors.primary} />
        <Circle cx={196} cy={72} r={3} fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

function LocationSheet({ location, onClose, onSave, onDelete, propertyCount }: { location: Location | 'new' | null; onClose: () => void; onSave: (l: Omit<Location, 'id'>) => void; onDelete: (l: Location) => void; propertyCount: number }) {
  const { state } = useStore();
  const [f, setF] = useState<Omit<Location, 'id'>>({ name: '', area: '', city: 'Lagos', state: 'Lagos State', description: '', managerId: '' });
  const [err, setErr] = useState('');
  const [previousLocation, setPreviousLocation] = useState(location);
  const [previousUsers, setPreviousUsers] = useState(state.users);
  if (previousLocation !== location || previousUsers !== state.users) {
    setPreviousLocation(location); setPreviousUsers(state.users);
    if (location && location !== 'new') { const { id: _id, ...rest } = location; setF(rest); }
    else setF({ name: '', area: '', city: 'Lagos', state: 'Lagos State', description: '', managerId: state.users.find((u) => u.role === 'manager')?.id ?? '' });
    setErr('');
  }
  const isNew = location === 'new';
  return (
    <Sheet open={!!location} onClose={onClose}>
      <View style={{ flex: 1 }}>
        <Row justify="space-between" style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View><T size={16.5} weight="semibold">{isNew ? 'Create location' : 'Edit location'}</T><T size={12} color={colors.subtext}>Group properties by area for reporting and access.</T></View>
          <Touch onPress={onClose} style={{ padding: 6 }}><X size={18} color={colors.subtext} /></Touch>
        </Row>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Input label="Location name" required value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="e.g. Lekki Phase 1" error={err} />
          <Input label="Address or area" required value={f.area} onChangeText={(v) => setF({ ...f, area: v })} placeholder="e.g. Admiralty Way corridor" />
          <Row gap={12} align="flex-start">
            <Input fieldStyle={{ flex: 1 }} label="City" required value={f.city} onChangeText={(v) => setF({ ...f, city: v })} />
            <Select fieldStyle={{ flex: 1 }} label="State" required value={f.state} onChange={(v) => setF({ ...f, state: v })} options={['Lagos State', 'FCT', 'Ogun State', 'Rivers State', 'Oyo State'].map((s) => ({ value: s, label: s }))} />
          </Row>
          <Input label="Description" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} multiline />
          <Select label="Default property manager" value={f.managerId} onChange={(v) => setF({ ...f, managerId: v })} options={state.users.filter((u) => u.role === 'manager' || u.role === 'super_admin').map((u) => ({ value: u.id, label: u.name, sub: u.access }))} />
          {!isNew && propertyCount > 0 ? <Notice tone="warning">{`This location has ${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'}. Move or archive ${propertyCount === 1 ? 'it' : 'them'} before the location can be deleted.`}</Notice> : null}
        </ScrollView>
        <Row justify="space-between" style={{ padding: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
          {!isNew && location ? <Button title="Delete location" icon={Trash2} variant="dangerGhost" disabled={propertyCount > 0} onPress={() => onDelete(location)} /> : <View />}
          <Row gap={8}>
            <Button title="Cancel" variant="secondary" onPress={onClose} />
            <Button title={isNew ? 'Create location' : 'Save changes'} onPress={() => { if (!f.name.trim() || !f.area.trim()) { setErr('Name and area are required.'); return; } onSave(f); }} />
          </Row>
        </Row>
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Blocks & units

const UNIT_TYPES: UnitType[] = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', 'Duplex'];
const shortType = (t: UnitType) => (t === 'Studio' ? 'Studio' : t === 'Duplex' ? 'Duplex' : `${t[0]} Bed`);

export function BlocksUnitsScreen() {
  const { state, me, addBlock, addUnit, updateUnit } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const { navigate, route } = useRouter();
  const toast = useToast();
  const { bp } = useBreakpoint();
  const initialProp = route.params.propertyId ?? scope.properties[0]?.id ?? '';
  const [propertyId, setPropertyId] = useState(initialProp);
  const [blockFilter, setBlockFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState<'map' | 'table'>('map');
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [initialProp]: true });
  const [addUnitOpen, setAddUnitOpen] = useState(route.params.add === '1');
  const [addBlockOpen, setAddBlockOpen] = useState(route.params.addBlock === '1');
  const canEdit = me?.role === 'super_admin' || me?.role === 'manager';

  const prop = lookup.property(propertyId);
  const blocks = state.blocks.filter((b) => b.propertyId === propertyId && (blockFilter === 'all' || b.id === blockFilter));
  const allUnits = state.units.filter((u) => u.propertyId === propertyId);
  const matches = (u: Unit) => (typeFilter === 'all' || u.type === typeFilter) && (statusFilter === 'all' || u.status === statusFilter);
  const counts = { occupied: allUnits.filter((u) => u.status === 'occupied').length, vacant: allUnits.filter((u) => u.status === 'vacant').length, maintenance: allUnits.filter((u) => u.status === 'maintenance').length };
  const unit = state.units.find((u) => u.id === selectedUnit);
  const tenantOf = (u: Unit) => state.tenants.find((t) => t.unitId === u.id && t.status === 'active');

  const [previousProperty, setPreviousProperty] = useState(propertyId);
  if (previousProperty !== propertyId) { setPreviousProperty(propertyId); setSelectedUnit(null); setBlockFilter('all'); }

  const tree = (
    <Card pad={10} style={{ width: bp === 'desktop' ? 250 : '100%' }}>
      <T size={10.5} weight="bold" color={colors.faint} upper style={{ padding: 8 }}>Location · Property · Block</T>
      {scope.locations.map((l) => {
        const ps = scope.properties.filter((p) => p.locationId === l.id);
        if (!ps.length) return null;
        return (
          <View key={l.id}>
            {ps.map((p) => {
              const open = expanded[p.id];
              const pb = state.blocks.filter((b) => b.propertyId === p.id);
              return (
                <View key={p.id}>
                  <Touch onPress={() => { setExpanded({ ...expanded, [p.id]: !open }); setPropertyId(p.id); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 6 }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
                    {open ? <ChevronDown size={14} color={colors.subtext} /> : <ChevronRight size={14} color={colors.subtext} />}
                    <T size={12.5} weight={p.id === propertyId ? 'semibold' : 'medium'} style={{ flex: 1 }} numberOfLines={1}>{l.name} · {p.short}</T>
                    <T size={11.5} color={colors.subtext}>{state.units.filter((u) => u.propertyId === p.id).length}</T>
                  </Touch>
                  {open ? pb.map((b) => (
                    <Touch key={b.id} onPress={() => { setPropertyId(p.id); setBlockFilter(b.id); }} style={{ flexDirection: 'row', paddingVertical: 6, paddingLeft: 30, paddingRight: 8, borderRadius: 6, backgroundColor: blockFilter === b.id && p.id === propertyId ? colors.primarySoft : 'transparent' }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
                      <T size={12.5} weight={blockFilter === b.id ? 'semibold' : 'regular'} color={blockFilter === b.id ? colors.primary : colors.textSoft} style={{ flex: 1 }}>{b.name}</T>
                      <T size={11.5} color={colors.subtext}>{state.units.filter((u) => u.blockId === b.id).length}</T>
                    </Touch>
                  )) : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </Card>
  );

  const unitCell = (u: Unit) => {
    const dim = !matches(u);
    const sel = u.id === selectedUnit;
    const t = tenantOf(u);
    const style = u.status === 'occupied' ? { bg: colors.primary, fg: colors.white, sub: 'rgba(255,255,255,0.7)' } : u.status === 'vacant' ? { bg: colors.card, fg: colors.info, sub: colors.info } : { bg: colors.accentSoft, fg: colors.accentDeep, sub: colors.accentDeep };
    return (
      <Touch key={u.id} onPress={() => setSelectedUnit(u.id)} style={[{ flex: 1, minWidth: 64, height: 50, borderRadius: 7, backgroundColor: style.bg, padding: 7, justifyContent: 'space-between', opacity: dim ? 0.25 : 1, borderWidth: u.status === 'vacant' ? 1.5 : 0, borderColor: colors.vizVacant, borderStyle: u.status === 'vacant' ? 'dashed' : 'solid' }, sel && { borderWidth: 2.5, borderColor: colors.accent, borderStyle: 'solid' }]}>
        <Row justify="space-between"><T size={11.5} weight="bold" color={style.fg}>{u.code}</T><T size={9.5} color={style.sub}>{shortType(u.type)}</T></Row>
        <T size={10} color={style.sub} numberOfLines={1}>{u.status === 'occupied' ? t?.name.split(' ')[1] ?? 'Let' : u.status === 'vacant' ? 'Vacant' : 'Maintenance'}</T>
      </Touch>
    );
  };

  const map = (
    <View style={{ gap: 14 }}>
      {blocks.map((b) => {
        const bu = allUnits.filter((u) => u.blockId === b.id);
        const floors = Array.from(new Set(bu.map((u) => u.floor))).sort((a, c) => c - a);
        const occ = bu.filter((u) => u.status === 'occupied').length;
        return (
          <Card key={b.id} pad={16}>
            <Row justify="space-between" style={{ marginBottom: 12 }}>
              <View><T size={14.5} weight="semibold">{b.name}</T><T size={11.5} color={colors.subtext}>{floors.length} floors · {bu.length} units · {occ} occupied · {pct(occ, bu.length)}</T></View>
              {canEdit ? <Row gap={6}><Button title="Unit" icon={Plus} size="sm" variant="secondary" onPress={() => setAddUnitOpen(true)} /></Row> : null}
            </Row>
            <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 10, gap: 8 }}>
              {floors.map((fl) => (
                <Row key={fl} gap={8} align="stretch">
                  <View style={{ width: 52, justifyContent: 'center' }}><T size={11.5} color={colors.subtext}>{fl === 0 ? 'Ground' : `Floor ${fl}`}</T></View>
                  <Row gap={8} style={{ flex: 1 }}>{bu.filter((u) => u.floor === fl).map(unitCell)}</Row>
                </Row>
              ))}
              <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, marginTop: 2 }} />
            </View>
          </Card>
        );
      })}
      {!blocks.length ? <Card><EmptyState icon={Grid2x2} title="No blocks yet" body="Add a block to start adding units." action={canEdit ? <Button title="Add block" onPress={() => setAddBlockOpen(true)} /> : undefined} /></Card> : null}
    </View>
  );

  const tableRows = allUnits.filter((u) => matches(u) && (blockFilter === 'all' || u.blockId === blockFilter));
  const table = (
    <Card pad={0}>
      <DataTable rows={tableRows} keyOf={(u) => u.id} onRowPress={(u) => navigate('unit', { id: u.id })} columns={[
        { key: 'c', title: 'Unit', min: 70, flex: 0.6, render: (u) => <T size={13} weight="bold">{u.code}</T> },
        { key: 'b', title: 'Block', min: 80, flex: 0.7, render: (u) => <T size={13} color={colors.textSoft}>{lookup.block(u.blockId)?.name}</T> },
        { key: 'f', title: 'Floor', min: 70, flex: 0.6, render: (u) => <T size={13} color={colors.textSoft}>{u.floor === 0 ? 'Ground' : u.floor}</T> },
        { key: 't', title: 'Type', min: 100, render: (u) => <T size={13} color={colors.textSoft}>{u.type}</T> },
        { key: 'r', title: 'Rent / yr', min: 110, render: (u) => <T size={13}>{naira(u.rent)}</T> },
        { key: 'te', title: 'Tenant', min: 140, flex: 1.3, render: (u) => <T size={13} color={tenantOf(u) ? colors.text : colors.faint}>{tenantOf(u)?.name ?? '—'}</T> },
        { key: 's', title: 'Status', min: 120, render: (u) => <UnitBadge s={u.status} /> },
      ]} />
    </Card>
  );

  const panel = unit ? (
    <Card style={{ width: bp === 'desktop' ? 290 : '100%' }}>
      <Row justify="space-between"><T size={10.5} weight="bold" color={colors.faint} upper>Selected unit</T><UnitBadge s={unit.status} /></Row>
      <T size={20} weight="bold" style={{ marginTop: 6 }}>Flat {unit.code}</T>
      <Grid cols={{ mobile: 2 }} gap={12} style={{ marginTop: 12 }}>
        <KV label="Type" value={unit.type} /><KV label="Floor" value={unit.floor === 0 ? 'Ground' : `Floor ${unit.floor}`} />
        <KV label="Rent" value={`${naira(unit.rent)}/yr`} /><KV label="Size" value={`${unit.sizeSqm} m²`} />
      </Grid>
      {tenantOf(unit) ? (
        <Touch onPress={() => navigate('tenant', { id: tenantOf(unit)!.id })} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 10, marginTop: 14 }}>
          <Avatar name={tenantOf(unit)!.name} size={32} />
          <View style={{ flex: 1 }}><T size={13} weight="semibold">{tenantOf(unit)!.name}</T><T size={11.5} color={colors.subtext}>Lease ends {fmtDate(state.leases.find((l) => l.tenantId === tenantOf(unit)!.id && !l.renewedTo)?.end)}</T></View>
        </Touch>
      ) : null}
      <View style={{ gap: 8, marginTop: 14 }}>
        <Button title="View unit details" variant="soft" onPress={() => navigate('unit', { id: unit.id })} />
        {canEdit ? <>
          <Button title="Assign tenant" icon={UserPlus} variant="secondary" disabled={unit.status !== 'vacant'} onPress={() => navigate('onboarding', { unitId: unit.id })} />
          {unit.status !== 'maintenance'
            ? <Button title="Mark under maintenance" icon={Wrench} variant="secondary" disabled={unit.status === 'occupied'} onPress={() => { updateUnit(unit.id, { status: 'maintenance' }); toast(`${unit.code} marked under maintenance`); }} />
            : <Button title="Mark as vacant" icon={Check} variant="secondary" onPress={() => { updateUnit(unit.id, { status: 'vacant', vacantNote: 'Listed' }); toast(`${unit.code} is back on the market`); }} />}
        </> : null}
      </View>
      <T size={11.5} color={colors.subtext} style={{ marginTop: 12 }}>Assign tenant is only available for vacant units. Occupied units must be vacated or the tenant moved first.</T>
    </Card>
  ) : (
    <Card style={{ width: bp === 'desktop' ? 290 : '100%' }}>
      <EmptyState icon={Grid2x2} title="Select a unit" body="Tap any flat on the map to see its details and actions." />
    </Card>
  );

  return (
    <Page>
      <PageHeader crumbs={[{ label: lookup.location(prop?.locationId)?.name ?? 'Portfolio' }, { label: prop?.name ?? '', to: 'property', params: { id: propertyId } }, { label: 'Blocks & Units' }]} title="Blocks & units"
        actions={<>
          <Segmented value={view} onChange={setView} options={[{ value: 'map', label: 'Building map', icon: Building2 }, { value: 'table', label: 'Table', icon: List }]} />
          {canEdit ? <><Button title="Add block" icon={Plus} variant="secondary" onPress={() => setAddBlockOpen(true)} /><Button title="Add unit" icon={Plus} onPress={() => setAddUnitOpen(true)} /></> : null}
        </>} />
      <Card pad={14} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ flexBasis: 170, flexGrow: 1 }}><Select compact value={prop?.locationId ?? ''} onChange={(v) => { const p = scope.properties.find((x) => x.locationId === v); if (p) setPropertyId(p.id); }} options={scope.locations.filter((l) => scope.properties.some((p) => p.locationId === l.id)).map((l) => ({ value: l.id, label: l.name }))} /></View>
          <View style={{ flexBasis: 190, flexGrow: 1 }}><Select compact value={propertyId} onChange={setPropertyId} options={scope.properties.map((p) => ({ value: p.id, label: p.name }))} /></View>
          <View style={{ flexBasis: 140, flexGrow: 1 }}><Select compact value={blockFilter} onChange={setBlockFilter} options={[{ value: 'all', label: 'All blocks' }, ...state.blocks.filter((b) => b.propertyId === propertyId).map((b) => ({ value: b.id, label: b.name }))]} /></View>
          <View style={{ flexBasis: 140, flexGrow: 1 }}><Select compact value={typeFilter} onChange={setTypeFilter} options={[{ value: 'all', label: 'All unit types' }, ...UNIT_TYPES.map((t) => ({ value: t, label: t }))]} /></View>
          <View style={{ flexBasis: 140, flexGrow: 1 }}><Select compact value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: 'Any status' }, { value: 'occupied', label: 'Occupied' }, { value: 'vacant', label: 'Vacant' }, { value: 'maintenance', label: 'Maintenance' }]} /></View>
        </View>
        <Row gap={16} style={{ marginTop: 12 }} wrap>
          {(['occupied', 'vacant', 'maintenance'] as UnitStatus[]).map((s) => (
            <Row key={s} gap={6}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s === 'vacant' ? colors.card : UNIT_STATUS[s].color, borderWidth: s === 'vacant' ? 1.5 : 0, borderColor: colors.vizVacant }} /><T size={12} color={colors.subtext}>{UNIT_STATUS[s].label} {counts[s]}</T></Row>
          ))}
        </Row>
      </Card>
      <View style={{ flexDirection: bp === 'desktop' ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        {bp === 'desktop' ? tree : null}
        <View style={{ flex: 1, width: '100%' }}>{view === 'map' ? map : table}</View>
        {view === 'map' ? panel : null}
      </View>

      <AddUnitDialog open={addUnitOpen} onClose={() => setAddUnitOpen(false)} propertyId={propertyId} onAdd={(u) => { addUnit(u); toast(`Unit ${u.code} added`); setAddUnitOpen(false); }} />
      <AddBlockDialog open={addBlockOpen} onClose={() => setAddBlockOpen(false)} existing={state.blocks.filter((b) => b.propertyId === propertyId).length} onAdd={(name, floors) => { const id = addBlock(propertyId, name, floors); setBlockFilter('all'); toast(`${name.startsWith('Block') ? name : `Block ${name}`} added to ${prop?.short}`); setAddBlockOpen(false); void id; }} />
    </Page>
  );
}

function AddBlockDialog({ open, onClose, onAdd, existing }: { open: boolean; onClose: () => void; onAdd: (name: string, floors: number) => void; existing: number }) {
  const [name, setName] = useState('');
  const [floors, setFloors] = useState('4');
  const [previous, setPrevious] = useState({ open: false, existing });
  if (previous.open !== open || previous.existing !== existing) {
    setPrevious({ open, existing });
    if (open) { setName(`Block ${String.fromCharCode(65 + existing)}`); setFloors('4'); }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add block" width={420} footer={<><Button title="Cancel" variant="secondary" onPress={onClose} /><Button title="Add block" onPress={() => name.trim() && onAdd(name.trim(), Math.max(1, parseInt(floors, 10) || 1))} /></>}>
      <View style={{ gap: 14 }}>
        <Input label="Block name" required value={name} onChangeText={setName} />
        <Input label="Number of floors" value={floors} onChangeText={setFloors} keyboardType="number-pad" hint="Include the ground floor." />
      </View>
    </Dialog>
  );
}

function AddUnitDialog({ open, onClose, onAdd, propertyId }: { open: boolean; onClose: () => void; propertyId: string; onAdd: (u: Omit<Unit, 'id' | 'features' | 'deposit'>) => void }) {
  const { state } = useStore();
  const blocks = state.blocks.filter((b) => b.propertyId === propertyId);
  const [f, setF] = useState({ blockId: '', code: '', floor: '0', type: '2 Bedroom' as UnitType, rent: '', service: '', size: '96' });
  const [err, setErr] = useState('');
  const [previousOpen, setPreviousOpen] = useState(false);
  if (previousOpen !== open) {
    setPreviousOpen(open);
    if (open) {
      const b = blocks[0];
      const n = b ? state.units.filter((u) => u.blockId === b.id).length + 1 : 1;
      setF({ blockId: b?.id ?? '', code: b ? `${b.name.replace('Block ', '')}${n}` : '', floor: '0', type: '2 Bedroom', rent: '2400000', service: '250000', size: '96' });
      setErr('');
    }
  }
  const submit = () => {
    if (!f.blockId || !f.code.trim()) { setErr('Choose a block and enter a unit number.'); return; }
    if (state.units.some((u) => u.propertyId === propertyId && u.code.toLowerCase() === f.code.trim().toLowerCase())) { setErr(`Unit ${f.code} already exists in this property.`); return; }
    onAdd({ propertyId, blockId: f.blockId, code: f.code.trim().toUpperCase(), floor: parseInt(f.floor, 10) || 0, type: f.type, bathrooms: f.type === 'Studio' || f.type === '1 Bedroom' ? 1 : 2, sizeSqm: parseInt(f.size, 10) || 60, rent: parseInt(f.rent.replace(/\D/g, ''), 10) || 0, serviceCharge: parseInt(f.service.replace(/\D/g, ''), 10) || 0, status: 'vacant' });
  };
  return (
    <Dialog open={open} onClose={onClose} title="Add unit" subtitle={state.properties.find((p) => p.id === propertyId)?.name} footer={<><Button title="Cancel" variant="secondary" onPress={onClose} /><Button title="Add unit" onPress={submit} /></>}>
      <View style={{ gap: 14 }}>
        {!blocks.length ? <Notice tone="warning">Add a block to this property first.</Notice> : null}
        <Row gap={12} align="flex-start">
          <Select fieldStyle={{ flex: 1 }} label="Block" required value={f.blockId} onChange={(v) => setF({ ...f, blockId: v })} options={blocks.map((b) => ({ value: b.id, label: b.name }))} />
          <Input fieldStyle={{ flex: 1 }} label="Unit number" required value={f.code} onChangeText={(v) => setF({ ...f, code: v })} placeholder="e.g. A13" />
        </Row>
        <Row gap={12} align="flex-start">
          <Select fieldStyle={{ flex: 1 }} label="Unit type" required value={f.type} onChange={(v) => setF({ ...f, type: v })} options={UNIT_TYPES.map((t) => ({ value: t, label: t }))} />
          <Input fieldStyle={{ flex: 1 }} label="Floor" value={f.floor} onChangeText={(v) => setF({ ...f, floor: v })} keyboardType="number-pad" hint="0 = ground floor" />
        </Row>
        <Row gap={12} align="flex-start">
          <Input fieldStyle={{ flex: 1 }} label="Annual rent (₦)" required value={f.rent} onChangeText={(v) => setF({ ...f, rent: v })} keyboardType="number-pad" />
          <Input fieldStyle={{ flex: 1 }} label="Service charge (₦/yr)" value={f.service} onChangeText={(v) => setF({ ...f, service: v })} keyboardType="number-pad" />
        </Row>
        <Input label="Size (m²)" value={f.size} onChangeText={(v) => setF({ ...f, size: v })} keyboardType="number-pad" />
        {err ? <Notice tone="danger">{err}</Notice> : null}
      </View>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Unit details

export function UnitDetailScreen({ id }: { id: string }) {
  const { state, me, updateUnit } = useStore();
  const openDoc = useOpenDocument();
  const [uploadOpen, setUploadOpen] = useState(false);
  const lookup = useLookup();
  const { navigate } = useRouter();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const unit = state.units.find((u) => u.id === id);
  const [rent, setRent] = useState(String(unit?.rent ?? ''));
  const [service, setService] = useState(String(unit?.serviceCharge ?? ''));
  const [type, setType] = useState<UnitType>(unit?.type ?? '1 Bedroom');
  if (!unit) return <Page><Card><EmptyState icon={Grid2x2} title="Unit not found" action={<Button title="Back to units" onPress={() => navigate('units')} />} /></Card></Page>;
  const prop = lookup.property(unit.propertyId)!;
  const block = lookup.block(unit.blockId);
  const tenant = state.tenants.find((t) => t.unitId === unit.id && t.status === 'active');
  const lease = tenant ? lookup.currentLease(tenant.id) : undefined;
  const history = state.leases.filter((l) => l.unitId === unit.id).sort((a, b) => (a.start < b.start ? 1 : -1));
  const reqs = state.requests.filter((r) => r.unitId === unit.id);
  const docs = state.documents.filter((d) => (tenant && d.tenantId === tenant.id) || (d.propertyId === prop.id && d.linkedTo === `${prop.short} · ${unit.code}`)).slice(0, 4);
  const canEdit = me?.role === 'super_admin' || me?.role === 'manager';
  const total = lease ? daysBetween(lease.start, lease.end) : 1;
  const elapsed = lease ? Math.max(0, total - daysUntil(lease.end)) : 0;

  return (
    <Page>
      <PageHeader crumbs={[{ label: prop.name, to: 'property', params: { id: prop.id } }, { label: block?.name ?? '', to: 'units', params: { propertyId: prop.id } }, { label: `Flat ${unit.code}` }]} title="" />
      <Row justify="space-between" wrap gap={12} style={{ marginBottom: 18 }}>
        <Row gap={12}>
          <View style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><T size={15} weight="bold" color={colors.white}>{unit.code}</T></View>
          <View>
            <Row gap={8}><T size={24} weight="bold">Flat {unit.code}</T><UnitBadge s={unit.status} /></Row>
            <T size={12.5} color={colors.subtext}>{prop.name} · {block?.name} · {unit.floor === 0 ? 'Ground floor' : `Floor ${unit.floor}`} · {unit.type}</T>
          </View>
        </Row>
        <Row gap={8} wrap>
          {canEdit ? <Button title="Edit unit" icon={Pencil} variant="secondary" size="sm" onPress={() => setEditOpen(true)} /> : null}
          {canEdit && unit.status !== 'occupied' ? (
            unit.status === 'maintenance'
              ? <Button title="Mark as vacant" variant="secondary" size="sm" onPress={() => { updateUnit(unit.id, { status: 'vacant', vacantNote: 'Listed' }); toast('Unit is back on the market'); }} />
              : <Button title="Mark under maintenance" variant="dangerGhost" size="sm" onPress={() => { updateUnit(unit.id, { status: 'maintenance' }); toast('Unit marked under maintenance'); }} />
          ) : null}
          {tenant ? <Button title="View tenant" size="sm" onPress={() => navigate('tenant', { id: tenant.id })} /> : canEdit && unit.status === 'vacant' ? <Button title="Assign tenant" icon={UserPlus} size="sm" onPress={() => navigate('onboarding', { unitId: unit.id })} /> : null}
        </Row>
      </Row>
      <Grid cols={{ mobile: 1, desktop: 3 }} spans={[{ mobile: 1, desktop: 2 }, 1]}>
        <View style={{ gap: 16 }}>
          <Card>
            <CardHeader title="Unit information" />
            <Grid cols={{ mobile: 2, tablet: 4 }} gap={16}>
              <KV label="Unit number" value={unit.code} /><KV label="Property" value={prop.name} /><KV label="Block" value={block?.name} /><KV label="Unit type" value={unit.type} />
              <KV label="Floor" value={unit.floor === 0 ? 'Ground' : `Floor ${unit.floor}`} /><KV label="Size" value={`${unit.sizeSqm} m²`} /><KV label="Bathrooms" value={`${unit.bathrooms}${unit.bathrooms > 1 ? '' : ' + guest WC'}`} />
              <KV label="Occupancy status"><UnitBadge s={unit.status} /></KV>
            </Grid>
          </Card>
          <Card>
            <CardHeader title="Current tenancy" right={lease ? <Link onPress={() => navigate('lease', { id: lease.id })}>Open lease {lease.id}</Link> : null} />
            {tenant && lease ? (
              <View style={{ gap: 14 }}>
                <Row justify="space-between" wrap>
                  <Row gap={10}><Avatar name={tenant.name} size={36} /><View><T size={13.5} weight="semibold">{tenant.name}</T><T size={12} color={colors.subtext}>{tenant.code} · {tenant.phone}</T></View></Row>
                  <Badge label={leaseStatus(lease) === 'expiring' ? 'Expiring soon' : 'Lease active'} tone={leaseStatus(lease) === 'expiring' ? 'warning' : 'success'} dot />
                </Row>
                <Grid cols={{ mobile: 2, tablet: 4 }} gap={12}>
                  <KV label="Lease start" value={fmtDate(lease.start)} /><KV label="Lease end" value={fmtDate(lease.end)} /><KV label="Days remaining" value={`${Math.max(0, daysUntil(lease.end))} days`} /><KV label="Duration" value={`${lease.termMonths} months`} />
                </Grid>
                <View style={{ gap: 5 }}>
                  <ProgressBar value={elapsed / total} />
                  <Row justify="space-between"><T size={11} color={colors.subtext}>{fmtDate(lease.start)}</T><T size={11} color={colors.subtext}>{Math.round((elapsed / total) * 100)}% elapsed</T><T size={11} color={colors.subtext}>{fmtDate(lease.end)}</T></Row>
                </View>
              </View>
            ) : <EmptyState icon={UserPlus} title={unit.status === 'vacant' ? 'This unit is vacant' : 'Under maintenance'} body={unit.status === 'vacant' ? `Vacant since ${fmtDate(unit.vacantSince)}.` : 'Finish repairs, then mark the unit as vacant to let it again.'} action={unit.status === 'vacant' && canEdit ? <Button title="Assign tenant" onPress={() => navigate('onboarding', { unitId: unit.id })} /> : undefined} />}
          </Card>
          <Card pad={0}>
            <View style={{ padding: 20, paddingBottom: 12 }}><CardHeader style={{ marginBottom: 0 }} title="Maintenance history" right={<T size={12} color={colors.subtext}>{reqs.length} requests on record</T>} /></View>
            <DataTable rows={reqs} keyOf={(r) => r.id} onRowPress={(r) => navigate('request', { id: r.id })} empty={<T size={12.5} color={colors.subtext} style={{ padding: 16 }}>No requests yet.</T>} columns={[
              { key: 'i', title: 'Request', min: 90, render: (r) => <T mono size={12.5} color={colors.primary}>{r.id}</T> },
              { key: 'c', title: 'Category', min: 120, render: (r) => <T size={13} color={colors.textSoft}>{r.category}</T> },
              { key: 'd', title: 'Date', min: 100, render: (r) => <T size={13} color={colors.textSoft}>{fmtDate(r.createdAt)}</T> },
              { key: 'v', title: 'Vendor', min: 140, flex: 1.3, render: (r) => <T size={13} color={colors.textSoft}>{lookup.vendor(r.vendorId)?.name ?? '—'}</T> },
              { key: 'r', title: 'Resolution', min: 90, render: (r) => <T size={13} color={colors.textSoft}>{r.resolvedAt ? `${Math.max(1, Math.round((new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime()) / 86400000))} days` : '—'}</T> },
              { key: 's', title: 'Status', min: 110, render: (r) => <RequestStatusBadge s={r.status} /> },
            ]} />
          </Card>
          <Card>
            <CardHeader title="Tenancy history" />
            {history.map((l, i) => (
              <Row key={l.id} gap={12} align="flex-start">
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: i === 0 ? colors.primary : colors.borderStrong, backgroundColor: colors.card }} />
                  {i < history.length - 1 ? <View style={{ width: 2, height: 36, backgroundColor: colors.border }} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 12 }}>
                  <T size={13} weight="semibold">{lookup.tenant(l.tenantId)?.name}</T>
                  <T size={11.5} color={colors.subtext}>{fmtDate(l.start)} – {fmtDate(l.end)} · {l.id}</T>
                </View>
                <Badge label={leaseStatus(l) === 'renewed' ? 'Renewed' : leaseStatus(l) === 'active' || leaseStatus(l) === 'expiring' ? 'Current' : leaseStatus(l)} tone={leaseStatus(l) === 'renewed' ? 'neutral' : 'success'} dot />
              </Row>
            ))}
            {!history.length ? <T size={12.5} color={colors.subtext}>No tenancies recorded.</T> : null}
          </Card>
        </View>
        <View style={{ gap: 16 }}>
          <Card>
            <CardHeader title="Rent information" />
            <KV label="Annual rent" value={<T size={24} weight="bold">{naira(lease?.rent ?? unit.rent)}</T>} />
            <Grid cols={{ mobile: 2 }} gap={12} style={{ marginTop: 14 }}>
              <KV label="Service charge" value={`${naira(unit.serviceCharge)} / yr`} /><KV label="Caution deposit" value={naira(unit.deposit)} />
              <KV label="Payment cycle" value="Annually" /><KV label="Last review" value={lease ? `${fmtDate(lease.start)}` : '—'} />
            </Grid>
            <Notice tone="info" style={{ marginTop: 14 }}>Online rent collection will appear here in Phase 2.</Notice>
          </Card>
          <Card>
            <CardHeader title="Documents" right={canEdit ? <Button title="Upload" icon={Upload} size="sm" variant="secondary" onPress={() => setUploadOpen(true)} /> : null} />
            <View style={{ gap: 8 }}>
              {docs.map((d) => <FileRow key={d.id} name={d.name} kind={d.kind} meta={`${fmtDate(d.date)} · ${d.folder}`} onPress={() => openDoc(d)} />)}
              {!docs.length ? <T size={12.5} color={colors.subtext}>No documents yet.</T> : null}
            </View>
          </Card>
          <Card>
            <CardHeader title="Features" />
            <Row wrap gap={8}>{unit.features.map((f) => <Badge key={f} label={f} tone="neutral" />)}</Row>
          </Card>
        </View>
      </Grid>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title={`Edit flat ${unit.code}`} width={440} footer={<><Button title="Cancel" variant="secondary" onPress={() => setEditOpen(false)} /><Button title="Save changes" onPress={() => { updateUnit(unit.id, { rent: parseInt(rent.replace(/\D/g, ''), 10) || unit.rent, serviceCharge: parseInt(service.replace(/\D/g, ''), 10) || unit.serviceCharge, type }); setEditOpen(false); toast('Unit updated'); }} /></>}>
        <View style={{ gap: 14 }}>
          <Select label="Unit type" value={type} onChange={setType} options={UNIT_TYPES.map((t) => ({ value: t, label: t }))} />
          <Input label="Annual rent (₦)" value={rent} onChangeText={setRent} keyboardType="number-pad" hint="Changes apply to new leases and renewals." />
          <Input label="Service charge (₦/yr)" value={service} onChangeText={setService} keyboardType="number-pad" />
        </View>
      </Dialog>
      <UploadDocumentDialog open={uploadOpen} onClose={() => setUploadOpen(false)} title={`Upload for unit ${unit.code}`}
        folders={tenant ? ['Property papers', 'Lease agreements', 'Tenant ID and KYC', 'Receipts'] : ['Property papers']}
        target={{ propertyId: prop.id, tenantId: tenant?.id, linkedTo: `${prop.short} · ${unit.code}` }} />
    </Page>
  );
}

export { Table2, TriangleAlert, Divider, todayISO };
