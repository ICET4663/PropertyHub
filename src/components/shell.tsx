import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet, TextInput, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import {
  Activity, Bell, Building2, ChevronDown, ChevronRight, CircleHelp, FileText, Folder, Grid2x2, House, LayoutGrid, LogOut, MapPin, Megaphone,
  Menu as MenuIcon, MessageSquare, PanelLeft, Plus, Search, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, UserPlus, UserRound, Users,
  Wrench, Briefcase, ChartColumn, CircleUser, FilePlus2, X,
} from 'lucide-react-native';
import { colors, font, radius, shadow, useBreakpoint } from '../theme';
import { useLookup, useScope, useStore } from '../store/AppContext';
import { useRouter } from '../nav/router';
import { Avatar, Menu, T, Touch, Select, Link } from './ui';
import { daysUntil, leaseStatus } from '../utils';
import type { Role } from '../types';

// ---------------------------------------------------------------- navigation model

interface NavItem { key: string; label: string; icon: LucideIcon; badge?: number; indent?: boolean }
interface NavSection { title: string; items: NavItem[] }

const ROUTE_TO_NAV: Record<string, string> = {
  property: 'properties', addProperty: 'properties', unit: 'units', tenant: 'tenants', onboarding: 'tenants',
  lease: 'leases', renew: 'leases', request: 'requests', requests: 'maintenance', myRequest: 'myRequests',
};

const ROLE_LABEL: Record<Role, string> = { super_admin: 'Super Admin', manager: 'Property Manager', accountant: 'Accountant', caretaker: 'Caretaker', tenant: 'Tenant' };
export const roleLabel = (r: Role) => ROLE_LABEL[r];

export function homeRouteFor(role: Role): string {
  if (role === 'tenant') return 'home';
  if (role === 'caretaker') return 'maintenance';
  return 'dashboard';
}

function useNav(): NavSection[] {
  const { state, me, myTenant } = useStore();
  const scope = useScope();
  if (!me) return [];
  if (me.role === 'tenant') {
    const open = state.requests.filter((r) => r.tenantId === myTenant?.id && r.status !== 'closed').length;
    const unread = state.notifications.filter((n) => n.audience === myTenant?.id && !n.read).length;
    return [
      { title: 'My home', items: [
        { key: 'home', label: 'Home', icon: House },
        { key: 'myLease', label: 'My Lease', icon: FileText, indent: false },
        { key: 'myRequests', label: 'My Requests', icon: Wrench, badge: open },
        { key: 'reportIssue', label: 'Report an Issue', icon: Plus },
      ] },
      { title: 'Account', items: [
        { key: 'myDocuments', label: 'Documents', icon: Folder },
        { key: 'myNotifications', label: 'Notifications', icon: Bell, badge: unread },
        { key: 'profile', label: 'Profile', icon: UserRound },
        { key: 'help', label: 'Help & Support', icon: CircleHelp },
      ] },
    ];
  }
  const leaseAlerts = scope.currentLeases.filter((l) => daysUntil(l.end) <= 30).length;
  const newReqs = scope.requests.filter((r) => r.status === 'new').length;
  const unread = state.notifications.filter((n) => n.audience === 'staff' && !n.read).length;
  const r = me.role;
  const all: NavSection[] = [
    { title: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutGrid }] },
    { title: 'Portfolio', items: [{ key: 'properties', label: 'Properties', icon: Building2 }, { key: 'locations', label: 'Locations', icon: MapPin }, { key: 'units', label: 'Blocks & Units', icon: Grid2x2 }] },
    { title: 'People', items: [{ key: 'tenants', label: 'Tenants', icon: Users }, { key: 'leases', label: 'Leases', icon: FileText, badge: leaseAlerts }] },
    { title: 'Operations', items: [{ key: 'maintenance', label: 'Maintenance', icon: Wrench, badge: newReqs }, { key: 'vendors', label: 'Vendors', icon: Briefcase }, { key: 'communications', label: 'Communications', icon: Megaphone }] },
    { title: 'Insights', items: [{ key: 'reports', label: 'Reports', icon: ChartColumn }, { key: 'documents', label: 'Documents', icon: Folder }, { key: 'notifications', label: 'Notifications', icon: Bell, badge: unread }] },
    { title: 'Administration', items: [{ key: 'users', label: 'Users & Permissions', icon: ShieldCheck }, { key: 'logs', label: 'Activity Logs', icon: Activity }, { key: 'settings', label: 'Settings', icon: SlidersHorizontal }, { key: 'help', label: 'Help & Support', icon: CircleHelp }] },
  ];
  const allow: Record<Exclude<Role, 'tenant'>, string[] | null> = {
    super_admin: null,
    manager: ['dashboard', 'properties', 'locations', 'units', 'tenants', 'leases', 'maintenance', 'vendors', 'communications', 'reports', 'documents', 'notifications', 'logs', 'help'],
    accountant: ['dashboard', 'properties', 'units', 'tenants', 'leases', 'reports', 'documents', 'notifications', 'help'],
    caretaker: ['maintenance', 'vendors', 'units', 'notifications', 'help'],
  };
  const list = allow[r as Exclude<Role, 'tenant'>];
  return all.map((s) => ({ ...s, items: s.items.filter((i) => !list || list.includes(i.key)) })).filter((s) => s.items.length);
}

