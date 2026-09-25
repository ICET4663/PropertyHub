import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Card, Badge, Avatar, Button, SectionHeader, ProgressBar } from '../../components/ui';
import { Donut } from '../../components/charts';
import { formatNGN, formatCompact, leaseStatus, leaseDaysLeft, currentPeriod, timeAgo, greeting } from '../../utils';

export default function TenantHomeScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { state, currentUser } = useStore();

  const data = useMemo(() => {
    const tenant = state.tenants.find((tn) => tn.id === currentUser?.tenantId);
    if (!tenant) return null;
    const unit = state.units.find((u) => u.id === tenant.unitId);
    const prop = state.properties.find((p) => p.id === tenant.propertyId);
    const lease = state.leases.find((l) => l.tenantId === tenant.id && !l.terminated);
    const period = currentPeriod();
    const payment = state.payments.find((p) => p.tenantId === tenant.id && p.period === period);
    const requests = state.maintenance.filter((r) => r.tenantId === tenant.id).slice(0, 3);
    return { tenant, unit, prop, lease, payment, requests };
  }, [state, currentUser]);

  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.colors.subtext }}>No tenancy found for this account.</Text>
      </SafeAreaView>
    );
  }

  const { tenant, unit, prop, lease, payment, requests } = data;
  const st = lease ? leaseStatus(lease) : null;
  const days = lease ? leaseDaysLeft(lease) : 0;
  const leaseColor = st === 'active' ? t.colors.success : st === 'expiring' ? t.colors.warning : t.colors.danger;

  const payColor = payment?.status === 'paid' ? t.colors.success : payment?.status === 'overdue' ? t.colors.danger : t.colors.warning;
  const payBg = payment?.status === 'paid' ? t.colors.successSoft : payment?.status === 'overdue' ? t.colors.dangerSoft : t.colors.warningSoft;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: t.colors.subtext }}>{greeting()},</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: t.colors.text, letterSpacing: -0.4 }}>{tenant.name.split(' ')[0]}</Text>
          </View>
          <Avatar name={tenant.name} color={tenant.avatarColor} size={44} />
        </View>

        {/* Lease card */}
        <Card style={{ backgroundColor: t.colors.primary }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '600' }}>YOUR TENANCY</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 4 }}>{unit?.unitNumber}</Text>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{prop?.name}</Text>
            </View>
            <Donut size={86} stroke={9} progress={Math.max(0, Math.min(1, days / 365))} color="#fff" trackColor="rgba(255,255,255,0.2)">
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>{days}</Text>
              <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)' }}>days left</Text>
            </Donut>
          </View>
          <View style={{ flexDirection: 'row', marginTop: spacing.md, gap: spacing.sm }}>
            <View style={styles.leaseStat}>
              <Text style={styles.leaseStatLabel}>Rent</Text>
              <Text style={styles.leaseStatValue}>{formatCompact(unit?.rent ?? 0)}/mo</Text>
            </View>
            <View style={styles.leaseStat}>
              <Text style={styles.leaseStatLabel}>Lease end</Text>
              <Text style={styles.leaseStatValue}>{lease?.endDate ?? '—'}</Text>
            </View>
            <View style={styles.leaseStat}>
              <Text style={styles.leaseStatLabel}>Status</Text>
              <Text style={styles.leaseStatValue}>{st ?? '—'}</Text>
            </View>
          </View>
        </Card>

        {/* Rent status */}
        <Card style={{ marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext }}>THIS MONTH'S RENT</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: t.colors.text, marginTop: 4 }}>
                {formatNGN(payment?.amount ?? unit?.rent ?? 0)}
              </Text>
            </View>
            <Badge
              label={payment?.status ?? 'no invoice'}
              color={payColor} bg={payBg}
              icon={payment?.status === 'paid' ? 'checkmark-circle' : 'alert-circle'}
            />
          </View>
          {payment?.status !== 'paid' && payment && (
            <Text style={{ fontSize: 12, color: t.colors.subtext, marginTop: spacing.sm }}>
              Online rent payment is coming soon. Please pay via bank transfer and the admin will record it.
            </Text>
          )}
        </Card>

        {/* Quick actions */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Button title="New request" icon="add-circle" small style={{ flex: 1 }} onPress={() => nav.navigate('NewRequest')} />
          <Button title="Message landlord" icon="chatbubble" small variant="outline" style={{ flex: 1 }}
            onPress={() => {
              const convId = nav.getState ? undefined : undefined;
              nav.navigate('Messages');
            }} />
        </View>

        {/* My requests */}
        <View style={{ marginTop: spacing.lg }}>
          <SectionHeader title="My maintenance requests" actionLabel="View all" onAction={() => nav.navigate('Maintenance')} />
          {requests.length === 0 ? (
            <Card><Text style={{ fontSize: 13, color: t.colors.subtext }}>No requests filed yet.</Text></Card>
          ) : (
            requests.map((r) => {
              const sColor = r.status === 'resolved' ? t.colors.success : r.status === 'in_progress' ? t.colors.info : t.colors.warning;
              const sBg = r.status === 'resolved' ? t.colors.successSoft : r.status === 'in_progress' ? t.colors.infoSoft : t.colors.warningSoft;
              return (
                <TouchableOpacity key={r.id} activeOpacity={0.75} onPress={() => nav.navigate('MaintenanceDetail', { requestId: r.id })}>
                  <Card style={[styles.reqCard, { borderLeftColor: sColor }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: t.colors.text }}>{r.title}</Text>
                      <Text style={{ fontSize: 12, color: t.colors.subtext, marginTop: 2 }}>{r.category} · {timeAgo(r.createdAt)}</Text>
                    </View>
                    <Badge label={r.status === 'in_progress' ? 'In progress' : r.status} color={sColor} bg={sBg} />
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Announcements */}
        <View style={{ marginTop: spacing.lg }}>
          <SectionHeader title="Announcements" />
          <Card style={{ paddingVertical: spacing.sm }}>
            {state.activities.slice(0, 3).map((a, i) => (
              <View key={a.id} style={[styles.actRow, i > 0 && { borderTopWidth: 1, borderTopColor: t.colors.border }]}>
                <View style={[styles.actDot, { backgroundColor: t.colors.primarySoft }]}>
                  <Ionicons name="megaphone" size={12} color={t.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12.5, color: t.colors.text, lineHeight: 18 }}>{a.text}</Text>
                  <Text style={{ fontSize: 10.5, color: t.colors.subtext, marginTop: 2 }}>{timeAgo(a.createdAt)}</Text>
                </View>
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  leaseStat: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md, padding: spacing.sm,
  },
  leaseStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  leaseStatValue: { fontSize: 13, fontWeight: '800', color: '#fff', marginTop: 3 },
  reqCard: { borderLeftWidth: 3, marginBottom: spacing.sm, paddingVertical: spacing.md },
  actRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, gap: spacing.sm },
  actDot: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
