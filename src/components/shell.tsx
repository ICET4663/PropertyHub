import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleProp, TextInput, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import {
  Activity, Bell, Building2, ChevronDown, ChevronRight, CircleHelp, FileText, Folder, Grid2x2, House, LayoutGrid, LogOut, MapPin, Megaphone,
  Menu as MenuIcon, MessageCircle, PanelLeft, Plus, Search, ShieldCheck, SlidersHorizontal, UserPlus, UserRound, Users,
  Wrench, Briefcase, ChartColumn, CircleUser, FilePlus2, WifiOff, X, ClipboardList, Contact, Ellipsis, Receipt,
} from 'lucide-react-native';
import { colors, font, shadow, useBreakpoint } from '../theme';
import { useLookup, useScope, useStore } from '../store/AppContext';
import { useChat } from '../store/ChatContext';
import { isOpen } from '../lib/workflow';
import { useRouter } from '../nav/router';
import { Avatar, Badge, Menu, T, Tabs, Touch, Select, Link, useToast } from './ui';
import { daysUntil, fmtTime, leaseStatus, todayISO } from '../utils';
import type { Role } from '../types';

// ---------------------------------------------------------------- navigation model

/** A screen shown as a tab inside a merged sidebar item (e.g. Locations inside Properties). */
interface NavChild { key: string; label: string; icon?: LucideIcon }
interface NavItem { key: string; label: string; icon: LucideIcon; badge?: number; children?: NavChild[] }
interface NavSection { title: string; items: NavItem[] }

const ROUTE_TO_NAV: Record<string, string> = {
  property: 'properties', addProperty: 'properties', unit: 'units', tenant: 'tenants', onboarding: 'tenants',
  lease: 'leases', renew: 'leases', request: 'requests', myRequest: 'myRequests',
};

const ROLE_LABEL: Record<Role, string> = { super_admin: 'Super Admin', manager: 'Property Manager', accountant: 'Accountant', caretaker: 'Caretaker', tenant: 'Tenant' };
export const roleLabel = (r: Role) => ROLE_LABEL[r];

export function homeRouteFor(role: Role): string {
  if (role === 'tenant') return 'home';
  if (role === 'caretaker') return 'jobs';
  return 'dashboard';
}

/** Roles that get the phone layout (bottom tabs) on small screens; the rest stay web-first. */
const MOBILE_ROLES: Role[] = ['tenant', 'caretaker'];

/** Screens each staff role may open (null: all). Tenants get the screens in the TENANT map of src/screens. */
const STAFF_ACCESS: Record<Exclude<Role, 'tenant'>, string[] | null> = {
  super_admin: null,
  manager: ['dashboard', 'messages', 'properties', 'locations', 'units', 'tenants', 'leases', 'payments', 'maintenance', 'requests', 'vendors', 'communications', 'reports', 'documents', 'notifications', 'logs', 'help'],
  accountant: ['dashboard', 'messages', 'properties', 'units', 'tenants', 'leases', 'payments', 'reports', 'documents', 'notifications', 'help'],
  caretaker: ['jobs', 'contacts', 'messages', 'maintenance', 'requests', 'vendors', 'units', 'notifications', 'help'],
};

function canOpen(role: Role, key: string): boolean {
  if (role === 'tenant') return true;
  const list = STAFF_ACCESS[role];
  return !list || list.includes(key);
}