export function useCanAccess(key: string): boolean {
  const nav = useNav();
  return nav.some((s) => s.items.some((i) => i.key === key));
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
  const { route, navigate } = useRouter();
  const { me, myTenant } = useStore();
  const lookup = useLookup();
  const active = ROUTE_TO_NAV[route.name] ?? route.name;
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
                  onPress={() => { navigate(it.key); onNavigate?.(); }}
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
        <Touch onPress={() => { navigate(me.role === 'tenant' ? 'profile' : 'settings'); onNavigate?.(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: collapsed ? 6 : 10, borderRadius: radius.md, backgroundColor: colors.sidebarRaised, justifyContent: collapsed ? 'center' : 'flex-start' }}>
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
    const out: Array<{ key: string; group: string; title: string; sub: string; go: () => void }> = [];
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

function Topbar({ onToggleSidebar, mobile }: { onToggleSidebar: () => void; mobile: boolean }) {
  const { state, me, myTenant, signOut, setLocationFilter } = useStore();
  const { navigate } = useRouter();
  const scope = useScope();
  const lookup = useLookup();
  const { bp } = useBreakpoint();
  const [searching, setSearching] = useState(false);
  const insets = useSafeAreaInsets();
  if (!me) return null;
  const isTenant = me.role === 'tenant';
  const audience = isTenant ? myTenant?.id : 'staff';
  const unread = state.notifications.filter((n) => n.audience === audience && !n.read).length;
  const newReqs = isTenant ? 0 : scope.requests.filter((r) => r.status === 'new').length;
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
    { label: isTenant ? 'My profile' : 'Account settings', icon: CircleUser, onPress: () => navigate(isTenant ? 'profile' : 'settings') },
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
      <Touch onPress={onToggleSidebar} accessibilityLabel="Toggle navigation" style={{ width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }} hoverStyle={{ backgroundColor: colors.neutralSoft }}>
        {mobile ? <MenuIcon size={21} color={colors.text} /> : <PanelLeft size={19} color={colors.textSoft} strokeWidth={1.8} />}
      </Touch>
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
      {mobile && !isTenant ? <IconBtn icon={Search} onPress={() => setSearching(true)} /> : null}
      {!mobile ? <IconBtn icon={MessageSquare} badge={isTenant ? 0 : newReqs} onPress={() => navigate(isTenant ? 'myRequests' : 'requests')} /> : null}
      <IconBtn icon={Bell} badge={unread} onPress={() => navigate(isTenant ? 'myNotifications' : 'notifications')} />
      {!mobile ? <IconBtn icon={SlidersHorizontal} onPress={() => navigate(isTenant ? 'profile' : me.role === 'super_admin' ? 'settings' : 'help')} /> : null}
      <Menu trigger={userMenu} items={menuItems} width={220} />
    </View>
  );
}

function IconBtn({ icon: Icon, badge, onPress }: { icon: LucideIcon; badge?: number; onPress: () => void }) {
  return (
    <Touch onPress={onPress} style={{ width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }} hoverStyle={{ backgroundColor: colors.neutralSoft }}>
      <Icon size={19} color={colors.textSoft} strokeWidth={1.8} />
      {badge ? (
        <View style={{ position: 'absolute', top: 3, right: 2, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.card }}>
          <T size={9.5} weight="bold" color={colors.white} style={{ lineHeight: 12 }}>{badge > 99 ? '99+' : badge}</T>
        </View>
      ) : null}
    </Touch>
  );
}

// ---------------------------------------------------------------- shell

export function AppShell({ children }: { children: React.ReactNode }) {
  const { bp } = useBreakpoint();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const { route } = useRouter();
  const overlay = bp !== 'desktop';
  useEffect(() => setDrawer(false), [route]);
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      {!overlay ? <View style={{ width: collapsed ? 72 : 244 }}><Sidebar collapsed={collapsed} /></View> : null}
      <View style={{ flex: 1 }}>
        <Topbar mobile={bp === 'mobile'} onToggleSidebar={() => (overlay ? setDrawer(true) : setCollapsed((c) => !c))} />
        <View style={{ flex: 1, zIndex: 1 }}>{children}</View>
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

export function Page({ children, maxWidth, style, footer }: { children: React.ReactNode; maxWidth?: number; style?: StyleProp<ViewStyle>; footer?: React.ReactNode }) {
  const { isMobile } = useBreakpoint();
  const ref = useRef<ScrollView>(null);
  const { route } = useRouter();
  useEffect(() => { ref.current?.scrollTo({ y: 0, animated: false }); }, [route]);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={ref} style={{ flex: 1 }} contentContainerStyle={[{ padding: isMobile ? 16 : 28, paddingBottom: 48 }, style]} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: maxWidth ?? 1480, alignSelf: 'center' }}>{children}</View>
      </ScrollView>
      {footer}
    </View>
  );
}

export function PageHeader({ crumbs, title, subtitle, actions, badge }: { crumbs?: Crumb[]; title: string; subtitle?: string; actions?: React.ReactNode; badge?: React.ReactNode }) {
  const { navigate } = useRouter();
  const { isMobile } = useBreakpoint();
  return (
    <View style={{ marginBottom: title || actions ? 22 : 12 }}>
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
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 + insets.bottom, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
