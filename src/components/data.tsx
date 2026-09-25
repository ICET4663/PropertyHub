import React from 'react';
import { ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { ChevronLeft, ChevronRight, FileText, Image as ImageIcon, File } from 'lucide-react-native';
import { colors, radius, useBreakpoint } from '../theme';
import type { LeaseStatus, Priority, RequestStatus, UnitStatus, TenantStatus } from '../types';
import { Badge, Checkbox, T, Touch } from './ui';
import type { Tone } from './ui';

export interface Column<R> {
  key: string;
  title: string;
  flex?: number;
  min?: number; // min width in px
  align?: 'left' | 'right' | 'center';
  render: (row: R, index: number) => React.ReactNode;
}

export function DataTable<R>({ columns, rows, keyOf, onRowPress, selectable, selected, onToggle, onToggleAll, empty, footerRow, rowStyle, dense, style }: {
  columns: Column<R>[]; rows: R[]; keyOf: (r: R) => string; onRowPress?: (r: R) => void;
  selectable?: boolean; selected?: Set<string>; onToggle?: (key: string) => void; onToggleAll?: (all: boolean) => void;
  empty?: React.ReactNode; footerRow?: React.ReactNode; rowStyle?: (r: R) => StyleProp<ViewStyle>; dense?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { width } = useBreakpoint();
  const minTotal = columns.reduce((s, c) => s + (c.min ?? 110), 0) + (selectable ? 44 : 0);
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selected?.has(keyOf(r)));
  const cell = (c: Column<R>): ViewStyle => ({ flex: c.flex ?? 1, minWidth: c.min ?? 110, paddingHorizontal: 12, alignItems: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start', justifyContent: 'center' });
  const table = (
    <View style={{ minWidth: minTotal, flex: 1 }}>
      <View style={{ flexDirection: 'row', backgroundColor: colors.cardAlt, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 10 }}>
        {selectable ? <View style={{ width: 44, alignItems: 'center', justifyContent: 'center' }}><Checkbox checked={!!allSelected} onChange={(v) => onToggleAll?.(v)} /></View> : null}
        {columns.map((c) => (
          <View key={c.key} style={cell(c)}>
            <T size={10.5} weight="bold" color={colors.subtext} upper numberOfLines={1}>{c.title}</T>
          </View>
        ))}
      </View>
      {rows.length === 0 ? empty : rows.map((r, i) => {
        const k = keyOf(r);
        const content = (
          <>
            {selectable ? <View style={{ width: 44, alignItems: 'center', justifyContent: 'center' }}><Checkbox checked={!!selected?.has(k)} onChange={() => onToggle?.(k)} /></View> : null}
            {columns.map((c) => <View key={c.key} style={cell(c)}>{c.render(r, i)}</View>)}
          </>
        );
        const base: StyleProp<ViewStyle> = [{ flexDirection: 'row', paddingVertical: dense ? 9 : 12, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' }, selected?.has(k) && { backgroundColor: colors.primaryTint }, rowStyle?.(r)];
        return onRowPress
          ? <Touch key={k} onPress={() => onRowPress(r)} style={base} hoverStyle={{ backgroundColor: colors.cardAlt }}>{content}</Touch>
          : <View key={k} style={base}>{content}</View>;
      })}
      {footerRow}
    </View>
  );
  if (width < minTotal + 320) {
    return <ScrollView horizontal showsHorizontalScrollIndicator style={style} contentContainerStyle={{ flexGrow: 1 }}>{table}</ScrollView>;
  }
  return <View style={style}>{table}</View>;
}

export function Pagination({ page, pages, onPage, label }: { page: number; pages: number; onPage: (p: number) => void; label?: string }) {
  const nums: Array<number | '…'> = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  const Btn = ({ children, onPress, active, disabled }: { children: React.ReactNode; onPress?: () => void; active?: boolean; disabled?: boolean }) => (
    <Touch disabled={disabled} onPress={onPress} style={{ minWidth: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.primary : 'transparent', opacity: disabled ? 0.35 : 1, paddingHorizontal: 6 }} hoverStyle={{ backgroundColor: active ? colors.primary : colors.neutralSoft }}>
      {children}
    </Touch>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap', gap: 10 }}>
      <T size={12} color={colors.subtext}>{label}</T>
      {pages > 1 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Btn disabled={page === 1} onPress={() => onPage(page - 1)}><ChevronLeft size={15} color={colors.textSoft} /></Btn>
          {nums.map((n, i) => n === '…'
            ? <T key={`e${i}`} size={12} color={colors.subtext} style={{ paddingHorizontal: 4 }}>…</T>
            : <Btn key={n} active={n === page} onPress={() => onPage(n)}><T size={12} weight="semibold" color={n === page ? colors.white : colors.textSoft}>{n}</T></Btn>)}
          <Btn disabled={page === pages} onPress={() => onPage(page + 1)}><ChevronRight size={15} color={colors.textSoft} /></Btn>
        </View>
      ) : null}
    </View>
  );
}

export function usePaged<R>(rows: R[], perPage: number, resetKey: string) {
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [resetKey]);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const p = Math.min(page, pages);
  return { page: p, pages, setPage, slice: rows.slice((p - 1) * perPage, p * perPage), from: rows.length ? (p - 1) * perPage + 1 : 0, to: Math.min(rows.length, p * perPage) };
}

// ---------------------------------------------------------------- status badges

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  urgent: { label: 'Urgent', tone: 'dangerSolid' },
  high: { label: 'High', tone: 'danger' },
  medium: { label: 'Medium', tone: 'warning' },
  low: { label: 'Low', tone: 'neutral' },
};
export const PriorityBadge = ({ p }: { p: Priority }) => <Badge label={PRIORITY[p].label} tone={PRIORITY[p].tone} dot={p !== 'urgent'} />;

export const REQ_STATUS: Record<RequestStatus, { label: string; tone: Tone }> = {
  new: { label: 'New', tone: 'info' },
  assigned: { label: 'Assigned', tone: 'purple' },
  in_progress: { label: 'In progress', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};
export const RequestStatusBadge = ({ s }: { s: RequestStatus }) => <Badge label={REQ_STATUS[s].label} tone={REQ_STATUS[s].tone} dot />;

export const LEASE_STATUS: Record<LeaseStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  expiring: { label: 'Expiring soon', tone: 'warning' },
  expired: { label: 'Expired', tone: 'danger' },
  terminated: { label: 'Terminated', tone: 'neutral' },
  renewed: { label: 'Renewed', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'info' },
};
export const LeaseBadge = ({ s }: { s: LeaseStatus }) => <Badge label={LEASE_STATUS[s].label} tone={LEASE_STATUS[s].tone} dot />;

export const UNIT_STATUS: Record<UnitStatus, { label: string; tone: Tone; color: string }> = {
  occupied: { label: 'Occupied', tone: 'success', color: colors.vizOccupied },
  vacant: { label: 'Vacant', tone: 'info', color: colors.vizVacant },
  maintenance: { label: 'Maintenance', tone: 'warning', color: colors.vizMaint },
};
export const UnitBadge = ({ s }: { s: UnitStatus }) => <Badge label={UNIT_STATUS[s].label} tone={UNIT_STATUS[s].tone} dot />;

export const TENANT_STATUS: Record<TenantStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  pending: { label: 'Pending approval', tone: 'warning' },
  deactivated: { label: 'Deactivated', tone: 'neutral' },
  former: { label: 'Moved out', tone: 'neutral' },
};

export function DaysBadge({ days }: { days: number }) {
  if (days < 0) return <Badge label={`Expired ${-days} day${days === -1 ? '' : 's'} ago`} tone="danger" dot />;
  if (days <= 30) return <Badge label={`${days} days`} tone="warning" dot />;
  if (days <= 90) return <Badge label={`${days} days`} tone="accent" dot />;
  return <Badge label={`${days} days`} tone="success" dot />;
}

export function FileIcon({ kind, size = 30 }: { kind: 'pdf' | 'jpg' | 'doc'; size?: number }) {
  const cfg = kind === 'pdf' ? { bg: colors.dangerSoft, fg: colors.danger, I: FileText, t: 'PDF' } : kind === 'jpg' ? { bg: colors.infoSoft, fg: colors.info, I: ImageIcon, t: 'JPG' } : { bg: colors.primarySoft, fg: colors.primary, I: File, t: 'DOC' };
  return (
    <View style={{ width: size, height: size, borderRadius: 7, backgroundColor: cfg.bg, alignItems: 'center', justifyContent: 'center' }}>
      <T size={8.5} weight="bold" color={cfg.fg}>{cfg.t}</T>
    </View>
  );
}

export function FileRow({ name, meta, kind, right, onPress }: { name: string; meta: string; kind: 'pdf' | 'jpg' | 'doc'; right?: React.ReactNode; onPress?: () => void }) {
  return (
    <Touch onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, backgroundColor: colors.card }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
      <FileIcon kind={kind} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={12.5} weight="semibold" numberOfLines={1}>{name}</T>
        <T size={11} color={colors.subtext} numberOfLines={1}>{meta}</T>
      </View>
      {right}
    </Touch>
  );
}
