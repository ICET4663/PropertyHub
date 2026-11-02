/**
 * Chats between any two people (or a staff-made group), stored in Supabase.
 *
 * Who may message whom is decided by the server (supabase/migrations/20261030000000_messaging.sql):
 * tenants reach the staff of their own property, staff reach staff and the tenants they look after.
 */
import type { Role } from '../types';
import { rpc } from './db';
import { supabase } from './supabase';

export interface ChatMember { id: string; name: string; role: Role; lastReadAt: string }

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  body: string;
  replyTo?: string;
  createdAt: string;
  deletedAt?: string;
  /** Only on this phone's own copy until the server has it. */
  pending?: 'sending' | 'failed';
}

export interface Conversation {
  id: string;
  kind: 'direct' | 'group';
  title: string;
  createdBy: string | null;
  lastMessageAt: string;
  members: ChatMember[];
  lastMessage: Pick<ChatMessage, 'id' | 'senderId' | 'body' | 'createdAt' | 'deletedAt'> | null;
  unread: number;
}

export interface ChatContact { id: string; name: string; role: Role; detail: string }

type Row = Record<string, unknown>;

const toMessage = (r: Row): ChatMessage => ({
  id: r.id as string,
  conversationId: r.conversation_id as string,
  senderId: (r.sender_id as string | null) ?? null,
  body: (r.body as string) ?? '',
  replyTo: (r.reply_to as string | null) ?? undefined,
  createdAt: r.created_at as string,
  deletedAt: (r.deleted_at as string | null) ?? undefined,
});

export async function listConversations(): Promise<Conversation[]> {
  const rows = await rpc<Row[]>('my_conversations', {});
  return (rows ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as Conversation['kind'],
    title: (r.title as string) ?? '',
    createdBy: (r.created_by as string | null) ?? null,
    lastMessageAt: r.last_message_at as string,
    members: (r.members as ChatMember[] | null) ?? [],
    lastMessage: (r.last_message as Conversation['lastMessage']) ?? null,
    unread: (r.unread as number) ?? 0,
  }));
}

export const PAGE = 40;

/** Up to PAGE messages before `before` (or the newest), oldest first. */
export async function listMessages(conversationId: string, before?: string): Promise<ChatMessage[]> {
  let query = supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(PAGE);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as Row[]).map(toMessage).reverse();
}

export async function sendMessage(m: Pick<ChatMessage, 'id' | 'conversationId' | 'senderId' | 'body' | 'replyTo'>): Promise<ChatMessage> {
  const { data, error } = await supabase.from('messages')
    .insert({ id: m.id, conversation_id: m.conversationId, sender_id: m.senderId, body: m.body, reply_to: m.replyTo ?? null })
    .select('*').single();
  if (error) throw new Error(error.message);
  return toMessage(data as Row);
}

export const listContacts = async () => (await rpc<ChatContact[]>('chat_contacts', {})) ?? [];
export const startDirectChat = (other: string) => rpc<string>('start_direct_chat', { other });
export const createGroupChat = (title: string, people: string[]) => rpc<string>('create_group_chat', { p_title: title, people });
export const markConversationRead = (conv: string) => rpc('mark_conversation_read', { conv });
export const deleteMessage = (msg: string) => rpc('delete_message', { msg });
export const leaveGroupChat = (conv: string) => rpc('leave_group_chat', { conv });

/** Calls back on every change to chats this account belongs to (row level security filters the feed). */
export function subscribeToChats(userId: string, on: {
  message: (m: ChatMessage, isNew: boolean) => void;
  receipt: (conversationId: string, profileId: string, lastReadAt: string) => void;
  membership: () => void;
  connected: () => void;
}) {
  const channel = supabase.channel(`chat-${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => on.message(toMessage(p.new as Row), true))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => on.message(toMessage(p.new as Row), false))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' }, (p) => {
      const r = p.new as Row;
      on.receipt(r.conversation_id as string, r.profile_id as string, r.last_read_at as string);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members' }, () => on.membership())
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'conversation_members' }, () => on.membership())
    .subscribe((status) => { if (status === 'SUBSCRIBED') on.connected(); });
  return () => { void supabase.removeChannel(channel); };
}

/** A random v4 UUID, so a message keeps one id from this phone to the server and back. */
export function newMessageId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The name a chat shows: the group's title, or the other person in a direct chat. */
export function chatTitle(c: Conversation, meId: string): string {
  if (c.kind === 'group') return c.title;
  return c.members.find((m) => m.id !== meId)?.name ?? 'Unknown';
}

export function otherMember(c: Conversation, meId: string): ChatMember | undefined {
  return c.kind === 'direct' ? c.members.find((m) => m.id !== meId) : undefined;
}
