import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Card, Badge, Avatar, Button, ProgressBar } from '../../components/ui';
import { formatDate, formatNGN, leaseStatus, leaseDaysLeft } from '../../utils';

export default function LeaseDetailScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { state, renewLease, terminateLease, getOrCreateConversation } = useStore();
  const { leaseId } = route.params;
  const lease = state.leases.find((l) => l.id === leaseId);
  if (!lease) return null;

  const tenant = state.tenants.find((tn) => tn.id === lease.tenantId);
  const unit = state.units.find((u) => u.id === lease.unitId);
  const prop = state.properties.find((p) => p.id === lease.propertyId);

  const st = leaseStatus(lease);
  const days = leaseDaysLeft(lease);
  const color = st === 'active' ? t.colors.success : st === 'expiring' ? t.colors.warning : t.colors.danger;
  const bg = st === 'active' ? t.colors.successSoft : st === 'expiring' ? t.colors.warningSoft : t.colors.dangerSoft;

  const onRenew = () => {
    Alert.alert('Renew lease', `Extend by 12 months? New end date will be calculated from ${days < 0 ? 'today' : 'current end date'}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Renew', onPress: () => renewLease(lease.id, 12) },
    ]);
  };

  const onTerminate = () => {
    Alert.alert('Terminate lease', 'The unit will be marked vacant and the tenant as former.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Terminate', style: 'destructive', onPress: () => terminateLease(lease.id) },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {/* Tenant */}
        {tenant && (
          <Card style={{ alignItems: 'center' }}>
            <Avatar name={tenant.name} color={tenant.avatarColor} size={64} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: t.colors.text, marginTop: spacing.sm }}>{tenant.name}</Text>
            <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2 }}>{tenant.occupation}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Badge label={st} color={color} bg={bg} />
              <Badge label={`${lease.termMonths}-month term`} color={t.colors.info} bg={t.colors.infoSoft} />
            </View>
          </Card>
        )}

        {/* Premises */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>Premises</Text>
          <Row icon="home" label="Unit" value={`${unit?.unitNumber ?? 'N/A'} · ${unit?.type ?? ''}`} />
          <Row icon="business" label="Property" value={prop?.name ?? 'N/A'} />
          <Row icon="location" label="Location" value={`${prop ? (state.locations.find((l) => l.id === prop.locationId)?.name ?? '') : ''}`} />
        </Card>

        {/* Terms */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>Lease terms</Text>
          <Row icon="calendar" label="Start date" value={formatDate(lease.startDate)} />
          <Row icon="flag" label="End date" value={formatDate(lease.endDate)} />
          <Row icon="cash" label="Monthly rent" value={`${formatNGN(lease.rent)}`} />
          <Row icon="shield" label="Deposit held" value={formatNGN(lease.deposit)} />
          <Row icon="document" label="Status" value={st} last />
          <View style={{ marginTop: spacing.sm }}>
            <ProgressBar progress={Math.max(0, Math.min(1, days / 365))} color={color} height={6} />
            <Text style={{ fontSize: 11, color: t.colors.subtext, marginTop: 5 }}>
              {days >= 0 ? `${days} days remaining on the lease` : `Lease expired ${Math.abs(days)} days ago`}
            </Text>
          </View>
        </Card>

        {st !== 'terminated' && (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
            <Button title="Renew (12 mo)" icon="refresh" small style={{ flex: 1 }} onPress={onRenew} />
            <Button title="Terminate" icon="close-circle" small variant="danger" style={{ flex: 1 }} onPress={onTerminate} />
          </View>
        )}
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
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.text, flex: 1, textTransform: 'capitalize' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({});
