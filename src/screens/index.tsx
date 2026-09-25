import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useStore } from '../store/AppContext';
import { useRouter } from '../nav/router';
import { AppShell, homeRouteFor, useCanAccess } from '../components/shell';
import * as Auth from './auth';
import DashboardScreen from './staff/Dashboard';
import { AddPropertyScreen, PropertiesScreen, PropertyDetailScreen } from './staff/Properties';
import { BlocksUnitsScreen, LocationsScreen, UnitDetailScreen } from './staff/Portfolio';
import { OnboardingScreen, TenantProfileScreen, TenantsScreen } from './staff/Tenants';
import { LeaseDetailScreen, LeasesScreen, RenewLeaseScreen } from './staff/Leases';
import { MaintenanceOverviewScreen, RequestDetailScreen, RequestsScreen, VendorsScreen } from './staff/Maintenance';
import {
  ActivityLogsScreen, CommunicationsScreen, DocumentsScreen, HelpScreen, NotificationsScreen, ReportsScreen, SettingsScreen, UsersScreen,
} from './staff/Admin';
import {
  MyLeaseScreen, MyRequestsScreen, ReportIssueScreen, TenantDocumentsScreen, TenantHomeScreen, TenantNotificationsScreen, TenantProfileSelfScreen,
} from './tenant/Portal';

const AUTH: Record<string, React.ComponentType> = {
  signIn: Auth.SignInScreen,
  signUp: Auth.SignUpScreen,
  verify: Auth.VerifyScreen,
  verifyCode: Auth.VerifyCodeScreen,
  accountReady: Auth.AccountReadyScreen,
  forgot: Auth.ForgotScreen,
  reset: Auth.ResetScreen,
  resetDone: Auth.ResetDoneScreen,
  twoStep: Auth.TwoStepScreen,
};

/** Screens that take an `id` route param. */
function withId(C: React.ComponentType<{ id: string }>) {
  return function WithId() {
    const { route } = useRouter();
    return <C id={route.params.id ?? ''} />;
  };
}

const STAFF: Record<string, React.ComponentType> = {
  dashboard: DashboardScreen,
  properties: PropertiesScreen,
  property: withId(PropertyDetailScreen),
  addProperty: AddPropertyScreen,
  locations: LocationsScreen,
  units: BlocksUnitsScreen,
  unit: withId(UnitDetailScreen),
  tenants: TenantsScreen,
  tenant: withId(TenantProfileScreen),
  onboarding: OnboardingScreen,
  leases: LeasesScreen,
  lease: withId(LeaseDetailScreen),
  renew: withId(RenewLeaseScreen),
  maintenance: MaintenanceOverviewScreen,
  requests: RequestsScreen,
  request: withId(RequestDetailScreen),
  vendors: VendorsScreen,
  communications: CommunicationsScreen,
  reports: ReportsScreen,
  documents: DocumentsScreen,
  notifications: NotificationsScreen,
  users: UsersScreen,
  logs: ActivityLogsScreen,
  settings: SettingsScreen,
  help: HelpScreen,
};

const TENANT: Record<string, React.ComponentType> = {
  home: TenantHomeScreen,
  myLease: MyLeaseScreen,
  myRequests: MyRequestsScreen,
  reportIssue: ReportIssueScreen,
  myNotifications: TenantNotificationsScreen,
  profile: TenantProfileSelfScreen,
  myDocuments: TenantDocumentsScreen,
  help: HelpScreen,
};

/** Nav key used to check permission for a detail route. */
const PERMISSION_KEY: Record<string, string> = {
  property: 'properties', addProperty: 'properties', unit: 'units', tenant: 'tenants', onboarding: 'tenants',
  lease: 'leases', renew: 'leases', request: 'maintenance', requests: 'maintenance',
};

export function AppRoutes() {
  const { me } = useStore();
  const { route, replace } = useRouter();
  const table = me ? (me.role === 'tenant' ? TENANT : STAFF) : AUTH;
  const allowed = useCanAccess(PERMISSION_KEY[route.name] ?? route.name);
  const Screen = table[route.name];
  const ok = !!Screen && (!me || allowed);

  useEffect(() => {
    if (!ok) replace(me ? homeRouteFor(me.role) : 'signIn');
  }, [ok, me, replace]);

  if (!me) return Screen ? <Screen /> : <View />;
  return <AppShell>{ok ? <Screen key={JSON.stringify(route)} /> : <View />}</AppShell>;
}
