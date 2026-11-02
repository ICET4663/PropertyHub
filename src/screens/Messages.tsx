/**
 * Messages: WhatsApp-style chats between every role. Two panes on wide screens (chat list beside the
 * open chat); on phones the list and the chat are separate screens (`messages` and `messages?id=`).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Ban, Check, CheckCheck, ChevronDown, CircleAlert, Clock, LogOut, MessageCirclePlus, MessageSquare, Reply, Search, Send, Trash2, Users, X,
} from 'lucide-react-native';
import { AVATAR_TONES, colors, font, radius, useBreakpoint } from '../theme';
import { useStore } from '../store/AppContext';
import { EMPTY_THREAD, useChat } from '../store/ChatContext';
import { chatTitle, otherMember, type ChatContact, type ChatMessage, type Conversation } from '../lib/chat';
import { useRouter } from '../nav/router';
import { SectionTabs, roleLabel } from '../components/shell';
import { Avatar, Button, Chip, Dialog, EmptyState, IconButton, Input, Menu, T, Touch, useConfirm, useToast } from '../components/ui';
import { DAYS_FULL, feedStamp, fmtDate, fmtTime, hashIndex, isToday } from '../utils';

const CHAT_BG = '#EFEAE2';
const MINE = '#D9F2E3';

export function MessagesScreen({ id }: { id: string }) {
  const { bp } = useBreakpoint();
  const wide = bp !== 'mobile';
  const insets = useSafeAreaInsets();
  const { conversations } = useChat();
  const open = id ? conversations?.find((c) => c.id === id) : undefined;

  if (!wide) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.card }}>
        {id ? <ChatThread key={id} id={id} conversation={open} topOffset={60 + insets.top} /> : <ChatList selected="" />}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, padding: 20, gap: 12 }}>
      <SectionTabs />
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        <View style={{ width: bp === 'desktop' ? 370 : 300, borderRightWidth: 1, borderRightColor: colors.border }}>
          <ChatList selected={id} />
        </View>
        <View style={{ flex: 1 }}>
          {id ? <ChatThread key={id} id={id} conversation={open} topOffset={64 + insets.top} /> : <NoChatOpen />}
        </View>
      </View>
    </View>
  );
}

function NoChatOpen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, padding: 24 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <MessageSquare size={32} color={colors.primary} />
      </View>
      <T size={17} weight="bold">PropertyHub Messages</T>
      <T size={13} color={colors.subtext} center style={{ marginTop: 6, maxWidth: 340 }}>
        Pick a chat on the left, or start a new one with your property team, caretakers or tenants.
      </T>
    </View>
  );
}

/**
 * Opens the chat with a tenant's login. A tenant who hasn't signed up has no account to chat with, so
 * staff get the announcement form addressed to them instead (SMS, email, WhatsApp).
 */
export function useMessageTenant() {
  const { state } = useStore();
  const { openDirect } = useChat();
  const { navigate } = useRouter();
  const toast = useToast();
  return (tenantId: string) => {
    const account = state.users.find((u) => u.role === 'tenant' && u.tenantId === tenantId && u.status !== 'suspended');
    if (!account) {
      toast('This tenant hasn’t set up their app account yet, so send them an announcement instead.', 'info');
      navigate('communications', { tenantId });
      return;
    }
    openDirect(account.id).then((id) => navigate('messages', { id }), (e) => toast(e instanceof Error ? e.message : String(e), 'danger'));
  };
}

// ---------------------------------------------------------------- chat list

type Filter = 'all' | 'unread' | 'groups';

