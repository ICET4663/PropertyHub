import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Card, Avatar, Badge } from '../../components/ui';

export default function MoreScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { state, currentUser, signOut, resetAll } = useStore();

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'super_admin';
  const isManager = currentUser.role === 'manager';

  const menu: { icon: any; label: string; desc: string; onPress: () => void; show: boolean }[] = [
    { icon: 'analytics', label: 'Reports & analytics', desc: 'Occupancy, rent, maintenance reports', onPress: () => nav.navigate('Reports'), show: isAdmin || isManager },
    { icon: 'chatbubbles', label: 'Messages', desc: 'Communicate with tenants', onPress: () => nav.navigate('Messages'), show: isAdmin || isManager },
    { icon: 'time', label: 'Activity log', desc: 'Audit trail of platform events', onPress: () => nav.navigate('ActivityLog'), show: isAdmin || isManager },
    { icon: 'shield-checkmark', label: 'Security & session', desc: 'Role-based access control active', onPress: () => Alert.alert('Security', 'Role-based access control is enforced. Your session is scoped to your role:\n\n• Super Admin — full platform access\n• Property Manager — assigned properties only\n• Tenant — own tenancy only'), show: true },
    { icon: 'refresh-circle', label: 'Reset demo data', desc: 'Restore the original dataset', onPress: () => Alert.alert('Reset data', 'This will restore the original demo dataset and sign you out.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => { resetAll(); } },
    ]), show: true },
    { icon: 'swap-horizontal', label: 'Switch role', desc: 'Sign out and choose another profile', onPress: () => signOut(), show: true },
    { icon: 'information-circle', label: 'About EstateHub', desc: 'Version 1.0.0 · MVP scope', onPress: () => Alert.alert('EstateHub PMS', 'Property Management System v1.0.0\n\nMVP scope: 7 blocks across 5 locations.\n\nRoadmap: online rent payments, service charge collection, visitor management, accounting integration.'), show: true },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.colors.text, letterSpacing: -0.5, marginBottom: spacing.lg }}>More</Text>

        {/* Profile card */}
        <Card style={{ alignItems: 'center' }}>
          <Avatar name={currentUser.name} color={currentUser.avatarColor} size={64} />
          <Text style={{ fontSize: 17, fontWeight: '800', color: t.colors.text, marginTop: spacing.sm }}>{currentUser.name}</Text>
          <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2 }}>{currentUser.title}</Text>
          <View style={{ marginTop: spacing.sm }}>
            <Badge
              label={currentUser.role === 'super_admin' ? 'Super Admin' : currentUser.role === 'manager' ? 'Property Manager' : 'Tenant'}
              color={t.colors.primary} bg={t.colors.primarySoft}
              icon="shield-checkmark"
            />
          </View>
        </Card>

        {/* Menu */}
        <Card style={{ marginTop: spacing.md, paddingVertical: spacing.xs }}>
          {menu.filter((m) => m.show).map((m, i, arr) => (
            <TouchableOpacity
              key={m.label}
              onPress={m.onPress}
              style={[styles.menuRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: t.colors.border }]}
            >
              <View style={[styles.menuIcon, { backgroundColor: t.colors.primarySoft }]}>
                <Ionicons name={m.icon} size={17} color={t.colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: t.colors.text }}>{m.label}</Text>
                <Text style={{ fontSize: 12, color: t.colors.subtext, marginTop: 1 }}>{m.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={t.colors.subtext} />
            </TouchableOpacity>
          ))}
        </Card>

        <Text style={{ textAlign: 'center', fontSize: 11, color: t.colors.subtext, marginTop: spacing.xl }}>
          EstateHub PMS v1.0.0 · React Native + Expo · Node.js/.NET-ready backend · PostgreSQL/Azure-ready
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  menuRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: spacing.md },
  menuIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
};
