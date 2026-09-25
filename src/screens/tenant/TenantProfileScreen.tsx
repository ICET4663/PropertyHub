import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Card, Badge, Avatar, Button } from '../../components/ui';
import { formatDate, leaseStatus, leaseDaysLeft, currentPeriod } from '../../utils';

export default function TenantProfileScreen() {
  const t = useTheme();
  const { state, currentUser, signOut } = useStore();

  const tenant = state.tenants.find((tn) => tn.id === currentUser?.tenantId);
  if (!tenant) return null;

  const unit = state.units.find((u) => u.id === tenant.unitId);
  const prop = state.properties.find((p) => p.id === tenant.propertyId);
  const lease = state.leases.find((l) => l.tenantId === tenant.id && !l.terminated);
  const period = currentPeriod();
  const payment = state.payments.find((p) => p.tenantId === tenant.id && p.period === period);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.colors.text, letterSpacing: -0.5, marginBottom: spacing.lg }}>Profile</Text>

        <Card style={{ alignItems: 'center' }}>
          <Avatar name={tenant.name} color={tenant.avatarColor} size={72} />
          <Text style={{ fontSize: 19, fontWeight: '800', color: t.colors.text, marginTop: spacing.sm }}>{tenant.name}</Text>
          <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2 }}>{tenant.occupation}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <Badge label={tenant.status === 'active' ? 'Active tenant' : 'Former'} color={tenant.status === 'active' ? t.colors.success : t.colors.subtext} bg={tenant.status === 'active' ? t.colors.successSoft : t.colors.inputBg} />
            {payment && <Badge label={`Rent ${payment.status}`} color={payment.status === 'paid' ? t.colors.success : payment.status === 'overdue' ? t.colors.danger : t.colors.warning} bg={payment.status === 'paid' ? t.colors.successSoft : payment.status === 'overdue' ? t.colors.dangerSoft : t.colors.warningSoft} />}
          </View>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>Contact</Text>
          <Row icon="mail" label="Email" value={tenant.email} />
          <Row icon="call" label="Phone" value={tenant.phone} />
          <Row icon="home" label="Unit" value={`${unit?.unitNumber} · ${unit?.type}`} />
          <Row icon="business" label="Property" value={prop?.name ?? '—'} last />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>Tenancy</Text>
          <Row icon="calendar" label="Joined" value={formatDate(tenant.joinedAt)} />
          <Row icon="document" label="Lease end" value={lease?.endDate ?? '—'} />
          <Row icon="cash" label="Rent" value={`${unit?.rent?.toLocaleString() ?? 0}/mo`} />
          <Row icon="shield" label="Deposit" value={`${(lease?.deposit ?? unit?.rent ?? 0).toLocaleString()}`} last />
        </Card>

        <Button title="Switch role / sign out" icon="log-out" variant="danger" style={{ marginTop: spacing.lg }} onPress={() => signOut()} />

        <Text style={{ textAlign: 'center', fontSize: 11, color: t.colors.subtext, marginTop: spacing.xl }}>
          EstateHub PMS v1.0.0 · Tenant Portal
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, value, last }: { icon: any; label: string; value: string; last?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: spacing.sm, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.colors.border }}>
      <Ionicons name={icon} size={15} color={t.colors.subtext} />
      <Text style={{ fontSize: 13, color: t.colors.subtext, width: 92 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.text, flex: 1 }} numberOfLines={1}>{value}</Text>
    </View>
  );
}
