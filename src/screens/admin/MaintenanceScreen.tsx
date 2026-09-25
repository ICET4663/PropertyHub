import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore, useScopedPropertyIds } from '../../store/AppContext';
import { Card, Badge, Chip, EmptyState, SearchBar } from '../../components/ui';
import { timeAgo } from '../../utils';
import { MaintenanceStatus, Priority } from '../../types';

const FILTERS = ['All', 'Open', 'In progress', 'Resolved'];
const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export default function MaintenanceScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { state, currentUser } = useStore();
  const scopedIds = useScopedPropertyIds();
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');

  const requests = useMemo(() => {
    let list = state.maintenance;
    if (scopedIds) {
      const propIds = new Set(state.properties.filter((p) => scopedIds.includes(p.id)).map((p) => p.id));
      list = list.filter((r) => propIds.has(r.propertyId));
    }
    if (currentUser?.role === 'tenant' && currentUser.tenantId) {
      list = list.filter((r) => r.tenantId === currentUser.tenantId);
    }
    switch (filter) {
      case 'Open': list = list.filter((r) => r.status === 'open'); break;
      case 'In progress': list = list.filter((r) => r.status === 'in_progress'); break;
      case 'Resolved': list = list.filter((r) => r.status === 'resolved'); break;
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((r) => r.title.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [state.maintenance, state.properties, scopedIds, currentUser, filter, query]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.colors.text, letterSpacing: -0.5 }}>Maintenance</Text>
        <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2 }}>
          {requests.filter((r) => r.status !== 'resolved').length} open · {requests.length} total
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search requests..." />
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
        data={requests}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 100 }}
        ListEmptyComponent={<EmptyState icon="construct" title="No requests found" message="Try adjusting your search or filters." />}
        renderItem={({ item }) => <RequestCard requestId={item.id} onPress={() => nav.navigate('MaintenanceDetail', { requestId: item.id })} />}
      />
    </SafeAreaView>
  );
}

const PRIORITY_META: Record<Priority, { label: string }> = {
  urgent: { label: 'Urgent' }, high: { label: 'High' }, medium: { label: 'Medium' }, low: { label: 'Low' },
};

function RequestCard({ requestId, onPress }: { requestId: string; onPress: () => void }) {
  const t = useTheme();
  const { state } = useStore();
  const req = state.maintenance.find((r) => r.id === requestId)!;
  const unit = state.units.find((u) => u.id === req.unitId);
  const prop = state.properties.find((p) => p.id === req.propertyId);

  const pColor = req.priority === 'urgent' ? t.colors.danger : req.priority === 'high' ? '#E8A33D' : req.priority === 'medium' ? t.colors.info : t.colors.subtext;
  const sColor = req.status === 'resolved' ? t.colors.success : req.status === 'in_progress' ? t.colors.info : t.colors.warning;
  const sBg = req.status === 'resolved' ? t.colors.successSoft : req.status === 'in_progress' ? t.colors.infoSoft : t.colors.warningSoft;

  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
        <View style={[styles.catIcon, { backgroundColor: pColor + '1A' }]}>
          <Ionicons name="construct" size={15} color={pColor} />
        </View>
        <Text style={{ fontSize: 11, fontWeight: '700', color: pColor, marginLeft: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {req.category} · {PRIORITY_META[req.priority].label}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 11, color: t.colors.subtext }}>{timeAgo(req.createdAt)}</Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: t.colors.text }}>{req.title}</Text>
      <Text style={{ fontSize: 12, color: t.colors.subtext, marginTop: 3 }} numberOfLines={2}>{req.description}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm }}>
        <Ionicons name="home-outline" size={12} color={t.colors.subtext} />
        <Text style={{ fontSize: 12, color: t.colors.subtext, flex: 1 }} numberOfLines={1}>
          {unit?.unitNumber} · {prop?.name}
        </Text>
        <Badge
          label={req.status === 'in_progress' ? 'In progress' : req.status}
          color={sColor} bg={sBg}
          icon={req.status === 'resolved' ? 'checkmark-circle' : req.status === 'in_progress' ? 'hammer' : 'alert-circle'}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  catIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