function useNav(): NavSection[] {
  const { state, me, myTenant } = useStore();
  const { unreadTotal } = useChat();
  const scope = useScope();
  if (!me) return [];
  if (me.role === 'tenant') {
    const open = state.requests.filter((r) => r.tenantId === myTenant?.id && (isOpen(r) || r.status === 'resolved')).length;
    return [
      { title: 'My home', items: [
        { key: 'home', label: 'Home', icon: House },
        { key: 'messages', label: 'Messages', icon: MessageCircle, badge: unreadTotal },
        { key: 'myRequests', label: 'Requests', icon: Wrench, badge: open, children: [{ key: 'myRequests', label: 'My requests' }, { key: 'reportIssue', label: 'Report an issue' }] },
        { key: 'myLease', label: 'My Lease', icon: FileText },
      ] },
      { title: 'Account', items: [
        { key: 'myDocuments', label: 'Documents', icon: Folder },
        { key: 'profile', label: 'Profile', icon: UserRound },
      ] },
    ];
  }
  const leaseAlerts = scope.currentLeases.filter((l) => daysUntil(l.end) <= 30).length;
  const newReqs = scope.requests.filter((r) => r.status === 'new').length;
  const r = me.role;
  const myJobs = scope.requests.filter((x) => x.caretakerId === me.id && (x.status === 'assigned' || x.status === 'in_progress')).length;
  const all: NavSection[] = [
    ...(r === 'caretaker' ? [{ title: 'My work', items: [{ key: 'jobs', label: 'Today’s jobs', icon: ClipboardList, badge: myJobs }, { key: 'contacts', label: 'Property contacts', icon: Contact }] }] : []),
    { title: 'Overview', items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
      { key: 'messages', label: 'Messages', icon: MessageCircle, badge: unreadTotal, children: [{ key: 'messages', label: 'Chats' }, { key: 'communications', label: 'Announcements', icon: Megaphone }] },
    ] },
    { title: 'Manage', items: [
      { key: 'properties', label: 'Properties', icon: Building2, children: [{ key: 'properties', label: 'Properties' }, { key: 'locations', label: 'Locations', icon: MapPin }, { key: 'units', label: 'Blocks & Units', icon: Grid2x2 }] },
      { key: 'tenants', label: 'Tenants & Leases', icon: Users, badge: leaseAlerts, children: [{ key: 'tenants', label: 'Tenants' }, { key: 'leases', label: 'Leases', icon: FileText }] },
      { key: 'payments', label: 'Payments', icon: Receipt },
      { key: 'maintenance', label: 'Maintenance', icon: Wrench, badge: newReqs, children: [{ key: 'maintenance', label: 'Overview' }, { key: 'requests', label: 'Requests' }, { key: 'vendors', label: 'Vendors', icon: Briefcase }] },
    ] },
    { title: 'Insights', items: [{ key: 'reports', label: 'Reports', icon: ChartColumn }, { key: 'documents', label: 'Documents', icon: Folder }] },
    { title: 'Admin', items: [
      { key: 'settings', label: 'Settings', icon: SlidersHorizontal, children: [{ key: 'settings', label: 'General' }, { key: 'users', label: 'Users & Permissions', icon: ShieldCheck }, { key: 'logs', label: 'Activity Logs', icon: Activity }] },
    ] },
  ];
  // Keep the children this role may open. An item whose own screen is off limits opens its first allowed
  // child instead, and an item left with one child is shown as that child (a manager's Settings is Activity Logs).
  const items = (s: NavSection): NavItem[] => s.items.flatMap((it) => {
    const kids = it.children?.filter((c) => canOpen(r, c.key));
    if (!kids) return canOpen(r, it.key) ? [it] : [];
    if (!kids.length) return [];
    if (kids.length === 1) {
      const only = kids[0];
      return [only.key === it.key ? { ...it, children: undefined } : { key: only.key, label: only.label, icon: only.icon ?? it.icon, badge: it.badge }];
    }
    return [{ ...it, key: kids[0].key, children: kids }];
  });
  return all.map((s) => ({ ...s, items: items(s) })).filter((s) => s.items.length);
}

/** The sidebar item a route belongs to: itself, the merged item it is a tab of, or its list screen's item. */
function navKeyFor(nav: NavSection[], route: string): string {
  const key = ROUTE_TO_NAV[route] ?? route;
  for (const s of nav) for (const it of s.items) if (it.key === key || it.children?.some((c) => c.key === key)) return it.key;
  return key;
}

export function useCanAccess(key: string): boolean {
  const { me } = useStore();
  return !!me && canOpen(me.role, key);
}

/** Tabs across the screens merged into one sidebar item, shown at the top of each of those screens. */
export function SectionTabs({ style }: { style?: StyleProp<ViewStyle> }) {
  const nav = useNav();
  const { route, replace } = useRouter();
  const group = nav.flatMap((s) => s.items).find((it) => it.children?.some((c) => c.key === route.name));
  if (!group?.children || group.children.length < 2) return null;
  return (
    <Tabs
      value={route.name}
      onChange={(k) => replace(k)}
      tabs={group.children.map((c) => ({ value: c.key, label: c.label }))}
      style={style}
    />
  );
}

// ---------------------------------------------------------------- brand

