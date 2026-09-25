import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Avatar, SearchBar } from '../../components/ui';
import { Role } from '../../types';

export default function RoleSelectScreen() {
  const t = useTheme();
  const { state, signIn } = useStore();
  const [role, setRole] = useState<Role | null>(null);
  const [tenantQuery, setTenantQuery] = useState('');

  const tenantUsers = useMemo(
    () => state.users.filter((u) => u.role === 'tenant'),
    [state.users]
  );
  const managers = useMemo(() => state.users.filter((u) => u.role === 'manager'), [state.users]);
  const filteredTenants = tenantUsers.filter(
    (u) => u.name.toLowerCase().includes(tenantQuery.toLowerCase()) || u.email.toLowerCase().includes(tenantQuery.toLowerCase())
  );

  const roles: { role: Role; title: string; desc: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
    { role: 'super_admin', title: 'Super Admin / Landlord', desc: 'Full access — properties, tenants, leases, reports', icon: 'shield-checkmark', color: '#0B2545' },
    { role: 'manager', title: 'Property Manager', desc: 'Manage assigned properties & maintenance', icon: 'briefcase', color: '#1E9E6A' },
    { role: 'tenant', title: 'Tenant', desc: 'View tenancy, raise requests, message landlord', icon: 'person', color: '#E8A33D' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 }}>
        {/* Brand */}
        <View style={{ alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.xxl }}>
          <View style={[styles.logo, { backgroundColor: t.colors.primary }]}>
            <Ionicons name="business" size={34} color="#fff" />
          </View>
          <Text style={[styles.appName, { color: t.colors.text }]}>EstateHub</Text>
          <Text style={[styles.tagline, { color: t.colors.subtext }]}>Property Management System</Text>
          <View style={[styles.portfolioPill, { backgroundColor: t.colors.primarySoft }]}>
            <Ionicons name="layers" size={12} color={t.colors.primary} />
            <Text style={{ color: t.colors.primary, fontSize: 12, fontWeight: '700', marginLeft: 6 }}>
              7 Blocks · 5 Locations · 102 Units
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: t.colors.text }]}>Sign in as</Text>
        {roles.map((r) => (
          <TouchableOpacity
            key={r.role}
            activeOpacity={0.8}
            onPress={() => {
              if (r.role === 'super_admin') {
                signIn('u-admin');
              } else {
                setRole(role === r.role ? null : r.role);
              }
            }}
            style={[styles.roleCard, { backgroundColor: t.colors.card, borderColor: role === r.role ? r.color : t.colors.border }]}
          >
            <View style={[styles.roleIcon, { backgroundColor: r.color + '1A' }]}>
              <Ionicons name={r.icon} size={22} color={r.color} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.colors.text }}>{r.title}</Text>
              <Text style={{ fontSize: 12, color: t.colors.subtext, marginTop: 2 }}>{r.desc}</Text>
            </View>
            <Ionicons
              name={role === r.role ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={t.colors.subtext}
            />
          </TouchableOpacity>
        ))}

        {/* Manager picker */}
        {role === 'manager' && (
          <View style={[styles.picker, { backgroundColor: t.colors.card, borderColor: t.colors.border }]}>
            <Text style={[styles.pickerTitle, { color: t.colors.subtext }]}>Select manager profile</Text>
            {state.users.filter((u) => u.role === 'manager').map((m) => (
              <TouchableOpacity key={m.id} style={styles.pickerRow} onPress={() => signIn(m.id)}>
                <Avatar name={m.name} color={m.avatarColor} size={38} />
                <View style={{ marginLeft: spacing.md, flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: t.colors.text }}>{m.name}</Text>
                  <Text style={{ fontSize: 12, color: t.colors.subtext }}>{m.title}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={t.colors.subtext} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Tenant picker */}
        {role === 'tenant' && (
          <View style={[styles.picker, { backgroundColor: t.colors.card, borderColor: t.colors.border }]}>
            <Text style={[styles.pickerTitle, { color: t.colors.subtext }]}>Select tenant profile (demo)</Text>
            <View style={{ marginBottom: spacing.sm }}>
              <SearchBar value="" onChangeText={() => {}} placeholder="Search tenants..." />
            </View>
            {state.users.filter((u) => u.role === 'tenant').slice(0, 6).map((u) => {
              const tenant = state.tenants.find((tn) => tn.id === u.tenantId);
              const unit = tenant ? state.units.find((un) => un.id === tenant.unitId) : null;
              return (
                <TouchableOpacity key={u.id} style={styles.pickerRow} onPress={() => signIn(u.id)}>
                  <Avatar name={u.name} color={u.avatarColor} size={38} />
                  <View style={{ marginLeft: spacing.md, flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: t.colors.text }}>{u.name}</Text>
                    <Text style={{ fontSize: 12, color: t.colors.subtext }}>
                      {unit?.unitNumber ?? 'N/A'} · {state.properties.find((p) => p.id === unit?.propertyId)?.name ?? ''}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={t.colors.subtext} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={{ textAlign: 'center', color: t.colors.subtext, fontSize: 12, marginTop: spacing.xl }}>
          Demo build — tap a profile to sign in. No password required.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  appName: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: spacing.md },
  tagline: { fontSize: 14, marginTop: 2 },
  portfolioPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginTop: spacing.md,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: spacing.md, marginTop: spacing.sm },
  roleCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1.5, padding: spacing.md, marginBottom: spacing.sm,
  },
  roleIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  picker: { borderRadius: 16, borderWidth: 1, padding: spacing.md, marginTop: spacing.sm, marginBottom: spacing.md },
  pickerTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  pickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
});
