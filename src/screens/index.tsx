/**
 * Which screen each route name shows, and to whom. The files in src/app only call authRoute() or
 * appRoute(), so the access rules stay here in one place.
 */
import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useStore } from '../store/AppContext';
import { hrefFor } from '../nav/router';
import { homeRouteFor, useCanAccess } from '../components/shell';
import * as Auth from './auth';
import DashboardScreen from './staff/Dashboard';
import { AddPropertyScreen, PropertiesScreen, PropertyDetailScreen } from './staff/Properties';
import { BlocksUnitsScreen, LocationsScreen, UnitDetailScreen } from './staff/Portfolio';
import { MyAccountScreen } from './staff/Account';
import { OnboardingScreen, TenantProfileScreen, TenantsScreen } from './staff/Tenants';
import { LeaseDetailScreen, LeasesScreen, RenewLeaseScreen } from './staff/Leases';
import { MaintenanceOverviewScreen, RequestDetailScreen, RequestsScreen, VendorsScreen } from './staff/Maintenance';
import { ContactsScreen, JobsScreen } from './staff/Caretaker';
import { PaymentsScreen } from './staff/Payments';
import { MessagesScreen } from './Messages';
import {
  ActivityLogsScreen, CommunicationsScreen, DocumentsScreen, HelpScreen, NotificationsScreen, ReportsScreen, SettingsScreen, UsersScreen,
} from './staff/Admin';
import {
  MyLeaseScreen, MyRequestsScreen, ReportIssueScreen, TenantDocumentsScreen, TenantHomeScreen, TenantNotificationsScreen, TenantProfileSelfScreen,
} from './tenant/Portal';

const AUTH: Record<string, React.ComponentType> = {
  signIn: Auth.SignInScreen,
  signUp: Auth.SignUpScreen,
  verifyCode: Auth.VerifyCodeScreen,
  accountReady: Auth.AccountReadyScreen,
  forgot: Auth.ForgotScreen,
  reset: Auth.ResetScreen,
  resetDone: Auth.ResetDoneScreen,
  twoStep: Auth.TwoStepScreen,
};

/** Signed-in screens get the `id` route param; screens that don't need it ignore it. */
type AppScreen = React.ComponentType<{ id: string }>;

const STAFF: Record<string, AppScreen> = {
  dashboard: DashboardScreen,
  properties: PropertiesScreen,
  property: PropertyDetailScreen,
  addProperty: AddPropertyScreen,
  locations: LocationsScreen,
  units: BlocksUnitsScreen,
  unit: UnitDetailScreen,
  tenants: TenantsScreen,
  tenant: TenantProfileScreen,
  onboarding: OnboardingScreen,
  leases: LeasesScreen,
  lease: LeaseDetailScreen,
  renew: RenewLeaseScreen,
  payments: PaymentsScreen,
  maintenance: MaintenanceOverviewScreen,
  requests: RequestsScreen,
  request: RequestDetailScreen,
  vendors: VendorsScreen,
  jobs: JobsScreen,
  contacts: ContactsScreen,
  messages: MessagesScreen,
  communications: CommunicationsScreen,
  reports: ReportsScreen,
  documents: DocumentsScreen,
  notifications: NotificationsScreen,
  users: UsersScreen,
  logs: ActivityLogsScreen,
  settings: SettingsScreen,
  help: HelpScreen,
  account: MyAccountScreen,
};

const TENANT: Record<string, AppScreen> = {
  home: TenantHomeScreen,
  myLease: MyLeaseScreen,
  myRequests: MyRequestsScreen,
  reportIssue: ReportIssueScreen,
  myNotifications: TenantNotificationsScreen,
  profile: TenantProfileSelfScreen,
  account: TenantProfileSelfScreen, // same place for every role's "my account" link
  myDocuments: TenantDocumentsScreen,
  messages: MessagesScreen,
  help: HelpScreen,
};

/** Nav key used to check permission for a detail route. */
const PERMISSION_KEY: Record<string, string> = {
  property: 'properties', addProperty: 'properties', unit: 'units', tenant: 'tenants', onboarding: 'tenants',
  lease: 'leases', renew: 'leases', request: 'maintenance', requests: 'maintenance',
  account: 'help', // every staff role has Help, and everyone may manage their own account
};

/** A screen behind sign-in, for some role. */
export function isAppRoute(name: string): boolean {
  return name in STAFF || name in TENANT;
}

/** A sign-in screen. Stack.Protected in src/app/_layout.tsx keeps signed-in users out. */
export function authRoute(name: string): React.ComponentType {
  return AUTH[name];
}

/**
 * A signed-in screen: the tenant or staff version for this account's role, or back to the role's home
 * screen when the role may not open it. Stack.Protected in src/app/_layout.tsx keeps signed-out users out.
 */
export function appRoute(name: string): React.ComponentType {
  function AppRoute() {
    const { me } = useStore();
    const { id } = useLocalSearchParams<{ id?: string }>();
    const allowed = useCanAccess(PERMISSION_KEY[name] ?? name);
    if (!me) return null;
    const Screen = (me.role === 'tenant' ? TENANT : STAFF)[name];
    if (!Screen || !allowed) return <Redirect href={hrefFor(homeRouteFor(me.role))} />;
    return <Screen id={id ?? ''} />;
  }
  AppRoute.displayName = `AppRoute(${name})`;
  return AppRoute;
}

