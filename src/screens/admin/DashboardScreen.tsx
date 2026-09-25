import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore, useScopedPropertyIds } from '../../store/AppContext';
import { Card, Badge, Avatar, StatCard, SectionHeader, ProgressBar } from '../../components/ui';
import { Donut, MiniBars, HBars } from '../../components/charts';
import { formatCompact, formatDate, greeting, leaseStatus, leaseDaysLeft, timeAgo, currentPeriod } from '../../utils';

export default function DashboardScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { state, currentUser } = useStore();
  const scopedIds = useScopedPropertyIds();
  const [refreshing, setRefreshing] = useState(false);

  const data = useMemo(() => {
    const properties = scopedIds ? state.properties.filter((p) => scopedIds.includes(p.id)) : state.properties;
    const propIds = new Set(properties.map((p) => p.id));
    const units = state.units.filter((u) => propIds.has(u.propertyId));
    const occupied = units.filter((u) => u.status === 'occupied').length;
    const vacant = units.filter((u) => u.status === 'vacant').length;
    const inMaint = units.filter((u) => u.status === 'maintenance').length;
    const occupancy = units.length ? occupied / units.length : 0;

    const period = currentPeriod();
    const scopedPayments = state.payments.filter((p) => propIds.has(p.propertyId));
    const currentPayments = scopedPayments.filter((p) => p.period === period);
    const collected = currentPayments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const target = scopedPayments.filter((p) => p.period === period).reduce((s, p) => s + p.amount, 0);

    const openRequests = state.maintenance.filter((r) => propIds.has(r.propertyId) && r.status !== 'resolved');
    const urgent = openRequests.filter((r) => r.priority === 'urgent').length;

    const leases = state.leases.filter((l) => propIds.has(l.propertyId) && !l.terminated);
    const expiring = leases
      .map((l) => ({ lease: l, days: leaseDaysLeft(l), status: leaseStatus(l) }))
      .filter((x) => x.status === 'expiring' || x.status === 'expired')
      .sort((a, b) => a.days - b.days);

    // rent trend: last 6 months collected
    const trend: { label: string; value: number; display: string }[] = [];
    for (let m = 5; m >= 0; m--) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const total = scopedPayments
        .filter((p) => p.period === key && p.status === 'paid')
        .reduce((s, p) => s + p.amount, 0);
      trend.push({ label: d.toLocaleString('en', { month: 'short' }), value: total, display: formatCompact(total) });
    }

    // occupancy by property
    const occByProp = properties.map((p) => {
      const pu = state.units.filter((u) => u.propertyId === p.id);
      const occ = pu.filter((u) => u.status === 'occupied').length;
      return { label: p.code, value: pu.length ? occ / pu.length : 0, display: `${occ}/${pu.length}`, color: p.color };
    });

    const monthlyTarget = scopedPayments.filter((p) => p.period === currentPeriod()).reduce((s, p) => s + p.amount, 0);

    return {
      units, occupied: units.filter((u) => u.status === 'occupied').length,
      vacant: units.filter((u) => u.status === 'vacant').length,
      inMaint: units.filter((u) => u.status === 'maintenance').length,
      occupancy, collected, target: monthlyTarget,
      openRequests, urgent, expiring, trend, occByProp,
      recentActivities: state.activities.slice(0, 6),
    };
  }, [state, scopedIds]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  };

  const firstName = currentUser?.name.split(' ')[0] ?? 'Admin';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: t.colors.subtext }}>{greeting()},</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: t.colors.text, letterSpacing: -0.4 }}>{firstName}</Text>
          </View>
          <TouchableOpacity
            style={[styles.bellBtn, { backgroundColor: t.colors.card }]}
            onPress={() => nav.navigate('Messages')}
          >
            <Ionicons name="notifications-outline" size={20} color={t.colors.text} />
            {data.openRequests.length > 0 && (
              <View style={[styles.bellBadge, { backgroundColor: t.colors.danger }]}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{data.openRequests.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 12, color: t.colors.subtext, marginBottom: spacing.lg }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {'  ·  '}{state.properties.length} blocks under management
        </Text>

        {/* KPI grid */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatCard icon="home" label="Occupancy" value={`${Math.round(data.occupancy * 100)}%`} sub={`${data.occupied}/${data.units.length} units`} color={t.colors.success} onPress={() => nav.navigate('Properties')} />
          <StatCard icon="cash" label="Rent collected" value={formatCompact(data.collected)} sub={`of ${formatCompact(data.target)} target`} color={t.colors.primary} onPress={() => nav.navigate('Reports')} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <StatCard icon="construct" label="Open requests" value={String(data.openRequests.length)} sub={data.urgent > 0 ? `${data.urgent} urgent` : 'none urgent'} color={t.colors.warning} onPress={() => nav.navigate('Maintenance')} />
          <StatCard icon="time" label="Expiring leases" value={String(data.expiring.length)} sub="within 60 days" color={t.colors.danger} onPress={() => nav.navigate('Leases')} />
        </View>

        {/* Occupancy donut + trend */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, alignSelf: 'flex-start' }}>Occupancy</Text>
            <View style={{ marginVertical: spacing.md }}>
              <Donut size={120} stroke={13} progress={data.occupancy} color={t.colors.success} trackColor={t.colors.inputBg}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: t.colors.text }}>{Math.round(data.occupancy * 100)}%</Text>
                <Text style={{ fontSize: 10, color: t.colors.subtext }}>{data.occupied}/{data.units.length} units</Text>
              </Donut>
            </View>
            <View style={{ alignSelf: 'stretch' }}>
              <Legend color={t.colors.success} label={`Occupied ${data.occupied}`} />
              <Legend color={t.colors.warning} label={`Vacant ${data.vacant}`} />
              <Legend color={t.colors.info} label={`Maintenance ${data.inMaint}`} />
            </View>
          </Card>

          <Card style={{ flex: 1.2 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, marginBottom: spacing.md }}>Rent collected — 6 mo</Text>
            <MiniBars data={data.trend} height={170} color={t.colors.primary} />
            <Text style={{ fontSize: 11, color: t.colors.subtext, marginTop: spacing.sm }}>
              This month: <Text style={{ fontWeight: '800', color: t.colors.text }}>{formatCompact(data.collected)}</Text> collected
            </Text>
          </Card>
        </View>

        {/* Occupancy by property */}
        <Card style={{ marginTop: spacing.sm }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text, marginBottom: spacing.md }}>Occupancy by block</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {data.occByProp.map((p, i) => (
              <View key={i} style={[styles.propChip, { backgroundColor: t.colors.cardAlt }]}>
                <View style={[styles.propDot, { backgroundColor: p.color }]} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: t.colors.text }}>{p.label}</Text>
                <Text style={{ fontSize: 11, color: t.colors.subtext }}>{Math.round(p.value * 100)}%</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Expiring leases */}
        <View style={{ marginTop: spacing.lg }}>
          <SectionHeader title="Lease expirations" actionLabel="View all" onAction={() => nav.navigate('Leases')} />
          {data.expiring.length === 0 ? (
            <Card><Text style={{ color: t.colors.subtext, fontSize: 13 }}>No leases expiring within 60 days.</Text></Card>
          ) : (
            data.expiring.slice(0, 5).map(({ lease, days, status }) => {
              const tenant = state.tenants.find((tn) => tn.id === lease.tenantId);
              const unit = state.units.find((u) => u.id === lease.unitId);
              const overdue = status === 'expired';
              return (
                <TouchableOpacity key={lease.id} onPress={() => nav.navigate('LeaseDetail', { leaseId: lease.id })}>
                  <Card style={[styles.rowCard, { borderLeftColor: overdue ? t.colors.danger : t.colors.warning, borderLeftWidth: 3 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: t.colors.text }}>{tenant?.name ?? 'Unknown'}</Text>
                      <Text style={{ fontSize: 12, color: t.colors.subtext }}>{unit?.unitNumber} · {formatCompact(lease.rent)}/mo</Text>
                    </View>
                    <Badge
                      label={overdue ? `Overdue ${Math.abs(days)}d` : `${days}d left`}
                      color={overdue ? t.colors.danger : t.colors.warning}
                      bg={overdue ? t.colors.dangerSoft : t.colors.warningSoft}
                    />
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Open maintenance */}
        <View style={{ marginTop: spacing.lg }}>
          <SectionHeader title="Open maintenance" actionLabel="View all" onAction={() => nav.navigate('Maintenance')} />
          {data.openRequests.slice(0, 4).map((r) => {
            const unit = state.units.find((u) => u.id === r.unitId);
            const pColor = r.priority === 'urgent' ? t.colors.danger : r.priority === 'high' ? '#E8A33D' : t.colors.info;
            return (
              <TouchableOpacity key={r.id} onPress={() => nav.navigate('MaintenanceDetail', { requestId: r.id })}>
                <Card style={styles.rowCard}>
                  <View style={[styles.reqIcon, { backgroundColor: pColor + '1A' }]}>
                    <Ionicons name="construct" size={16} color={pColor} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: t.colors.text }} numberOfLines={1}>{r.title}</Text>
                    <Text style={{ fontSize: 12, color: t.colors.subtext }}>{unit?.unitNumber} · {timeAgo(r.createdAt)}</Text>
                  </View>
                  <Badge
                    label={r.status === 'in_progress' ? 'In progress' : 'Open'}
                    color={r.status === 'in_progress' ? t.colors.info : t.colors.warning}
                    bg={r.status === 'in_progress' ? t.colors.infoSoft : t.colors.warningSoft}
                  />
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Recent activity */}
        <View style={{ marginTop: spacing.lg }}>
          <SectionHeader title="Recent activity" actionLabel="View all" onAction={() => nav.navigate('ActivityLog')} />
          <Card style={{ paddingVertical: spacing.sm }}>
            {data.recentActivities.map((a, i) => (
              <View key={a.id} style={[styles.actRow, i > 0 && { borderTopWidth: 1, borderTopColor: t.colors.border }]}>
                <View style={[styles.actDot, { backgroundColor: actColor(a.type, t) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: t.colors.text, lineHeight: 18 }}>{a.text}</Text>
                  <Text style={{ fontSize: 11, color: t.colors.subtext, marginTop: 2 }}>{timeAgo(a.createdAt)} · {a.actor}</Text>
                </View>
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 6 }} />
      <Text style={{ fontSize: 11, color: t.colors.subtext }}>{label}</Text>
    </View>
  );
}

function actColor(type: string, t: any): string {
  switch (type) {
    case 'tenant': return t.colors.success;
    case 'lease': return t.colors.warning;
    case 'maintenance': return t.colors.info;
    case 'payment': return t.colors.primary;
    default: return t.colors.subtext;
  }
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  bellBtn: {
    width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  propChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, gap: 6,
  },
  propDot: { width: 8, height: 8, borderRadius: 4 },
  rowCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, paddingVertical: spacing.md },
  reqIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actRow: { flexDirection: 'row', paddingVertical: 10, gap: spacing.md },
  actDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
});
