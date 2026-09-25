import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Avatar, EmptyState } from '../../components/ui';
import { timeAgo } from '../../utils';

export default function MessagesScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { state, currentUser } = useStore();

  const conversations = useMemo(() => {
    let list = state.conversations;
    if (currentUser?.role === 'tenant' && currentUser.tenantId) {
      list = list.filter((c) => c.tenantId === currentUser.tenantId);
    }
    return [...list].sort((a, b) => {
      const la = a.messages[a.messages.length - 1]?.createdAt ?? '';
      const lb = b.messages[b.messages.length - 1]?.createdAt ?? '';
      return lb.localeCompare(la);
    });
  }, [state.conversations, currentUser]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <View style={{ padding: spacing.lg }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.colors.text, letterSpacing: -0.5 }}>Messages</Text>
        <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2 }}>Tenant communication hub</Text>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        ListEmptyComponent={<EmptyState icon="chatbubbles" title="No conversations" message="Messages with tenants will appear here." />}
        renderItem={({ item }) => {
          const tenant = state.tenants.find((tn) => tn.id === item.tenantId);
          const unit = tenant ? state.units.find((u) => u.id === tenant.unitId) : null;
          const prop = tenant ? state.properties.find((p) => p.id === tenant.propertyId) : null;
          const last = item.messages[item.messages.length - 1];
          const unread = item.messages.filter((m) => !m.read && m.senderId !== currentUser?.id).length;
          return (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => nav.navigate('MessageThread', { conversationId: item.id })}
              style={[styles.row, { backgroundColor: t.colors.card }]}
            >
              <Avatar name={tenant?.name ?? '?'} color={tenant?.avatarColor ?? t.colors.subtext} size={46} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: t.colors.text, flex: 1 }} numberOfLines={1}>
                    {tenant?.name ?? 'Unknown'}
                  </Text>
                  {last && <Text style={{ fontSize: 11, color: t.colors.subtext }}>{timeAgo(last.createdAt)}</Text>}
                </View>
                <Text style={{ fontSize: 12, color: t.colors.subtext, marginTop: 2 }} numberOfLines={1}>
                  {unit?.unitNumber} · {prop?.name}
                </Text>
                <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 4 }} numberOfLines={1}>
                  {last ? last.text : 'No messages yet'}
                </Text>
              </View>
              {unread > 0 && (
                <View style={[styles.unread, { backgroundColor: t.colors.danger }]}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm,
  },
  unread: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: spacing.sm,
  },
});
