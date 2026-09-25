import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useStore } from '../store/AppContext';

import RoleSelectScreen from '../screens/auth/RoleSelectScreen';
import DashboardScreen from '../screens/admin/DashboardScreen';
import PropertiesScreen from '../screens/admin/PropertiesScreen';
import PropertyDetailScreen from '../screens/admin/PropertyDetailScreen';
import TenantsScreen from '../screens/admin/TenantsScreen';
import TenantDetailScreen from '../screens/admin/TenantDetailScreen';
import TenantOnboardingScreen from '../screens/admin/TenantOnboardingScreen';
import MaintenanceScreen from '../screens/admin/MaintenanceScreen';
import MaintenanceDetailScreen from '../screens/admin/MaintenanceDetailScreen';
import LeasesScreen from '../screens/admin/LeasesScreen';
import LeaseDetailScreen from '../screens/admin/LeaseDetailScreen';
import ReportsScreen from '../screens/admin/ReportsScreen';
import MessagesScreen from '../screens/admin/MessagesScreen';
import MessageThreadScreen from '../screens/admin/MessageThreadScreen';
import ActivityLogScreen from '../screens/admin/ActivityLogScreen';
import MoreScreen from '../screens/admin/MoreScreen';

import TenantHomeScreen from '../screens/tenant/TenantHomeScreen';
import NewRequestScreen from '../screens/tenant/NewRequestScreen';
import TenantLeaseScreen from '../screens/tenant/TenantLeaseScreen';
import TenantProfileScreen from '../screens/tenant/TenantProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const screenOptions = {
  headerShown: false,
  animation: 'slide_from_right' as const,
};

function AdminTabs() {
  const t = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.subtext,
        tabBarStyle: {
          backgroundColor: t.colors.tabBar,
          borderTopColor: t.colors.border,
          height: 84,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, focused }) => {
          const icons: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
            Dashboard: ['grid', 'grid-outline'],
            Properties: ['business', 'business-outline'],
            Tenants: ['people', 'people-outline'],
            Maintenance: ['construct', 'construct-outline'],
            More: ['menu', 'menu-outline'],
          };
          const [active, inactive] = icons[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? active : inactive} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Properties" component={PropertiesScreen} />
      <Tab.Screen name="Tenants" component={TenantsScreen} />
      <Tab.Screen name="Maintenance" component={MaintenanceScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

function TenantTabs() {
  const t = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.subtext,
        tabBarStyle: {
          backgroundColor: t.colors.tabBar,
          borderTopColor: t.colors.border,
          height: 84,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, focused }) => {
          const icons: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
            Home: ['home', 'home-outline'],
            Maintenance: ['construct', 'construct-outline'],
            Lease: ['document-text', 'document-text-outline'],
            Messages: ['chatbubbles', 'chatbubbles-outline'],
            Profile: ['person', 'person-outline'],
          };
          const [active, inactive] = icons[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? active : inactive} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={TenantHomeScreen} />
      <Tab.Screen name="Maintenance" component={MaintenanceScreen} />
      <Tab.Screen name="Lease" component={TenantLeaseScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Profile" component={TenantProfileScreen} />
    </Tab.Navigator>
  );
}

function AdminStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="AdminTabs" component={AdminTabs} />
      <Stack.Screen name="PropertyDetail" component={PropertyDetailScreen} />
      <Stack.Screen name="TenantDetail" component={TenantDetailScreen} />
      <Stack.Screen name="Onboarding" component={TenantOnboardingScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="MaintenanceDetail" component={MaintenanceDetailScreen} />
      <Stack.Screen name="LeaseDetail" component={LeaseDetailScreen} />
      <Stack.Screen name="Leases" component={LeasesScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="Messages" component={MessagesScreen} />
      <Stack.Screen name="MessageThread" component={MessageThreadScreen} />
      <Stack.Screen name="ActivityLog" component={ActivityLogScreen} />
    </Stack.Navigator>
  );
}

function TenantStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="TenantTabs" component={TenantTabs} />
      <Stack.Screen name="NewRequest" component={NewRequestScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="MaintenanceDetail" component={MaintenanceDetailScreen} />
      <Stack.Screen name="MessageThread" component={MessageThreadScreen} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { state, currentUser } = useStore();
  const t = useTheme();

  if (!state.hydrated) return null;

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, contentStyle: { backgroundColor: t.colors.bg } }}>
      {!currentUser ? (
        <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
      ) : currentUser.role === 'tenant' ? (
        <Stack.Screen name="TenantApp" component={TenantStack} />
      ) : (
        <Stack.Screen name="AdminApp" component={AdminStack} />
      )}
    </Stack.Navigator>
  );
}
