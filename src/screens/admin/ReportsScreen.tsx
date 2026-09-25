import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing } from '../../theme';
import { useStore, useScopedPropertyIds } from '../../store/AppContext';
import { Card, Badge, Button, Segmented, EmptyState } from '../../components/ui';
import { HBars, Donut } from '../../components/charts';
import { formatCompact, formatNGN, currentPeriod, leaseStatus, timeAgo } from '../../utils';

export default function ReportsScreen() {
  const t = useTheme();
  const { state } = useStore();
  const scopedIds = useScopedPropertyIds();
  const [period, setPeriod] = useState<'month' | 'half'>('month');

  const data = useMemo(() => {
    const properties = scopedIds ? state.properties.filter((p) => scopedIds.includes(p.id)) : state.properties;
    const propIds = new Set(properties.map((p) => p.id));
    const units = state.units.filter((u) => propIds.has(u.propertyId));
    const occupied = units.filter((u) => u.status === 'occupied').length;

    // occupancy by location
    const byLocation = properties.reduce<Record<string, { total: number; occupied: number; name: string }>>((acc, p) => {
      const loc = state.locations.find((l) => l.id === p.locationId);
      const key = loc?.name ?? 'Other';
      if (!acc[key]) acc[key] = { total: 0, occupied: 0, name: key };
      const pu = state.units.filter((u) => u.propertyId === p.id);
      acc[key].total += pu.length;
      acc[key].occupied += pu.filter((u) => u.status === 'occupied').length;
      return acc;
    }, {});

    // rent collection
    const period = currentPeriod();
    const scopedPayments = state.payments.filter((p) => propIds.has(p.propertyId));
    const currentPayments = scopedPayments.filter((p) => p.period === period);
    const collected = currentPayments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const target = currentPayments.reduce((s, p) => s + p.amount, 0);
    const collectionRate = target ? collected / target : 0;

    const byProperty = properties.map((p) => {
      const pp = scopedPayments.filter((x) => x.propertyId === p.id && x.period === period);
      const col = pp.filter((x) => x.status === 'paid').reduce((s, x) => s + x.amount, 0);
      const tgt = pp.reduce((s, x) => s + x.amount, 0);
      return { label: p.code, value: tgt ? col / tgt : 0, display: `${formatCompact(col)}/${formatCompact(tgt)}`, color: p.color };
    });

    // maintenance
    const reqs = state.maintenance.filter((r) => propIds.has(r.propertyId));
    const byCategory = reqs.reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + 1;
      return acc;
    }, {});
    const resolved = reqs.filter((r) => r.status === 'resolved');
    const avgResolution = resolved.length
      ? resolved.reduce((s, r) => s + Math.max(0, (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()) / 86400000), 0) / resolved.length
      : 0;

    // tenant activity
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const newTenants = state.tenants.filter((tn) => new Date(tn.joinedAt).getTime() > thirtyDaysAgo).length;
    const renewals = state.activities.filter((a) => a.type === 'lease' && a.text.includes('renewed') && new Date(a.createdAt).getTime() > thirtyDaysAgo).length;
    const moveOuts = state.tenants.filter((tn) => tn.status === 'former').length;

    return {
      units, occupied, occupancy: units.length ? occupied / units.length : 0,
      byLocation: Object.values(byLocation),
      collected, target, collectionRate, byProperty,
      reqs, byCategory, avgResolution, resolvedCount: resolved.length,
      newTenants, renewals, moveOuts,
    };
  }, [state, scopedIds]);

  const onExport = async () => {
    const period = currentPeriod();
    const lines = ['Period,Property,Unit,Tenant,Amount,Status'];
    state.payments
      .filter((p) => p.period === period)
      .forEach((p) => {
        const unit = state.units.find((u) => u.id === p.unitId);
        const tenant = state.tenants.find((tn) => tn.id === p.tenantId);
        const prop = state.properties.find((pr) => pr.id === p.propertyId);
        lines.push(`${p.period},${prop?.name ?? ''},${unit?.unitNumber ?? ''},${tenant?.name ?? ''},${p.amount},${p.status}`);
      });
    const csv = lines.join('\n');
    try {
      await Share.share({ message: csv, title: 'Rent collection report' });
    } catch {
      Alert.alert('Export ready', 'CSV report generated.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: t.colors.text, letterSpacing: -0.5 }}>Reports</Text>
            <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2 }}>Occupancy · rent · maintenance · activity</Text>
          </View>
          <Button title="Export CSV" icon="download" small variant="outline" onPress={onExport} />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Segmented options={['This month', 'Last 6 months']} value={period === 'month' ? 'This month' : 'Last 6 months'} onChange={(v) => setPeriod(v === 'This month' ? 'month' : 'half')} />
        </View>

        {/* Summary */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
          <SummaryCard label="Occupancy" value={`${Math.round(data.occupancy * 100)}%`} sub={`${data.occupied}/${data.units.length} units`} icon="home" color={t.colors.success} />
          <SummaryCard label="Rent collected" value={formatCompact(data.collected)} sub={`${Math.round(data.collectionRate * 100)}% of target`} icon="cash" color={t.colors.primary} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <SummaryCard label="Requests" value={String(data.reqs.length)} sub={`${data.resolvedCount} resolved`} icon="construct" color={t.colors.warning} />
          <SummaryCard label="Avg resolution" value={`${data.avgResolution.toFixed(1)}d`} sub="open → resolved" icon="timer" color={t.colors.info} />
        </View>

        {/* Occupancy by location */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.cardTitle(t)}>Occupancy by location</Text>
          <Donut size={110} stroke={12} progress={data.occupancy} color={t.colors.success} trackColor={t.colors.inputBg}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: t.colors.text }}>{Math.round(data.occupancy * 100)}%</Text>
          </Donut>
          <View style={{ marginTop: spacing.md }}>
            <HBars
              data={data.byLocation.map((l) => ({ label: l.name, value: l.total ? l.occupied / l.total : 0, display: `${l.occupied}/${l.total}` }))}
              color={t.colors.success}
            />
          </View>
        </Card>

        {/* Rent collection by property */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.cardTitle(t)}>Rent collection by block</Text>
          <Text style={{ fontSize: 12, color: t.colors.subtext, marginBottom: spacing.md }}>
            Collected {formatCompact(data.collected)} of {formatCompact(data.target)} target ({Math.round(data.collectionRate * 100)}%)
          </Text>
          <HBars data={data.byProperty} color={t.colors.primary} />
        </Card>

        {/* Maintenance by category */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.cardTitle(t)}>Maintenance by category</Text>
          <HBars
            data={Object.entries(data.byCategory).map(([k, v]) => ({ label: k, value: v, display: String(v) }))}
            color={t.colors.warning}
          />
        </Card>

        {/* Tenant activity */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.cardTitle(t)}>Tenant activity (30 days)</Text>
          <View style={{ flexDirection: 'row' }}>
            <ActStat label="New tenants" value={data.newTenants} color={t.colors.success} />
            <ActStat label="Renewals" value={data.renewals} color={t.colors.primary} />
            <ActStat label="Move-outs" value={data.moveOuts} color={t.colors.danger} />
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ label, value, sub, icon, color }: { label: string; value: string; sub: string; icon: any; color: string }) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, padding: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={{ fontSize: 11, fontWeight: '700', color: t.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 20, fontWeight: '800', color: t.colors.text, marginTop: 6 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: t.colors.subtext, marginTop: 2 }}>{sub}</Text>
    </Card>
  );
}

function ActStat({ label, value, color }: { label: string; value: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 11, color: t.colors.subtext, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const styles = {
  cardTitle: (t: any) => ({ fontSize: 15, fontWeight: '800' as const, color: t.colors.text, marginBottom: spacing.md }),
};
