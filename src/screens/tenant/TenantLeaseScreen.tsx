import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Card, Badge, Avatar, ProgressBar } from '../../components/ui';
import { formatDate, formatNGN, leaseStatus, leaseDaysLeft, currentPeriod, timeAgo } from '../../utils';

export default function TenantLeaseScreen() {
  const t = useTheme();
  const { state, currentUser } = useStore();

  const tenant = state.tenants.find((tn) => tn.id === currentUser?.tenantId);
  if (!tenant) return null;

  const unit = state.units.find((u) => u.id === tenant.unitId);
  const prop = state.properties.find((p) => p.id === tenant.propertyId);
  const lease = state.leases.find((l) => l.tenantId === tenant.id && !l.terminated);
  const payments = state.payments.filter((p) => p.tenantId === tenant.id).slice(0, 6);

  const st = lease ? leaseStatus(lease) : null;
  const days = lease ? leaseDaysLeft(lease) : 0;
  const color = st === 'active' ? t.colors.success : st === 'expiring' ? t.colors.warning : t.colors.danger;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.colors.text, letterSpacing: -0.5, marginBottom: spacing.lg }}>My tenancy</Text>

        {/* Lease card */}
        {lease && (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text }}>Lease</Text>
              <Badge label={st ?? '—'} color={color} bg={color + '1A'} />
            </View>
            <Row icon="home" label="Unit" value={`${unit?.unitNumber} · ${unit?.type}`} />
            <Row icon="business" label="Property" value={prop?.name ?? '—'} />
            <Row icon="calendar" label="Started" value={formatDate(lease.startDate)} />
            <Row icon="flag" label="Ends" value={formatDate(lease.endDate)} />
            <Row icon="cash" label="Rent" value={`${formatNGN(lease.rent)}/mo`} />
            <Row icon="shield" label="Deposit" value={formatNGN(lease.deposit)} last />
            <View style={{ marginTop: spacing.sm }}>
              <ProgressBar progress={Math.max(0, Math.min(1, days / 365))} color={color} height={6} />
              <Text style={{ fontSize: 11, color: t.colors.subtext, marginTop: 5 }}>
                {days >= 0 ? `${days} days remaining` : `Expired ${Math.abs(days)} days ago — contact admin to renew`}
              </Text>
            </View>
          </Card>
        )}

        {/* Payment history */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text, marginBottom: spacing.sm }}>Rent history</Text>
          {payments.length === 0 && <Text style={{ fontSize: 13, color: t.colors.subtext }}>No payments recorded yet.</Text>}
          {payments.map((p, i) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < payments.length - 1 ? 1 : 0, borderBottomColor: t.colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.text }}>{p.period}</Text>
                <Text style={{ fontSize: 11, color: t.colors.subtext }}>{p.method ?? '—'}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.text, marginRight: spacing.sm }}>{formatNGN(p.amount)}</Text>
              <Badge
                label={p.status}
                color={p.status === 'paid' ? t.colors.success : p.status === 'overdue' ? t.colors.danger : t.colors.warning}
                bg={p.status === 'paid' ? t.colors.successSoft : p.status === 'overdue' ? t.colors.dangerSoft : t.colors.warningSoft}
              />
            </View>
          ))}
        </Card>

        {/* Emergency contact */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text, marginBottom: spacing.sm }}>Emergency contact</Text>
          <Row icon="person" label="Name" value={tenant.emergencyContact.name} />
          <Row icon="call" label="Phone" value={tenant.emergencyContact.phone} />
          <Row icon="heart" label="Relationship" value={tenant.emergencyContact.relationship} last />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, value, last }: { icon: any; label: string; value: string; last?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: spacing.sm, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.colors.border }}>
      <Ionicons name={icon} size={15} color={t.colors.subtext} />
      <Text style={{ fontSize: 13, color: t.colors.subtext, width: 100 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.text, flex: 1 }}>{value}</Text>
    </View>
  );
}
