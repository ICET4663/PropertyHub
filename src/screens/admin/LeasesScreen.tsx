import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore, useScopedPropertyIds } from '../../store/AppContext';
import { Card, Badge, Avatar, Chip, EmptyState } from '../../components/ui';
import { formatDate, formatCompact, leaseStatus, leaseDaysLeft } from '../../utils';

const FILTERS = ['All', 'Active', 'Expiring', 'Expired', 'Terminated'];

export default function LeasesScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { state } = useStore();
  const scopedIds = useScopedPropertyIds();
  const [filter, setFilter] = useState('All');

  const leases = useMemo(() => {
    let list = state.leases;
    if (scopedIds) {
      const propIds = new Set(state.properties.filter((p) => scopedIds.includes(p.id)).map((p) => p.id));
      list = list.filter((l) => propIds.has(l.propertyId));
    }
    switch (filter) {
      case 'Active': list = list.filter((l) => leaseStatus(l) === 'active'); break;
      case 'Expiring': list = list.filter((l) => leaseStatus(l) === 'expiring'); break;
      case 'Expired': list = list.filter((l) => leaseStatus(l) === 'expired'); break;
      case 'Terminated': list = list.filter((l) => leaseStatus(l) === 'terminated'); break;
    }
    return [...list].sort((a, b) => leaseDaysLeft(a) - leaseDaysLeft(b));
  }, [state.leases, state.properties, scopedIds, filter]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.colors.text, letterSpacing: -0.5 }}>Leases</Text>
        <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2 }}>
          {leases.filter((l) => leaseStatus(l) === 'expiring').length} expiring within 60 days
        </Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(i) => i}
          style={{ marginTop: spacing.md, flexGrow: 0 }}
          renderItem={({ item }) => <Chip label={item} active={filter === item} onPress={() => setFilter(item)} />}
        />
      </View>
      <FlatList
        data={leases}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40 }}
        ListEmptyComponent={<EmptyState icon="document-text" title="No leases found" message="Try adjusting your filters." />}
        renderItem={({ item }) => <LeaseCard leaseId={item.id} onPress={() => nav.navigate('LeaseDetail', { leaseId: item.id })} />}
      />
    </SafeAreaView>
  );
}

function LeaseCard({ leaseId, onPress }: { leaseId: string; onPress: () => void }) {
  const t = useTheme();
  const { state } = useStore();
  const lease = state.leases.find((l) => l.id === leaseId)!;
  const tenant = state.tenants.find((tn) => tn.id === lease.tenantId);
  const unit = state.units.find((u) => u.id === lease.unitId);
  const prop = state.properties.find((p) => p.id === lease.propertyId);

  const st = leaseStatus(lease);
  const days = leaseDaysLeft(lease);
  const color = st === 'active' ? t.colors.success : st === 'expiring' ? t.colors.warning : t.colors.danger;
  const bg = st === 'active' ? t.colors.successSoft : st === 'expiring' ? t.colors.warningSoft : t.colors.dangerSoft;
  const label = st === 'terminated' ? 'Terminated' : st === 'expired' ? `Expired ${Math.abs(days)}d ago` : st === 'expiring' ? `${days}d left` : 'Active';

  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar name={tenant?.name ?? '?'} color={tenant?.avatarColor ?? t.colors.subtext} size={42} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: t.colors.text }}>{tenant?.name ?? 'Unknown'}</Text>
          <Text style={{ fontSize: 12, color: t.colors.subtext, marginTop: 2 }}>
            {unit?.unitNumber} · {prop?.name}
          </Text>
        </View>
        <Badge label={label} color={color} bg={bg} />
      </View>
      <View style={[styles.metaRow, { borderTopColor: t.colors.border }]}>
        <View style={styles.metaItem}>
          <Text style={[styles.metaLabel, { color: t.colors.subtext }]}>End date</Text>
          <Text style={[styles.metaValue, { color: t.colors.text }]}>{lease.endDate}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={[styles.metaLabel, { color: t.colors.subtext }]}>Rent</Text>
          <Text style={[styles.metaValue, { color: t.colors.text }]}>{formatCompact(lease.rent)}/mo</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={[styles.metaLabel, { color: t.colors.subtext }]}>Term</Text>
          <Text style={[styles.metaValue, { color: t.colors.text }]}>{lease.termMonths} mo</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1 },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { fontSize: 13, fontWeight: '700', marginTop: 2 },
});
