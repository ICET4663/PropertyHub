import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore, useScopedPropertyIds } from '../../store/AppContext';
import { Card, Badge, Avatar, SearchBar, Chip, EmptyState } from '../../components/ui';
import { leaseStatus, leaseDaysLeft, currentPeriod } from '../../utils';

const FILTERS = ['All', 'Active', 'Expiring', 'Overdue rent', 'Former'];

export default function TenantsScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { state } = useStore();
  const scopedIds = useScopedPropertyIds();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');

  const tenants = useMemo(() => {
    let list = state.tenants;
    if (scopedIds) {
      const propIds = new Set(state.properties.filter((p) => scopedIds.includes(p.id)).map((p) => p.id));
      list = list.filter((tn) => propIds.has(tn.propertyId));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((tn) => tn.name.toLowerCase().includes(q) || tn.occupation.toLowerCase().includes(q));
    }
    switch (filter) {
      case 'Active':
        list = list.filter((tn) => tn.status === 'active' && leaseOf(tn.id, state) && leaseStatus(leaseOf(tn.id, state)!) === 'active');
        break;
      case 'Expiring':
        list = list.filter((tn) => {
          const l = leaseOf(tn.id, state);
          return l && ['expiring', 'expired'].includes(leaseStatus(l));
        });
        break;
      case 'Overdue rent': {
        const period = currentPeriod();
        const overdueIds = new Set(state.payments.filter((p) => p.period === period && p.status === 'overdue').map((p) => p.tenantId));
        list = list.filter((tn) => overdueIds.has(tn.id));
        break;
      }
      case 'Former':
        list = list.filter((tn) => tn.status === 'former');
        break;
    }
    return list;
  }, [state, scopedIds, query, filter]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: t.colors.text, letterSpacing: -0.5 }}>Tenants</Text>
            <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2 }}>{tenants.length} records</Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: t.colors.primary }]}
            onPress={() => nav.navigate('Onboarding')}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search tenants..." />
        </View>
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
        data={tenants}
        keyExtractor={(tn) => tn.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40 }}
        ListEmptyComponent={<EmptyState icon="people" title="No tenants found" message="Try adjusting your search or filters." />}
        renderItem={({ item }) => <TenantCard tenantId={item.id} onPress={() => nav.navigate('TenantDetail', { tenantId: item.id })} />}
      />
    </SafeAreaView>
  );
}

function leaseOf(tenantId: string, state: any) {
  return state.leases.find((l: any) => l.tenantId === tenantId && !l.terminated);
}

function TenantCard({ tenantId, onPress }: { tenantId: string; onPress: () => void }) {
  const t = useTheme();
  const { state } = useStore();
  const tenant = state.tenants.find((tn: any) => tn.id === tenantId)!;
  const unit = state.units.find((u: any) => u.id === tenant.unitId);
  const prop = state.properties.find((p: any) => p.id === tenant.propertyId);
  const lease = leaseOf(tenantId, state);
  const period = currentPeriod();
  const payment = state.payments.find((p: any) => p.tenantId === tenantId && p.period === period);

  let leaseBadge: { label: string; color: string; bg: string } | null = null;
  if (lease) {
    const st = leaseStatus(lease);
    const days = leaseDaysLeft(lease);
    if (st === 'expired') leaseBadge = { label: `Expired ${Math.abs(days)}d ago`, color: t.colors.danger, bg: t.colors.dangerSoft };
    else if (st === 'expiring') leaseBadge = { label: `${days}d left`, color: t.colors.warning, bg: t.colors.warningSoft };
    else leaseBadge = { label: 'Active', color: t.colors.success, bg: t.colors.successSoft };
  }

  const payColor = payment?.status === 'paid' ? t.colors.success : payment?.status === 'overdue' ? t.colors.danger : t.colors.warning;
  const payBg = payment?.status === 'paid' ? t.colors.successSoft : payment?.status === 'overdue' ? t.colors.dangerSoft : t.colors.warningSoft;

  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar name={tenant.name} color={tenant.avatarColor} size={44} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: t.colors.text }}>{tenant.name}</Text>
          <Text style={{ fontSize: 12, color: t.colors.subtext, marginTop: 2 }}>
            {tenant.occupation} · {unit?.unitNumber ?? 'N/A'}
          </Text>
        </View>
        {leaseBadge && <Badge label={leaseBadge.label} color={leaseBadge.color} bg={leaseBadge.bg} />}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm }}>
        <Ionicons name="business-outline" size={12} color={t.colors.subtext} />
        <Text style={{ fontSize: 12, color: t.colors.subtext, flex: 1 }} numberOfLines={1}>{prop?.name}</Text>
        {payment && <Badge label={`Rent: ${payment.status}`} color={payColor} bg={payBg} icon={payment.status === 'paid' ? 'checkmark-circle' : 'alert-circle'} />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
