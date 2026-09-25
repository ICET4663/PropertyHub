import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Avatar, Button } from '../../components/ui';
import { timeAgo } from '../../utils';

export default function MessageThreadScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { state, currentUser, sendMessage, markConversationRead } = useStore();
  const { conversationId } = route.params;
  const conv = state.conversations.find((c) => c.id === conversationId);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    markConversationRead(conversationId);
  }, [conversationId, conv?.messages.length]);

  if (!conv) return null;

  const tenant = state.tenants.find((tn) => tn.id === conv.tenantId);
  const unit = tenant ? state.units.find((u) => u.id === tenant.unitId) : null;
  const prop = tenant ? state.properties.find((p) => p.id === tenant.propertyId) : null;
  const isMine = (senderId: string) => senderId === currentUser?.id;

  const onSend = () => {
    if (!text.trim()) return;
    sendMessage(conversationId, text.trim());
    setText('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: t.colors.card, borderBottomColor: t.colors.border }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={[styles.backBtn, { backgroundColor: t.colors.inputBg }]}>
          <Ionicons name="arrow-back" size={20} color={t.colors.text} />
        </TouchableOpacity>
        {tenant && <Avatar name={tenant.name} color={tenant.avatarColor} size={38} />}
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text }}>{tenant?.name ?? 'Conversation'}</Text>
          <Text style={{ fontSize: 12, color: t.colors.subtext }}>
            {unit?.unitNumber} · {prop?.name}
          </Text>
        </View>
        <Ionicons name="call-outline" size={20} color={t.colors.primary} style={{ marginRight: spacing.md }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={conv.messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.sm }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color={t.colors.subtext} />
              <Text style={{ color: t.colors.subtext, fontSize: 13, marginTop: spacing.md }}>No messages yet. Start the conversation.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = isMine(item.senderId);
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: spacing.sm }}>
                <View
                  style={[
                    styles.bubble,
                    {
                      backgroundColor: mine ? t.colors.primary : t.colors.card,
                      borderBottomRightRadius: mine ? 4 : radius.md,
                      borderBottomLeftRadius: mine ? radius.md : 4,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 14, lineHeight: 20, color: mine ? '#fff' : t.colors.text }}>{item.text}</Text>
                </View>
                <Text style={{ fontSize: 10, color: t.colors.subtext, marginTop: 3 }}>{timeAgo(item.createdAt)}</Text>
              </View>
            );
          }}
        />

        {/* Input */}
        <View style={[styles.inputBar, { backgroundColor: t.colors.card, borderTopColor: t.colors.border }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor={t.colors.subtext}
            style={[styles.input, { backgroundColor: t.colors.inputBg, color: t.colors.text }]}
            multiline
            returnKeyType="send"
            onSubmitEditing={onSend}
          />
          <TouchableOpacity
            onPress={onSend}
            disabled={!text.trim()}
            style={[styles.sendBtn, { backgroundColor: t.colors.primary, opacity: text.trim() ? 1 : 0.4 }]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  bubble: {
    maxWidth: '78%', paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.md,
  },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: spacing.md, borderTopWidth: 1, gap: spacing.sm,
  },
  input: {
    flex: 1, borderRadius: radius.md, paddingHorizontal: spacing.md,
    paddingVertical: 10, fontSize: 14, maxHeight: 100,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