export function Brand({ size = 'md', light = true }: { size?: 'md' | 'lg'; light?: boolean }) {
  const s = size === 'lg' ? 36 : 30;
  return (
    <View className="flex-row items-center gap-10">
      <View className="rounded-[9px] bg-accent items-center justify-center" style={{ width: s, height: s }}>
        <House size={s * 0.5} color={colors.sidebar} strokeWidth={2.2} />
      </View>
      <T size={size === 'lg' ? 19 : 16.5} weight="bold" color={light ? colors.white : colors.text} style={{ letterSpacing: -0.3 }}>
        Property<T size={size === 'lg' ? 19 : 16.5} weight="bold" color={colors.accent}>Hub</T>
      </T>
    </View>
  );
}

// ---------------------------------------------------------------- sidebar

function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const nav = useNav();
  const { route, navigate, go } = useRouter();
  const { me, myTenant } = useStore();
  const lookup = useLookup();
  const active = navKeyFor(nav, route.name);
  const insets = useSafeAreaInsets();
  if (!me) return null;
  const sub = me.role === 'tenant' && myTenant ? `Tenant · ${lookup.property(myTenant.propertyId)?.short ?? ''} ${lookup.unit(myTenant.unitId)?.code ?? ''}` : `${roleLabel(me.role)}${me.role === 'super_admin' ? ' · Landlord' : ''}`;
  return (
    <View className="flex-1 bg-sidebar" style={{ paddingTop: insets.top }}>
      <View className={`h-64 justify-center border-b border-b-sidebar-border ${collapsed ? 'px-0 items-center' : 'px-18 items-start'}`}>
        {collapsed ? <View className="w-30 h-30 rounded-[9px] bg-accent items-center justify-center"><House size={15} color={colors.sidebar} strokeWidth={2.2} /></View> : <Brand />}
      </View>
      <ScrollView className="flex-1" contentContainerClassName="px-10 py-14" showsVerticalScrollIndicator={false}>
        {nav.map((s) => (
          <View key={s.title} className="mb-8">
            {!collapsed ? <T size={10.5} weight="bold" color={colors.sidebarMuted} upper style={{ paddingHorizontal: 10, marginBottom: 4, marginTop: 4 }}>{s.title}</T> : <View className="h-8" />}
            {s.items.map((it) => {
              const on = active === it.key;
              return (
                <Touch
                  key={it.key}
                  accessibilityLabel={it.label}
                  onPress={() => { go(it.key); onNavigate?.(); }}
                  className={`flex-row items-center gap-11 h-38 rounded-[9px] mb-1 ${collapsed ? 'px-0 justify-center' : 'px-10 justify-start'} ${on ? 'bg-sidebar-raised' : ''}`}
                  hoverStyle={{ backgroundColor: on ? colors.sidebarRaised : 'rgba(255,255,255,0.04)' }}
                >
                  {on ? <View className="absolute left-0 top-8 bottom-8 w-3 rounded-[2px] bg-accent" /> : null}
                  <it.icon size={17} color={on ? colors.white : colors.sidebarText} strokeWidth={1.8} />
                  {!collapsed ? <T size={13.5} weight={on ? 'semibold' : 'medium'} color={on ? colors.white : colors.sidebarText} style={{ flex: 1 }}>{it.label}</T> : null}
                  {it.badge ? (
                    <View className={`rounded-[10px] bg-danger items-center justify-center px-5 ${collapsed ? 'absolute top-3 right-6 min-w-15 h-15' : 'min-w-19 h-19'}`}>
                      <T size={collapsed ? 9 : 10.5} weight="bold" color={colors.white} style={{ lineHeight: 13 }}>{it.badge}</T>
                    </View>
                  ) : null}
                </Touch>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View className="p-10" style={{ paddingBottom: 10 + insets.bottom }}>
        <Touch onPress={() => { navigate(me.role === 'tenant' ? 'profile' : 'account'); onNavigate?.(); }} className={`flex-row items-center gap-10 rounded-md bg-sidebar-raised ${collapsed ? 'p-6 justify-center' : 'p-10 justify-start'}`}>
          <Avatar name={me.name} size={32} tone={[colors.accent, colors.sidebar]} />
          {!collapsed ? (
            <View className="flex-1">
              <T size={13} weight="semibold" color={colors.white} numberOfLines={1}>{me.name}</T>
              <T size={11} color={colors.sidebarMuted} numberOfLines={1}>{sub}</T>
            </View>
          ) : null}
        </Touch>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- global search

function SearchBox({ compact, autoFocus, onDone }: { compact?: boolean; autoFocus?: boolean; onDone?: () => void }) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const { navigate } = useRouter();
  const scope = useScope();
  const lookup = useLookup();

  useEffect(() => {
    if (Platform.OS !== 'web' || compact) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: { key: string; group: string; title: string; sub: string; go: () => void }[] = [];
    scope.tenants.filter((t) => t.name.toLowerCase().includes(s) || t.code.toLowerCase().includes(s) || t.phone.replace(/\s/g, '').includes(s.replace(/\s/g, ''))).slice(0, 5)
      .forEach((t) => out.push({ key: t.id, group: 'Tenants', title: t.name, sub: `${t.code} · ${lookup.property(t.propertyId)?.short ?? 'No unit'} ${lookup.unit(t.unitId)?.code ?? ''}`, go: () => navigate('tenant', { id: t.id }) }));
    scope.properties.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 3)
      .forEach((p) => out.push({ key: p.id, group: 'Properties', title: p.name, sub: lookup.location(p.locationId)?.name ?? '', go: () => navigate('property', { id: p.id }) }));
    scope.units.filter((u) => `${lookup.property(u.propertyId)?.short} ${u.code}`.toLowerCase().includes(s) || u.code.toLowerCase() === s).slice(0, 4)
      .forEach((u) => out.push({ key: u.id, group: 'Units', title: `${lookup.property(u.propertyId)?.short} · ${u.code}`, sub: `${u.type} · ${u.status}`, go: () => navigate('unit', { id: u.id }) }));
    scope.leases.filter((l) => l.id.toLowerCase().includes(s)).slice(0, 3)
      .forEach((l) => out.push({ key: l.id, group: 'Leases', title: l.id, sub: `${lookup.tenant(l.tenantId)?.name} · ${leaseStatus(l)}`, go: () => navigate('lease', { id: l.id }) }));
    scope.requests.filter((r) => r.id.toLowerCase().includes(s) || r.title.toLowerCase().includes(s)).slice(0, 4)
      .forEach((r) => out.push({ key: r.id, group: 'Requests', title: `${r.id} · ${r.title}`, sub: `${lookup.property(r.propertyId)?.short} ${lookup.unit(r.unitId)?.code}`, go: () => navigate('request', { id: r.id }) }));
    return out;
  }, [q, scope, lookup, navigate]);

  const showResults = focus && q.trim().length >= 2;
  return (
    <View className={`flex-1 z-50 ${compact ? '' : 'max-w-420'}`}>
      <View className={`flex-row items-center gap-9 h-40 rounded-md border px-12 ${focus ? 'border-primary bg-card' : 'border-border bg-card-alt'}`}>
        <Search size={16} color={colors.subtext} />
        <TextInput
          ref={inputRef}
          value={q}
          onChangeText={setQ}
          autoFocus={autoFocus}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 180)}
          placeholder="Search tenants, units, leases, requests..."
          placeholderTextColor={colors.faint}
          style={[{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: colors.text, paddingVertical: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
        />
        {!compact && Platform.OS === 'web' ? <View className="border border-border rounded-[5px] px-6 py-1 bg-card"><T size={10.5} weight="semibold" color={colors.subtext}>Ctrl K</T></View> : null}
        {compact ? <Pressable onPress={onDone} hitSlop={8}><X size={17} color={colors.subtext} /></Pressable> : null}
      </View>
      {showResults ? (
        <View className="absolute top-46 left-0 right-0 bg-card rounded-md border border-border pb-6" style={shadow.pop}>
          {results.length === 0 ? <T size={13} color={colors.subtext} style={{ padding: 14 }}>No matches for “{q}”</T> : (
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {results.map((r, i) => (
                <View key={r.key}>
                  {i === 0 || results[i - 1].group !== r.group ? <T size={10.5} weight="bold" color={colors.faint} upper style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 3 }}>{r.group}</T> : null}
                  <Touch onPress={() => { r.go(); setQ(''); onDone?.(); }} className="px-14 py-8" hoverStyle={{ backgroundColor: colors.cardAlt }}>
                    <T size={13} weight="semibold" numberOfLines={1}>{r.title}</T>
                    <T size={11.5} color={colors.subtext} numberOfLines={1}>{r.sub}</T>
                  </Touch>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- topbar

function Topbar({ onToggleSidebar, mobile, tabs }: { onToggleSidebar: () => void; mobile: boolean; tabs: boolean }) {
  const { state, me, myTenant, signOut, setLocationFilter } = useStore();
  const { unreadTotal } = useChat();
  const { navigate } = useRouter();
  const lookup = useLookup();
  const { bp } = useBreakpoint();
  const [searching, setSearching] = useState(false);
  const insets = useSafeAreaInsets();
  if (!me) return null;
  const isTenant = me.role === 'tenant';
  const audience = isTenant ? myTenant?.id : 'staff';
  const unread = state.notifications.filter((n) => n.audience === audience && !n.read).length;
  const canWrite = me.role === 'super_admin' || me.role === 'manager';

  const userMenu = (open: () => void) => (
    <Touch onPress={open} className={`flex-row items-center gap-10 py-4 border-l-border ${mobile ? 'pl-4 border-l-0' : 'pl-12 border-l'}`}>
      <Avatar name={me.name} size={34} tone={[colors.accentSoft, colors.accentDeep]} />
      {bp === 'desktop' ? (
        <View>
          <T size={13} weight="semibold">{me.name}</T>
          <T size={11.5} color={colors.subtext}>{roleLabel(me.role)}</T>
        </View>
      ) : null}
      {!mobile ? <ChevronDown size={15} color={colors.subtext} /> : null}
    </Touch>
  );

  const menuItems = [
    { label: isTenant ? 'My profile' : 'My account', icon: CircleUser, onPress: () => navigate(isTenant ? 'profile' : 'account') },
    { label: 'Messages', icon: MessageCircle, onPress: () => navigate('messages') },
    { label: 'Notifications', icon: Bell, onPress: () => navigate(isTenant ? 'myNotifications' : 'notifications') },
    { label: 'Help & Support', icon: CircleHelp, onPress: () => navigate('help') },
    { label: 'Sign out', icon: LogOut, danger: true, onPress: signOut },
  ];

  if (mobile && searching) {
    return (
      <View className={`${TOPBAR} px-12`} style={{ paddingTop: insets.top, height: 60 + insets.top }}>
        <SearchBox compact autoFocus onDone={() => setSearching(false)} />
      </View>
    );
  }

  return (
    <View className={`${TOPBAR} ${mobile ? 'px-10 gap-4' : 'px-20 gap-12'}`} style={{ paddingTop: insets.top, height: (mobile ? 60 : 64) + insets.top }}>
      {tabs ? <View className="w-6" /> : (
        <Touch onPress={onToggleSidebar} accessibilityLabel={mobile ? 'Open menu' : 'Collapse or expand the sidebar'} className="w-36 h-36 rounded-sm items-center justify-center" hoverStyle={{ backgroundColor: colors.neutralSoft }}>
          {mobile ? <MenuIcon size={21} color={colors.text} /> : <PanelLeft size={19} color={colors.textSoft} strokeWidth={1.8} />}
        </Touch>
      )}
      {mobile ? (
        <View className="flex-1"><Brand light={false} /></View>
      ) : isTenant ? (
        <View className="flex-1 flex-row">
          <View className="flex-row items-center gap-9 border border-border rounded-md px-12 py-5 bg-card-alt">
            <House size={15} color={colors.subtext} />
            <View>
              <T size={10.5} color={colors.subtext} style={{ lineHeight: 12 }}>Your home</T>
              <T size={12.5} weight="semibold" style={{ lineHeight: 16 }}>{lookup.property(myTenant?.propertyId)?.short ?? 'Awaiting allocation'}{myTenant?.unitId ? `, Flat ${lookup.unit(myTenant.unitId)?.code} · ${lookup.location(lookup.property(myTenant.propertyId)?.locationId)?.name}` : ''}</T>
            </View>
          </View>
        </View>
      ) : (
        <>
          <SearchBox />
          {bp === 'desktop' && (me.role === 'super_admin' || me.role === 'accountant') ? (
            <Select
              compact
              value={state.locationFilter ?? 'all'}
              onChange={(v) => setLocationFilter(v === 'all' ? null : v)}
              options={[{ value: 'all', label: 'All locations' }, ...state.locations.map((l) => ({ value: l.id, label: l.name, sub: l.city }))]}
              prefix=""
              style={{ minWidth: 190, backgroundColor: colors.cardAlt }}
            />
          ) : null}
          <View className="flex-1" />
          {canWrite ? (
            <Menu
              width={240}
              header="Quick add"
              trigger={(open) => (
                <Touch onPress={open} className="flex-row items-center gap-7 h-40 px-14 rounded-md bg-primary" hoverStyle={{ backgroundColor: colors.primaryHover }}>
                  <Plus size={16} color={colors.white} strokeWidth={2.2} />
                  {bp === 'desktop' ? <T size={13.5} weight="semibold" color={colors.white}>Quick Add</T> : null}
                  <ChevronDown size={14} color={colors.white} />
                </Touch>
              )}
              items={[
                { label: 'Add Property', icon: Building2, onPress: () => navigate('addProperty') },
                { label: 'Add Location', icon: MapPin, onPress: () => navigate('locations', { create: '1' }) },
                { label: 'Add Unit', icon: Grid2x2, onPress: () => navigate('units', { add: '1' }) },
                { label: 'Add Tenant', icon: UserPlus, onPress: () => navigate('onboarding') },
                { label: 'Create Lease', icon: FilePlus2, onPress: () => navigate('onboarding') },
                { label: 'Create Maintenance Request', icon: Wrench, onPress: () => navigate('requests', { create: '1' }) },
                { label: 'Send Announcement', icon: Megaphone, onPress: () => navigate('communications') },
              ]}
            />
          ) : null}
        </>
      )}
      {mobile && !isTenant ? <IconBtn icon={Search} label="Search" onPress={() => setSearching(true)} /> : null}
      {!tabs ? <IconBtn icon={MessageCircle} label="Messages" badge={unreadTotal} onPress={() => navigate('messages')} /> : null}
      <IconBtn icon={Bell} label="Notifications" badge={unread} onPress={() => navigate(isTenant ? 'myNotifications' : 'notifications')} />
      {!mobile ? <IconBtn icon={SlidersHorizontal} label={isTenant ? 'Profile' : me.role === 'super_admin' ? 'Settings' : 'Help'} onPress={() => navigate(isTenant ? 'profile' : me.role === 'super_admin' ? 'settings' : 'help')} /> : null}
      <Menu trigger={userMenu} items={menuItems} width={220} />
    </View>
  );
}

function IconBtn({ icon: Icon, badge, onPress, label }: { icon: LucideIcon; badge?: number; onPress: () => void; label: string }) {
  return (
    <Touch onPress={onPress} accessibilityLabel={badge ? `${label}, ${badge} new` : label} className="w-38 h-38 rounded-md items-center justify-center" hoverStyle={{ backgroundColor: colors.neutralSoft }}>
      <Icon size={19} color={colors.textSoft} strokeWidth={1.8} />
      {badge ? (
        <View className={`absolute top-3 right-2 ${COUNT_DOT}`}>
          <T size={9.5} weight="bold" color={colors.white} style={{ lineHeight: 12 }}>{badge > 99 ? '99+' : badge}</T>
        </View>
      ) : null}
    </Touch>
  );
}

// ---------------------------------------------------------------- live status

/** Shown under the top bar while the live feed is down: what's on screen may be out of date. */
function OfflineBanner() {
  const { live } = useStore();
  if (live.connection !== 'offline') return null;
  return (
    <View accessibilityRole="alert" className="flex-row items-center gap-9 px-16 py-9 bg-warning-soft border-b border-b-warning/25">
      <WifiOff size={16} color={colors.warning} />
      <T size={12.5} weight="medium" style={{ flex: 1 }}>
        You’re offline{live.updatedAt ? `. Showing updates up to ${fmtTime(live.updatedAt)}` : ''}. Changes won’t save until you reconnect.
      </T>
    </View>
  );
}

/** "Live · updated 10:42" beside the title of screens that follow requests as they change. */
export function LiveTag() {
  const { live } = useStore();
  if (live.connection === 'offline') return <Badge label="Offline" tone="warning" dot size="sm" />;
  if (live.connection === 'connecting' || !live.updatedAt) return <Badge label="Connecting…" tone="neutral" dot size="sm" />;
  return <Badge label={`Live · updated ${fmtTime(live.updatedAt)}`} tone="success" dot size="sm" />;
}

// ---------------------------------------------------------------- shell

// ---------------------------------------------------------------- bottom tabs (phones)

interface Tab { key: string; label: string; icon: LucideIcon; badge?: number; raised?: boolean }

/** Set while the bottom tabs are on screen; they already pad for the home indicator. */
const TabsShown = createContext(false);

function useTabs(): Tab[] {
  const { state, me, myTenant } = useStore();
  const { unreadTotal } = useChat();
  const scope = useScope();
  if (!me) return [];
  if (me.role === 'tenant') {
    const toConfirm = state.requests.filter((r) => r.tenantId === myTenant?.id && r.status === 'resolved').length;
    return [
      { key: 'home', label: 'Home', icon: House },
      { key: 'myRequests', label: 'Requests', icon: Wrench, badge: toConfirm },
      { key: 'reportIssue', label: 'Report', icon: Plus, raised: true },
      { key: 'messages', label: 'Chats', icon: MessageCircle, badge: unreadTotal },
    ];
  }
  const today = todayISO();
  const due = scope.requests.filter((r) => r.caretakerId === me.id && r.status === 'assigned' && (r.visit?.date ?? today) <= today).length;
  return [
    { key: 'jobs', label: 'Jobs', icon: ClipboardList, badge: due },
    { key: 'requests', label: 'Requests', icon: Wrench },
    { key: 'messages', label: 'Chats', icon: MessageCircle, badge: unreadTotal },
    { key: 'contacts', label: 'Contacts', icon: Contact },
  ];
}

function BottomTabs({ onMore }: { onMore: () => void }) {
  const tabs = useTabs();
  const { route, go } = useRouter();
  const insets = useSafeAreaInsets();
  // A tab of its own beats the sidebar grouping (caretakers have a Requests tab; the sidebar files it under Maintenance).
  const active = tabs.some((t) => t.key === route.name) ? route.name : ROUTE_TO_NAV[route.name] ?? route.name;
  const item = (t: Tab, on: boolean, onPress: () => void) => (
    <Pressable key={t.key} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }}
      accessibilityLabel={t.badge ? `${t.label}, ${t.badge} waiting` : t.label}
      className="flex-1 items-center justify-center gap-3 min-h-56">
      {t.raised ? (
        <View className="w-42 h-42 rounded-[21px] bg-primary items-center justify-center -mt-10" style={shadow.pop}>
          <t.icon size={22} color={colors.white} strokeWidth={2.2} />
        </View>
      ) : (
        <View>
          <t.icon size={22} color={on ? colors.primary : colors.subtext} strokeWidth={on ? 2.1 : 1.8} />
          {t.badge ? (
            <View className={`absolute -top-5 -right-9 ${COUNT_DOT}`}>
              <T size={9.5} weight="bold" color={colors.white} style={{ lineHeight: 12 }}>{t.badge > 99 ? '99+' : t.badge}</T>
            </View>
          ) : null}
        </View>
      )}
      <T size={11} weight={on ? 'semibold' : 'medium'} color={on ? colors.primary : colors.subtext}>{t.label}</T>
    </Pressable>
  );
  return (
    <View accessibilityRole="tablist" className="flex-row bg-card border-t border-t-border px-4" style={{ paddingBottom: insets.bottom }}>
      {tabs.map((t) => item(t, active === t.key, () => go(t.key)))}
      {item({ key: 'more', label: 'More', icon: Ellipsis }, !tabs.some((t) => t.key === active), onMore)}
    </View>
  );
}

// ---------------------------------------------------------------- shell

export function AppShell({ children }: { children: React.ReactNode }) {
  const { bp } = useBreakpoint();
  const { me } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const { route } = useRouter();
  const overlay = bp !== 'desktop';
  const tabs = bp === 'mobile' && !!me && MOBILE_ROLES.includes(me.role);
  const routeKey = JSON.stringify(route);
  const [previousRoute, setPreviousRoute] = useState(routeKey);
  if (previousRoute !== routeKey) { setPreviousRoute(routeKey); setDrawer(false); }
  return (
    <View className="flex-1 flex-row bg-bg">
      {!overlay ? <View className={collapsed ? 'w-72' : 'w-244'}><Sidebar collapsed={collapsed} /></View> : null}
      <View className="flex-1">
        <Topbar mobile={bp === 'mobile'} tabs={tabs} onToggleSidebar={() => (overlay ? setDrawer(true) : setCollapsed((c) => !c))} />
        <OfflineBanner />
        <TabsShown.Provider value={tabs}>
          <View className="flex-1 z-1">{children}</View>
        </TabsShown.Provider>
        {tabs ? <BottomTabs onMore={() => setDrawer(true)} /> : null}
      </View>
      {overlay ? (
        <Modal transparent visible={drawer} animationType="fade" onRequestClose={() => setDrawer(false)}>
          <View className="flex-1 flex-row">
            <View className="w-272"><Sidebar collapsed={false} onNavigate={() => setDrawer(false)} /></View>
            <Pressable className="flex-1 bg-overlay" onPress={() => setDrawer(false)} accessibilityLabel="Close menu" />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- page scaffolding

export interface Crumb { label: string; to?: string; params?: Record<string, string> }

/** Pull down to reload from the server (phones; browsers have their own refresh). */
function usePullToRefresh() {
  const { refresh } = useStore();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  if (Platform.OS === 'web') return undefined;
  const onRefresh = async () => {
    setRefreshing(true);
    const ok = await refresh();
    setRefreshing(false);
    if (!ok) toast('Can’t reach the server. Showing what was last loaded.', 'danger');
  };
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />;
}

export function Page({ children, maxWidth, style, footer }: { children: React.ReactNode; maxWidth?: number; style?: StyleProp<ViewStyle>; footer?: React.ReactNode }) {
  const { isMobile } = useBreakpoint();
  const refreshControl = usePullToRefresh();
  // Android resizes the window for the keyboard by itself; iOS needs the padding.
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[{ padding: isMobile ? 16 : 28, paddingBottom: 48 }, style]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshControl={refreshControl}>
        <View className="w-full self-center" style={{ maxWidth: maxWidth ?? 1480 }}>{children}</View>
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

export function PageHeader({ crumbs, title, subtitle, actions, badge }: { crumbs?: Crumb[]; title: string; subtitle?: string; actions?: React.ReactNode; badge?: React.ReactNode }) {
  const { navigate } = useRouter();
  const { isMobile } = useBreakpoint();
  return (
    <View className={title || actions ? 'mb-22' : 'mb-12'}>
      <SectionTabs style={{ marginBottom: 16 }} />
      {crumbs?.length ? (
        <View className="flex-row items-center gap-6 mb-6 flex-wrap">
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <T size={12.5} color={colors.faint}>/</T> : null}
              {c.to ? <Link size={12.5} weight="medium" color={colors.subtext} onPress={() => navigate(c.to!, c.params)}>{c.label}</Link> : <T size={12.5} weight="semibold" color={colors.text}>{c.label}</T>}
            </React.Fragment>
          ))}
        </View>
      ) : null}
      {title || actions ? <View className={`justify-between gap-14 ${isMobile ? 'flex-col items-start' : 'flex-row items-end'}`}>
        <View className="shrink">
          <View className="flex-row items-center gap-10 flex-wrap">
            <T size={isMobile ? 22 : 26} weight="bold" style={{ letterSpacing: -0.4 }}>{title}</T>
            {badge}
          </View>
          {subtitle ? <T size={13} color={colors.subtext} style={{ marginTop: 3 }}>{subtitle}</T> : null}
        </View>
        {actions ? <View className="flex-row gap-10 flex-wrap items-center">{actions}</View> : null}
      </View> : null}
    </View>
  );
}

export function StickyFooter({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const tabs = useContext(TabsShown);
  return (
    <View className="border-t border-t-border bg-card px-20 pt-12 flex-row items-center gap-10" style={{ paddingBottom: 12 + (tabs ? 0 : insets.bottom) }}>
      {children}
    </View>
  );
}

export { ChevronRight };

const TOPBAR = 'flex-row items-center bg-card border-b border-b-border z-20';
// Red count bubble on the top-bar icons and bottom tabs
const COUNT_DOT = 'min-w-17 h-17 rounded-[9px] bg-danger items-center justify-center px-4 border-2 border-card';

