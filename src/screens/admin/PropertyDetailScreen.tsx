import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Card, Badge, EmptyState, ProgressBar, Button } from '../../components/ui';
import { formatCompact, formatNGN } from '../../utils';
import { UnitStatus } from '../../types';

const STATUS_META: Record<UnitStatus, { label: string; colorKey: 'success' | 'warning' | 'info' }> = {
  occupied: { label: 'Occupied', colorKey: 'success' },
  vacant: { label: 'Vacant', colorKey: 'warning' },
  maintenance: { label: 'Maintenance', colorKey: 'info' },
};

export default function PropertyDetailScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { state } = useStore();
  const { propertyId } = route.params;
  const [filter, setFilter] = useState<'all' | UnitStatus>('all');

  const prop = state.properties.find((p) => p.id === propertyId);
  const location = state.locations.find((l) => l.id === prop?.locationId);
  const manager = state.users.find((u) => u.id === prop?.managerId);
  const units = useMemo(() => state.units.filter((u) => u.propertyId === propertyId), [state.units, propertyId]);
  const filtered = filter === 'all' ? units : units.filter((u) => u.status === filter);

  if (!prop) return null;

  const occupied = units.filter((u) => u.status === 'occupied').length;
  const vacant = units.filter((u) => u.status === 'vacant').length;
  const rentRoll = units.reduce((s, u) => s + u.rent, 0);
  const openReqs = state.maintenance.filter((r) => r.propertyId === propertyId && r.status !== 'resolved').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      {/* Header band */}
      <View style={[styles.band, { backgroundColor: prop.color }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.4 }}>{prop.name}</Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
            {location?.name}, {location?.city} · Built {prop.yearBuilt}
          </Text>
        </View>
        <View style={styles.codeBadge}>
          <Text style={{ color: prop.color, fontWeight: '800', fontSize: 12 }}>{prop.code}</Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            {/* Stats */}
            <View style={styles.statsGrid}>
              <StatBox label="Units" value={String(units.length)} />
              <StatBox label="Occupied" value={String(occupied)} color={t.colors.success} />
              <StatBox label="Vacant" value={String(vacant)} color={t.colors.warning} />
              <StatBox label="Rent roll" value={formatCompact(rentRoll)} color={t.colors.primary} />
            </View>

            <Card style={{ marginTop: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.text }}>Occupancy</Text>
                <Text style={{ fontSize: 12, color: t.colors.subtext }}>{Math.round((occupied / Math.max(1, units.length)) * 100)}%</Text>
              </View>
              <ProgressBar progress={occupied / Math.max(1, units.length)} color={prop.color} />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md }}>
                <Ionicons name="person-circle-outline" size={15} color={t.colors.subtext} />
                <Text style={{ fontSize: 12, color: t.colors.subtext, marginLeft: 5 }}>Manager: {manager?.name ?? 'Unassigned'}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm }}>
                {prop.amenities.map((a) => (
                  <View key={a} style={[styles.amenity, { backgroundColor: t.colors.cardAlt }]}>
                    <Text style={{ fontSize: 11, color: t.colors.subtext, fontWeight: '600' }}>{a}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 12, color: t.colors.subtext, lineHeight: 18, marginTop: spacing.sm }}>{prop.description}</Text>
            </Card>

            {/* Unit filters */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md }}>
              {(['all', 'occupied', 'vacant', 'maintenance'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[
                    styles.filterChip,
                    { backgroundColor: filter === f ? t.colors.primary : t.colors.card, borderColor: filter === f ? t.colors.primary : t.colors.border },
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: filter === f ? '#fff' : t.colors.subtext, textTransform: 'capitalize' }}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, marginBottom: spacing.sm }}>
              Units ({filtered.length})
            </Text>
          </View>
        }
        renderItem={({ item }) => <UnitRow unitId={item.id} onPress={() => {
          const tenant = state.tenants.find((tn) => tn.unitId === item.id && tn.status === 'active');
          if (tenant) nav.navigate('TenantDetail', { tenantId: tenant.id });
        }} />}
        ListEmptyComponent={<EmptyState icon="home" title="No units" message="No units match this filter." />}
      />
    </SafeAreaView>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={[styles.statBox, { backgroundColor: t.colors.card }]}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: color ?? t.colors.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: t.colors.subtext, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function UnitRow({ unitId, onPress }: { unitId: string; onPress: () => void }) {
  const t = useTheme();
  const { state } = useStore();
  const unit = state.units.find((u) => u.id === unitId)!;
  const tenant = state.tenants.find((tn) => tn.unitId === unit.id && tn.status === 'active');
  const statusColor = unit.status === 'occupied' ? t.colors.success : unit.status === 'vacant' ? t.colors.warning : t.colors.info;
  const statusBg = unit.status === 'occupied' ? t.colors.successSoft : unit.status === 'vacant' ? t.colors.warningSoft : t.colors.infoSoft;

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress}>
      <View style={[styles.unitRow, { backgroundColor: t.colors.card }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.colors.text }}>{unit.unitNumber}</Text>
          <Text style={{ fontSize: 12, color: t.colors.subtext, marginTop: 2 }}>
            {unit.type} · Floor {unit.floor} · {formatNGN(unit.rent)}/mo
          </Text>
          {tenant && <Text style={{ fontSize: 11, color: t.colors.subtext, marginTop: 2 }}>👤 {tenant.name}</Text>}
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: statusColor, textTransform: 'capitalize' }}>{unit.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  band: { padding: spacing.lg, paddingTop: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  codeBadge: { backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9 },
  statsGrid: { flexDirection: 'row', gap: spacing.sm },
  statBox: { flex: 1, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  amenity: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  filterChip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
  },
  unitRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, marginLeft: spacing.sm },
});
