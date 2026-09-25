import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Card, EmptyState } from '../../components/ui';
import { timeAgo } from '../../utils';
import { ActivityType } from '../../types';

const TYPE_ICON: Record<ActivityType, { icon: any; color: string }> = {
  tenant: { icon: 'person-add', color: '#1E9E6A' },
  lease: { icon: 'document-text', color: '#E8A33D' },
  maintenance: { icon: 'construct', color: '#3B82F6' },
  payment: { icon: 'cash', color: '#0B2545' },
  property: { icon: 'business', color: '#7C5CFC' },
  system: { icon: 'notifications', color: '#64748B' },
};

export default function ActivityLogScreen() {
  const t = useTheme();
  const { state } = useStore();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <View style={{ padding: spacing.lg }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.colors.text, letterSpacing: -0.5 }}>Activity log</Text>
        <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2 }}>Audit trail of all platform events</Text>
      </View>
      <FlatList
        data={state.activities}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        ListEmptyComponent={<EmptyState icon="time" title="No activity" message="Events will appear here as they happen." />}
        renderItem={({ item, index }) => {
          const meta = TYPE_ICON[item.type] ?? TYPE_ICON.system;
          return (
            <View style={{ flexDirection: 'row' }}>
              <View style={{ alignItems: 'center', width: 36 }}>
                <View style={[styles.dot, { backgroundColor: meta.color + '1A' }]}>
                  <Ionicons name={meta.icon} size={14} color={meta.color} />
                </View>
                {index < state.activities.length - 1 && <View style={{ flex: 1, width: 1.5, backgroundColor: t.colors.border, marginTop: 4 }} />}
              </View>
              <View style={{ flex: 1, paddingBottom: spacing.lg, marginLeft: spacing.sm }}>
                <Text style={{ fontSize: 13, color: t.colors.text, lineHeight: 19 }}>{item.text}</Text>
                <Text style={{ fontSize: 11, color: t.colors.subtext, marginTop: 3 }}>
                  {timeAgo(item.createdAt)} · {item.actor}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = {
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const },
};