function ChatList({ selected }: { selected: string }) {
  const { conversations, error, reload } = useChat();
  const { me } = useStore();
  const { bp } = useBreakpoint();
  const { navigate, replace } = useRouter();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const meId = me?.id ?? '';

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (conversations ?? []).filter((c) => {
      if (filter === 'unread' && !c.unread) return false;
      if (filter === 'groups' && c.kind !== 'group') return false;
      return !s || chatTitle(c, meId).toLowerCase().includes(s) || (c.lastMessage?.body ?? '').toLowerCase().includes(s);
    });
  }, [conversations, q, filter, meId]);

  const openChat = (id: string) => (bp === 'mobile' ? navigate('messages', { id }) : replace('messages', { id }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.card }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={20} weight="bold" style={{ letterSpacing: -0.3 }}>Chats</T>
          <IconButton icon={MessageCirclePlus} accessibilityLabel="New chat" onPress={() => setCreating(true)} color={colors.primary} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, borderRadius: radius.md, backgroundColor: colors.neutralSoft, paddingHorizontal: 12 }}>
          <Search size={15} color={colors.subtext} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search chats"
            placeholderTextColor={colors.faint}
            style={[{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: colors.text, paddingVertical: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
          />
          {q ? <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search"><X size={15} color={colors.subtext} /></Pressable> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups']] as [Filter, string][]).map(([k, l]) => <Chip key={k} label={l} active={filter === k} onPress={() => setFilter(k)} />)}
        </View>
      </View>
      {conversations === null ? (
        error ? (
          <View style={{ padding: 20, gap: 10 }}>
            <T size={13} color={colors.danger}>{error}</T>
            <Button title="Try again" size="sm" variant="secondary" onPress={() => void reload()} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : shown.length === 0 ? (
        <View style={{ padding: 8 }}>
          <EmptyState
            icon={MessageSquare}
            title={conversations.length ? 'No chats match' : 'No chats yet'}
            body={conversations.length ? undefined : 'Message your property team, caretakers or tenants. Chats you start show up here.'}
            action={conversations.length ? undefined : <Button title="Start a chat" icon={MessageCirclePlus} onPress={() => setCreating(true)} />}
          />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ChatRow c={item} meId={meId} active={item.id === selected} onPress={() => openChat(item.id)} />}
          keyboardShouldPersistTaps="handled"
        />
      )}
      <NewChatDialog open={creating} onClose={() => setCreating(false)} onOpened={(id) => { setCreating(false); openChat(id); }} />
    </View>
  );
}

function ChatAvatar({ c, meId, size = 46 }: { c: Conversation; meId: string; size?: number }) {
  if (c.kind === 'group') {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Users size={size * 0.45} color={colors.primary} />
      </View>
    );
  }
  return <Avatar name={chatTitle(c, meId)} size={size} />;
}

function Ticks({ m, c, meId, size = 15 }: { m: Pick<ChatMessage, 'createdAt' | 'pending'>; c?: Conversation; meId: string; size?: number }) {
  if (m.pending === 'sending') return <Clock size={size - 3} color={colors.faint} />;
  if (m.pending === 'failed') return <CircleAlert size={size - 2} color={colors.danger} />;
  const others = c?.members.filter((x) => x.id !== meId) ?? [];
  const read = others.length > 0 && others.every((x) => x.lastReadAt >= m.createdAt);
  return read ? <CheckCheck size={size} color={colors.info} /> : <Check size={size} color={colors.faint} />;
}

function previewText(c: Conversation, meId: string): string {
  const m = c.lastMessage;
  if (!m) return c.kind === 'group' ? `Group with ${c.members.length} people` : 'Say hello 👋';
  if (m.deletedAt) return 'This message was deleted';
  if (c.kind === 'group' && m.senderId !== meId) return `${c.members.find((x) => x.id === m.senderId)?.name.split(' ')[0] ?? 'Someone'}: ${m.body}`;
  return m.body;
}

function ChatRow({ c, meId, active, onPress }: { c: Conversation; meId: string; active: boolean; onPress: () => void }) {
  const other = otherMember(c, meId);
  const mine = c.lastMessage?.senderId === meId && !c.lastMessage?.deletedAt;
  return (
    <Touch
      onPress={onPress}
      accessibilityLabel={`${chatTitle(c, meId)}${c.unread ? `, ${c.unread} unread` : ''}`}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }, active && { backgroundColor: colors.neutralSoft }]}
      hoverStyle={{ backgroundColor: active ? colors.neutralSoft : colors.cardAlt }}
    >
      <ChatAvatar c={c} meId={meId} />
      <View style={{ flex: 1, minWidth: 0, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 10, marginBottom: -10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T size={14.5} weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{chatTitle(c, meId)}</T>
          {other ? <T size={11} color={colors.subtext} numberOfLines={1}>{roleLabel(other.role)}</T> : null}
          <View style={{ flex: 1 }} />
          {c.lastMessage ? <T size={11.5} color={c.unread ? colors.success : colors.subtext} weight={c.unread ? 'semibold' : 'regular'}>{feedStamp(c.lastMessage.createdAt)}</T> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          {mine && c.lastMessage ? <Ticks m={c.lastMessage} c={c} meId={meId} size={14} /> : null}
          {c.lastMessage?.deletedAt ? <Ban size={13} color={colors.faint} /> : null}
          <T size={13} color={colors.subtext} numberOfLines={1} style={[{ flex: 1 }, c.lastMessage?.deletedAt ? { fontStyle: 'italic' } : null]}>{previewText(c, meId)}</T>
          {c.unread ? (
            <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
              <T size={11} weight="bold" color={colors.white} style={{ lineHeight: 14 }}>{c.unread > 99 ? '99+' : c.unread}</T>
            </View>
          ) : null}
        </View>
      </View>
    </Touch>
  );
}

// ---------------------------------------------------------------- open chat

type Item = { kind: 'day'; key: string; label: string } | { kind: 'msg'; key: string; m: ChatMessage; first: boolean };

function dayLabel(iso: string): string {
  if (isToday(iso)) return 'Today';
  const d = new Date(iso);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (Date.now() - d.getTime() < 6 * 86400000) return DAYS_FULL[d.getDay()];
  return fmtDate(iso);
}

const dayOf = (iso: string) => new Date(iso).toDateString();

function ChatThread({ id, conversation: c, topOffset }: { id: string; conversation?: Conversation; topOffset: number }) {
  const { me } = useStore();
  const chat = useChat();
  const { bp } = useBreakpoint();
  const { back } = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const input = useRef<TextInput>(null);
  const thread = chat.threads[id] ?? EMPTY_THREAD;
  const meId = me?.id ?? '';
  const mobile = bp === 'mobile';
  const gutter = mobile ? 10 : 24;
  const { loadThread, setActive } = chat;

  useEffect(() => {
    if (!thread.loaded && !thread.loading) void loadThread(id);
  }, [id, thread.loaded, thread.loading, loadThread]);
  useEffect(() => {
    setActive(id);
    return () => setActive(null);
  }, [id, setActive]);

  const items = useMemo(() => {
    const out: Item[] = [];
    thread.list.forEach((m, i) => {
      const prev = thread.list[i - 1];
      const newDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt);
      if (newDay) out.push({ kind: 'day', key: `day-${m.createdAt}`, label: dayLabel(m.createdAt) });
      out.push({ kind: 'msg', key: m.id, m, first: newDay || prev.senderId !== m.senderId });
    });
    return out.reverse(); // the list is inverted: newest at the bottom
  }, [thread.list]);

  if (!c) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {chat.conversations === null ? <ActivityIndicator color={colors.primary} /> : (
          <EmptyState icon={MessageSquare} title="This chat isn’t available" body="It may have been removed, or you’re no longer a member." action={mobile ? <Button title="Back to chats" variant="secondary" onPress={() => back('messages')} /> : undefined} />
        )}
      </View>
    );
  }

  const title = chatTitle(c, meId);
  const other = otherMember(c, meId);
  const subtitle = other ? roleLabel(other.role) : c.members.map((m) => (m.id === meId ? 'You' : m.name.split(' ')[0])).join(', ');
  const byId = new Map(thread.list.map((m) => [m.id, m]));

  const submit = () => {
    if (!text.trim()) return;
    chat.send(id, text, replyTo?.id);
    setText('');
    setReplyTo(null);
  };
  const startReply = (m: ChatMessage) => { setReplyTo(m); setSelected(null); input.current?.focus(); };
  const removeMessage = (m: ChatMessage) => {
    setSelected(null);
    confirm.ask({
      title: 'Delete this message?', body: 'It will be deleted for everyone in this chat.', confirm: 'Delete for everyone', danger: true,
      onConfirm: () => { chat.remove(m).catch((e) => toast(e instanceof Error ? e.message : String(e), 'danger')); },
    });
  };
  const leave = () => confirm.ask({
    title: `Leave “${c.title}”?`, body: 'You’ll stop getting messages from this group.', confirm: 'Leave group', danger: true,
    onConfirm: () => { chat.leave(id).then(() => back('messages'), (e) => toast(e instanceof Error ? e.message : String(e), 'danger')); },
  });

  const nameOf = (senderId: string | null) => (senderId === meId ? 'You' : c.members.find((x) => x.id === senderId)?.name ?? 'Former member');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={topOffset}>
      {/* header, or the actions for a selected message */}
      {selected ? (
        <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, backgroundColor: colors.primary }}>
          <IconButton icon={X} accessibilityLabel="Cancel" color={colors.white} onPress={() => setSelected(null)} />
          <T size={14} weight="semibold" color={colors.white} style={{ flex: 1 }}>1 selected</T>
          {!selected.deletedAt && !selected.pending ? <IconButton icon={Reply} accessibilityLabel="Reply" color={colors.white} onPress={() => startReply(selected)} /> : null}
          {selected.senderId === meId && !selected.deletedAt ? <IconButton icon={Trash2} accessibilityLabel="Delete for everyone" color={colors.white} onPress={() => removeMessage(selected)} /> : null}
        </View>
      ) : (
        <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: mobile ? 6 : 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {mobile ? <IconButton icon={ArrowLeft} accessibilityLabel="Back to chats" onPress={() => back('messages')} /> : null}
          <ChatAvatar c={c} meId={meId} size={38} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={14.5} weight="semibold" numberOfLines={1}>{title}</T>
            <T size={11.5} color={colors.subtext} numberOfLines={1}>{subtitle}</T>
          </View>
          {c.kind === 'group' ? (
            <Menu trigger={(openMenu) => <IconButton icon={ChevronDown} accessibilityLabel="Group options" onPress={openMenu} />} items={[{ label: 'Leave group', icon: LogOut, danger: true, onPress: leave }]} />
          ) : null}
        </View>
      )}

      {/* messages */}
      <View style={{ flex: 1, backgroundColor: CHAT_BG }}>
        {!thread.loaded && thread.list.length === 0 ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (
          <FlatList
            inverted
            data={items}
            keyExtractor={(x) => x.key}
            contentContainerStyle={{ paddingHorizontal: gutter, paddingVertical: 12 }}
            onEndReached={() => void chat.loadOlder(id)}
            onEndReachedThreshold={0.3}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={thread.loading && thread.loaded ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} /> : !thread.more && thread.loaded ? <PrivacyNote kind={c.kind} /> : null}
            renderItem={({ item }) => item.kind === 'day' ? (
              <View style={{ alignItems: 'center', marginVertical: 10 }}>
                <View style={{ backgroundColor: colors.card, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <T size={11.5} weight="medium" color={colors.subtext}>{item.label}</T>
                </View>
              </View>
            ) : (
              <Bubble
                m={item.m}
                gutter={gutter}
                first={item.first}
                mine={item.m.senderId === meId}
                sender={c.kind === 'group' && item.m.senderId !== meId ? nameOf(item.m.senderId) : null}
                quoted={item.m.replyTo ? byId.get(item.m.replyTo) : undefined}
                quotedName={item.m.replyTo ? nameOf(byId.get(item.m.replyTo)?.senderId ?? null) : ''}
                ticks={<Ticks m={item.m} c={c} meId={meId} />}
                selected={selected?.id === item.m.id}
                onSelect={() => setSelected(item.m)}
                onRetry={() => chat.retry(item.m)}
              />
            )}
          />
        )}
      </View>

      {/* composer */}
      <View style={{ backgroundColor: colors.cardAlt, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: mobile ? 8 : 14, paddingVertical: 8 }}>
        {replyTo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.md, borderLeftWidth: 4, borderLeftColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6 }}>
            <View style={{ flex: 1 }}>
              <T size={12} weight="semibold" color={colors.primary}>{nameOf(replyTo.senderId)}</T>
              <T size={12.5} color={colors.subtext} numberOfLines={1}>{replyTo.body}</T>
            </View>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8} accessibilityLabel="Cancel reply"><X size={16} color={colors.subtext} /></Pressable>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message"
            placeholderTextColor={colors.faint}
            multiline
            maxLength={4000}
            onKeyPress={(e) => {
              // Enter sends on the web; Shift+Enter starts a new line.
              const ev = e as unknown as { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault: () => void };
              if (Platform.OS === 'web' && ev.nativeEvent.key === 'Enter' && !ev.nativeEvent.shiftKey) { ev.preventDefault(); submit(); }
            }}
            style={[
              { flex: 1, minHeight: 42, maxHeight: 130, backgroundColor: colors.card, borderRadius: 21, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontFamily: font.regular, fontSize: 14.5, color: colors.text },
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
            ]}
          />
          <Pressable
            onPress={submit}
            disabled={!text.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: text.trim() ? colors.primary : colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}
          >
            <Send size={18} color={colors.white} style={{ marginLeft: -2 }} />
          </Pressable>
        </View>
      </View>
      {confirm.node}
    </KeyboardAvoidingView>
  );
}

