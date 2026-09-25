import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore, useScopedPropertyIds } from '../../store/AppContext';
import { Card, Badge, SearchBar, Chip, EmptyState } from '../../components/ui';
import { ProgressBar } from '../../components/ui';
import { formatCompact } from '../../utils';

export default function PropertiesScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { state } = useStore();
  const scopedIds = useScopedPropertyIds();
  const [query, setQuery] = useState('');
  const [locFilter, setLocFilter] = useState<string>('All');

  const properties = useMemo(() => {
    let list = scopedIds ? state.properties.filter((p) => scopedIds.includes(p.id)) : state.properties;
    if (locFilter !== 'All') list = list.filter((p) => p.locationId === locFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    }
    return list;
  }, [state.properties, scopedIds, query, locFilter]);

  const locations = useMemo(() => {
    const ids = new Set((scopedIds ? state.properties.filter((p) => scopedIds.includes(p.id)) : state.properties).map((p) => p.locationId));
    return state.locations.filter((l) => ids.has(l.id));
  }, [state.locations, state.properties, scopedIds]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.colors.text, letterSpacing: -0.5 }}>Properties</Text>
        <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2 }}>
          {properties.length} blocks across {locations.length} locations
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search blocks..." />
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['All', ...locations.map((l) => l.name)]}
          keyExtractor={(i) => i}
          style={{ marginTop: spacing.md, flexGrow: 0 }}
          renderItem={({ item }) => (
            <Chip label={item} active={locFilter === item} onPress={() => setLocFilter(item)} />
          )}
        />
      </View>
      <FlatList
        data={properties}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40 }}
        ListEmptyComponent={<EmptyState icon="business" title="No properties found" message="Try adjusting your search or filters." />}
        renderItem={({ item }) => <PropertyCard propertyId={item.id} onPress={() => nav.navigate('PropertyDetail', { propertyId: item.id })} />}
      />
    </SafeAreaView>
  );
}

function PropertyCard({ propertyId, onPress }: { propertyId: string; onPress: () => void }) {
  const t = useTheme();
  const { state } = useStore();
  const prop = state.properties.find((p) => p.id === propertyId)!;
  const location = state.locations.find((l) => l.id === prop.locationId);
  const manager = state.users.find((u) => u.id === prop.managerId);
  const units = state.units.filter((u) => u.propertyId === prop.id);
  const occupied = units.filter((u) => u.status === 'occupied').length;
  const vacant = units.filter((u) => u.status === 'vacant').length;
  const rentRoll = units.reduce((s, u) => s + u.rent, 0);
  const openReqs = state.maintenance.filter((r) => r.propertyId === prop.id && r.status !== 'resolved').length;

  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[styles.propIcon, { backgroundColor: prop.color }]}>
          <Ionicons name="business" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text }}>{prop.name}</Text>
          <Text style={{ fontSize: 12, color: t.colors.subtext, marginTop: 2 }}>
            {location?.name}, {location?.city} · {location?.state}
          </Text>
        </View>
        <View style={[styles.codeBadge, { backgroundColor: prop.color + '1A' }]}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: prop.color }}>{prop.code}</Text>
        </View>
      </View>

      <View style={[styles.statsRow, { borderTopColor: t.colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: t.colors.text }]}>{units.length}</Text>
          <Text style={[styles.statLabel, { color: t.colors.subtext }]}>Units</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: t.colors.success }]}>{units.filter((u) => u.status === 'occupied').length}</Text>
          <Text style={[styles.statLabel, { color: t.colors.subtext }]}>Occupied</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: t.colors.warning }]}>{vacant}</Text>
          <Text style={[styles.statLabel, { color: t.colors.subtext }]}>Vacant</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: t.colors.danger }]}>{openReqs}</Text>
          <Text style={[styles.statLabel, { color: t.colors.subtext }]}>Requests</Text>
        </View>
      </View>

      <View style={{ marginTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
          <Text style={{ fontSize: 11, color: t.colors.subtext }}>Occupancy</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: t.colors.text }}>
            {units.length ? Math.round((occupied / units.length) * 100) : 0}% · {formatCompact(rentRoll)}/mo
          </Text>
        </View>
        <ProgressBar progress={units.length ? occupied / units.length : 0} color={prop.color} height={6} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}>
        <Ionicons name="person-circle-outline" size={14} color={t.colors.subtext} />
        <Text style={{ fontSize: 11, color: t.colors.subtext, marginLeft: 4 }}>
          Manager: {manager?.name ?? 'Unassigned'}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  propIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  codeBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  statsRow: {
    flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
});
