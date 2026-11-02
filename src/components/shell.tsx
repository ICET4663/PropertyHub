import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleProp, StyleSheet, TextInput, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import {
  Activity, Bell, Building2, ChevronDown, ChevronRight, CircleHelp, FileText, Folder, Grid2x2, House, LayoutGrid, LogOut, MapPin, Megaphone,
  Menu as MenuIcon, MessageCircle, PanelLeft, Plus, Search, ShieldCheck, SlidersHorizontal, UserPlus, UserRound, Users,
  Wrench, Briefcase, ChartColumn, CircleUser, FilePlus2, WifiOff, X, ClipboardList, Contact, Ellipsis, Receipt,
} from 'lucide-react-native';
import { colors, font, radius, shadow, useBreakpoint } from '../theme';
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: s, height: s, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
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
    <View style={{ flex: 1, backgroundColor: colors.sidebar, paddingTop: insets.top }}>
      <View style={{ height: 64, paddingHorizontal: collapsed ? 0 : 18, justifyContent: 'center', alignItems: collapsed ? 'center' : 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.sidebarBorder }}>
        {collapsed ? <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}><House size={15} color={colors.sidebar} strokeWidth={2.2} /></View> : <Brand />}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: collapsed ? 10 : 10, paddingVertical: 14 }} showsVerticalScrollIndicator={false}>
        {nav.map((s) => (
          <View key={s.title} style={{ marginBottom: 8 }}>
            {!collapsed ? <T size={10.5} weight="bold" color={colors.sidebarMuted} upper style={{ paddingHorizontal: 10, marginBottom: 4, marginTop: 4 }}>{s.title}</T> : <View style={{ height: 8 }} />}
            {s.items.map((it) => {
              const on = active === it.key;
              return (
                <Touch
                  key={it.key}
                  accessibilityLabel={it.label}
                  onPress={() => { go(it.key); onNavigate?.(); }}
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 11, height: 38, paddingHorizontal: collapsed ? 0 : 10, justifyContent: collapsed ? 'center' : 'flex-start', borderRadius: radius.sm + 1, marginBottom: 1 }, on && { backgroundColor: colors.sidebarRaised }]}
                  hoverStyle={{ backgroundColor: on ? colors.sidebarRaised : 'rgba(255,255,255,0.04)' }}
                >
                  {on ? <View style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, backgroundColor: colors.accent }} /> : null}
                  <it.icon size={17} color={on ? colors.white : colors.sidebarText} strokeWidth={1.8} />
                  {!collapsed ? <T size={13.5} weight={on ? 'semibold' : 'medium'} color={on ? colors.white : colors.sidebarText} style={{ flex: 1 }}>{it.label}</T> : null}
                  {it.badge ? (
                    <View style={[{ minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }, collapsed && { position: 'absolute', top: 3, right: 6, minWidth: 15, height: 15 }]}>
                      <T size={collapsed ? 9 : 10.5} weight="bold" color={colors.white} style={{ lineHeight: 13 }}>{it.badge}</T>
                    </View>
                  ) : null}
                </Touch>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={{ padding: 10, paddingBottom: 10 + insets.bottom }}>
        <Touch onPress={() => { navigate(me.role === 'tenant' ? 'profile' : 'account'); onNavigate?.(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: collapsed ? 6 : 10, borderRadius: radius.md, backgroundColor: colors.sidebarRaised, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <Avatar name={me.name} size={32} tone={[colors.accent, colors.sidebar]} />
          {!collapsed ? (
            <View style={{ flex: 1 }}>
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
    <View style={{ flex: 1, maxWidth: compact ? undefined : 420, zIndex: 50 }}>
      <View style={[styles.search, focus && { borderColor: colors.primary, backgroundColor: colors.card }]}>
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
        {!compact && Platform.OS === 'web' ? <View style={styles.kbd}><T size={10.5} weight="semibold" color={colors.subtext}>Ctrl K</T></View> : null}
        {compact ? <Pressable onPress={onDone} hitSlop={8}><X size={17} color={colors.subtext} /></Pressable> : null}
      </View>
      {showResults ? (
        <View style={[styles.results]}>
          {results.length === 0 ? <T size={13} color={colors.subtext} style={{ padding: 14 }}>No matches for “{q}”</T> : (
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {results.map((r, i) => (
                <View key={r.key}>
                  {i === 0 || results[i - 1].group !== r.group ? <T size={10.5} weight="bold" color={colors.faint} upper style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 3 }}>{r.group}</T> : null}
                  <Touch onPress={() => { r.go(); setQ(''); onDone?.(); }} style={{ paddingHorizontal: 14, paddingVertical: 8 }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
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
    <Touch onPress={open} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: mobile ? 4 : 12, paddingVertical: 4, borderLeftWidth: mobile ? 0 : 1, borderLeftColor: colors.border }}>
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
      <View style={[styles.topbar, { paddingTop: insets.top, height: 60 + insets.top, paddingHorizontal: 12 }]}>
        <SearchBox compact autoFocus onDone={() => setSearching(false)} />
      </View>
    );
  }

  return (
    <View style={[styles.topbar, { paddingTop: insets.top, height: (mobile ? 60 : 64) + insets.top, paddingHorizontal: mobile ? 10 : 20, gap: mobile ? 4 : 12 }]}>
      {tabs ? <View style={{ width: 6 }} /> : (
        <Touch onPress={onToggleSidebar} accessibilityLabel={mobile ? 'Open menu' : 'Collapse or expand the sidebar'} style={{ width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }} hoverStyle={{ backgroundColor: colors.neutralSoft }}>
          {mobile ? <MenuIcon size={21} color={colors.text} /> : <PanelLeft size={19} color={colors.textSoft} strokeWidth={1.8} />}
        </Touch>
      )}
      {mobile ? (
        <View style={{ flex: 1 }}><Brand light={false} /></View>
      ) : isTenant ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={styles.homePill}>
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
          <View style={{ flex: 1 }} />
          {canWrite ? (
            <Menu
              width={240}
              header="Quick add"
              trigger={(open) => (
                <Touch onPress={open} style={styles.quickAdd} hoverStyle={{ backgroundColor: colors.primaryHover }}>
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
    <Touch onPress={onPress} accessibilityLabel={badge ? `${label}, ${badge} new` : label} style={{ width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }} hoverStyle={{ backgroundColor: colors.neutralSoft }}>
      <Icon size={19} color={colors.textSoft} strokeWidth={1.8} />
      {badge ? (
        <View style={{ position: 'absolute', top: 3, right: 2, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.card }}>
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
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: colors.warningSoft, borderBottomWidth: 1, borderBottomColor: colors.warning + '40' }}>
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
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 56 }}>
      {t.raised ? (
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: -10, ...shadow.pop }}>
          <t.icon size={22} color={colors.white} strokeWidth={2.2} />
        </View>
      ) : (
        <View>
          <t.icon size={22} color={on ? colors.primary : colors.subtext} strokeWidth={on ? 2.1 : 1.8} />
          {t.badge ? (
            <View style={{ position: 'absolute', top: -5, right: -9, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.card }}>
              <T size={9.5} weight="bold" color={colors.white} style={{ lineHeight: 12 }}>{t.badge > 99 ? '99+' : t.badge}</T>
            </View>
          ) : null}
        </View>
      )}
      <T size={11} weight={on ? 'semibold' : 'medium'} color={on ? colors.primary : colors.subtext}>{t.label}</T>
    </Pressable>
  );
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: insets.bottom, paddingHorizontal: 4 }}>
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
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      {!overlay ? <View style={{ width: collapsed ? 72 : 244 }}><Sidebar collapsed={collapsed} /></View> : null}
      <View style={{ flex: 1 }}>
        <Topbar mobile={bp === 'mobile'} tabs={tabs} onToggleSidebar={() => (overlay ? setDrawer(true) : setCollapsed((c) => !c))} />
        <OfflineBanner />
        <TabsShown.Provider value={tabs}>
          <View style={{ flex: 1, zIndex: 1 }}>{children}</View>
        </TabsShown.Provider>
        {tabs ? <BottomTabs onMore={() => setDrawer(true)} /> : null}
      </View>
      {overlay ? (
        <Modal transparent visible={drawer} animationType="fade" onRequestClose={() => setDrawer(false)}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ width: 272 }}><Sidebar collapsed={false} onNavigate={() => setDrawer(false)} /></View>
            <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={() => setDrawer(false)} accessibilityLabel="Close menu" />
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
        <View style={{ width: '100%', maxWidth: maxWidth ?? 1480, alignSelf: 'center' }}>{children}</View>
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

export function PageHeader({ crumbs, title, subtitle, actions, badge }: { crumbs?: Crumb[]; title: string; subtitle?: string; actions?: React.ReactNode; badge?: React.ReactNode }) {
  const { navigate } = useRouter();
  const { isMobile } = useBreakpoint();
  return (
    <View style={{ marginBottom: title || actions ? 22 : 12 }}>
      <SectionTabs style={{ marginBottom: 16 }} />
      {crumbs?.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <T size={12.5} color={colors.faint}>/</T> : null}
              {c.to ? <Link size={12.5} weight="medium" color={colors.subtext} onPress={() => navigate(c.to!, c.params)}>{c.label}</Link> : <T size={12.5} weight="semibold" color={colors.text}>{c.label}</T>}
            </React.Fragment>
          ))}
        </View>
      ) : null}
      {title || actions ? <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'flex-end', justifyContent: 'space-between', gap: 14 }}>
        <View style={{ flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <T size={isMobile ? 22 : 26} weight="bold" style={{ letterSpacing: -0.4 }}>{title}</T>
            {badge}
          </View>
          {subtitle ? <T size={13} color={colors.subtext} style={{ marginTop: 3 }}>{subtitle}</T> : null}
        </View>
        {actions ? <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</View> : null}
      </View> : null}
    </View>
  );
}

export function StickyFooter({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const tabs = useContext(TabsShown);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 + (tabs ? 0 : insets.bottom), flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {children}
    </View>
  );
}

export { ChevronRight };

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 20 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: 12 },
  kbd: { borderWidth: 1, borderColor: colors.border, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: colors.card },
  results: { position: 'absolute', top: 46, left: 0, right: 0, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingBottom: 6, ...shadow.pop },
  quickAdd: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.primary },
  homePill: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.cardAlt },
});