function PrivacyNote({ kind }: { kind: Conversation['kind'] }) {
  return (
    <View style={{ alignItems: 'center', marginVertical: 10 }}>
      <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 420 }}>
        <T size={11.5} color={colors.textSoft} center>
          {kind === 'group' ? 'This is the start of the group. Only its members can read these messages.' : 'This is the start of your chat. Only the two of you can read these messages.'}
        </T>
      </View>
    </View>
  );
}

function Bubble({ m, gutter, first, mine, sender, quoted, quotedName, ticks, selected, onSelect, onRetry }: {
  m: ChatMessage; gutter: number; first: boolean; mine: boolean; sender: string | null; quoted?: ChatMessage; quotedName: string;
  ticks: React.ReactNode; selected: boolean; onSelect: () => void; onRetry: () => void;
}) {
  const [hover, setHover] = useState(false);
  const deleted = !!m.deletedAt;
  return (
    <Pressable
      onLongPress={onSelect}
      onPress={m.pending === 'failed' ? onRetry : undefined}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      delayLongPress={300}
      accessibilityHint={m.pending === 'failed' ? 'Not sent. Tap to try again' : 'Long press for options'}
      style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginTop: first ? 8 : 2, backgroundColor: selected ? 'rgba(31,92,74,0.12)' : 'transparent', marginHorizontal: -gutter, paddingHorizontal: gutter }}
    >
      <View style={{
        maxWidth: '78%', minWidth: 90, backgroundColor: mine ? MINE : colors.card, borderRadius: 10, paddingHorizontal: 9, paddingTop: 6, paddingBottom: 5,
        borderTopRightRadius: mine && first ? 2 : 10, borderTopLeftRadius: !mine && first ? 2 : 10,
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 1, shadowOffset: { width: 0, height: 1 }, elevation: 1,
      }}>
        {sender && first ? <T size={12.5} weight="semibold" color={AVATAR_TONES[hashIndex(sender, AVATAR_TONES.length)][1]} style={{ marginBottom: 1 }}>{sender}</T> : null}
        {quoted && !deleted ? (
          <View style={{ backgroundColor: mine ? 'rgba(0,0,0,0.05)' : colors.neutralSoft, borderLeftWidth: 4, borderLeftColor: colors.primary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 }}>
            <T size={12} weight="semibold" color={colors.primary}>{quotedName}</T>
            <T size={12.5} color={colors.subtext} numberOfLines={2}>{quoted.deletedAt ? 'This message was deleted' : quoted.body}</T>
          </View>
        ) : null}
        {deleted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ban size={14} color={colors.faint} />
            <T size={13.5} color={colors.subtext} style={{ fontStyle: 'italic' }}>{mine ? 'You deleted this message' : 'This message was deleted'}</T>
          </View>
        ) : <T size={14.5} selectable style={{ lineHeight: 20 }}>{m.body}</T>}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 1 }}>
          {m.pending === 'failed' ? <T size={10.5} color={colors.danger} weight="semibold">Not sent · tap to retry  </T> : null}
          <T size={10.5} color={colors.subtext}>{fmtTime(m.createdAt)}</T>
          {mine && !deleted ? ticks : null}
        </View>
        {hover && Platform.OS === 'web' && !deleted ? (
          <Pressable onPress={onSelect} accessibilityLabel="Message options" style={{ position: 'absolute', top: 3, right: 4, borderRadius: 10, backgroundColor: mine ? MINE : colors.card, padding: 1 }}>
            <ChevronDown size={16} color={colors.subtext} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- new chat / new group

function NewChatDialog({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: (id: string) => void }) {
  const chat = useChat();
  const { me } = useStore();
  const toast = useToast();
  const [contacts, setContacts] = useState<ChatContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const isStaff = !!me && me.role !== 'tenant';
  const { contacts: fetchContacts } = chat;

  // Start fresh each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) { setQ(''); setGroup(false); setPicked([]); setTitle(''); setError(null); }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchContacts().then((list) => { if (!cancelled) setContacts(list); }).catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [open, fetchContacts]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (contacts ?? []).filter((c) => !s || c.name.toLowerCase().includes(s) || c.detail.toLowerCase().includes(s) || roleLabel(c.role).toLowerCase().includes(s));
  }, [contacts, q]);

  const sections = useMemo(() => {
    const staff = shown.filter((c) => c.role !== 'tenant');
    const tenants = shown.filter((c) => c.role === 'tenant');
    return [{ title: me?.role === 'tenant' ? 'Your property team' : 'Team', list: staff }, { title: 'Tenants', list: tenants }].filter((s) => s.list.length);
  }, [shown, me?.role]);

  const pick = async (c: ChatContact) => {
    if (group) { setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id])); return; }
    setBusy(true);
    try { onOpened(await chat.openDirect(c.id)); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'danger'); } finally { setBusy(false); }
  };
  const makeGroup = async () => {
    if (!title.trim()) { toast('Give the group a name', 'danger'); return; }
    if (!picked.length) { toast('Add at least one person', 'danger'); return; }
    setBusy(true);
    try { onOpened(await chat.createGroup(title.trim(), picked)); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'danger'); } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={group ? 'New group' : 'New chat'}
      subtitle={group ? 'Pick who’s in the group.' : me?.role === 'tenant' ? 'Message the people who look after your home.' : 'Message anyone on your team or a tenant you look after.'}
      width={480}
      footer={group ? (
        <>
          <Button title="Back" variant="secondary" onPress={() => { setGroup(false); setPicked([]); }} />
          <Button title={`Create group${picked.length ? ` (${picked.length + 1})` : ''}`} icon={Users} loading={busy} onPress={() => void makeGroup()} />
        </>
      ) : undefined}
    >
      {group ? <Input label="Group name" value={title} onChangeText={setTitle} placeholder="e.g. Block A residents" maxLength={80} fieldStyle={{ marginBottom: 12 }} /> : null}
      <Input leftIcon={Search} value={q} onChangeText={setQ} placeholder="Search by name, role or flat" />
      {!group && isStaff ? (
        <Touch onPress={() => setGroup(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, marginTop: 8 }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Users size={18} color={colors.white} /></View>
          <T size={14} weight="semibold">New group</T>
        </Touch>
      ) : null}
      <View style={{ marginTop: 6 }}>
        {error ? <T size={13} color={colors.danger} style={{ paddingVertical: 12 }}>{error}</T> : contacts === null ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} /> : sections.length === 0 ? (
          <T size={13} color={colors.subtext} style={{ paddingVertical: 16 }}>{contacts.length ? `No one matches “${q}”.` : 'There’s no one you can message yet.'}</T>
        ) : (
          sections.map((s) => (
            <View key={s.title}>
              <T size={11} weight="bold" upper color={colors.faint} style={{ marginTop: 10, marginBottom: 2 }}>{s.title}</T>
              {s.list.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <Touch key={c.id} onPress={() => void pick(c)} disabled={busy} accessibilityLabel={group ? `${c.name}${on ? ', selected' : ''}` : `Message ${c.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
                    <Avatar name={c.name} size={40} />
                    <View style={{ flex: 1 }}>
                      <T size={14} weight="semibold" numberOfLines={1}>{c.name}</T>
                      <T size={12} color={colors.subtext} numberOfLines={1}>{roleLabel(c.role)}{c.detail ? ` · ${c.detail}` : ''}</T>
                    </View>
                    {group ? (
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 0 : 2, borderColor: colors.borderStrong, backgroundColor: on ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {on ? <Check size={14} color={colors.white} strokeWidth={3} /> : null}
                      </View>
                    ) : null}
                  </Touch>
                );
              })}
            </View>
          ))
        )}
      </View>
    </Dialog>
  );
}
