/**
 * Chat state for the signed-in account: the chat list with unread counts, the messages of each open
 * chat, and a live feed that keeps both current. Mounted around the signed-in screens, so the sidebar
 * and tabs can show unread badges anywhere in the app.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { useStore } from './AppContext';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  PAGE, createGroupChat, deleteMessage, leaveGroupChat, listContacts, listConversations, listMessages, markConversationRead,
  newMessageId, sendMessage, startDirectChat, subscribeToChats, type ChatContact, type ChatMessage, type Conversation,
} from '../lib/chat';

export interface Thread { list: ChatMessage[]; loaded: boolean; more: boolean; loading: boolean }

interface ChatStore {
  /** Null until the first load. */
  conversations: Conversation[] | null;
  unreadTotal: number;
  error: string | null;
  threads: Record<string, Thread>;
  reload: () => Promise<void>;
  loadThread: (conversationId: string) => Promise<void>;
  loadOlder: (conversationId: string) => Promise<void>;
  send: (conversationId: string, body: string, replyTo?: string) => void;
  retry: (message: ChatMessage) => void;
  remove: (message: ChatMessage) => Promise<void>;
  /** The chat on screen: its new messages are marked read as they arrive. */
  setActive: (conversationId: string | null) => void;
  markRead: (conversationId: string) => void;
  contacts: () => Promise<ChatContact[]>;
  openDirect: (profileId: string) => Promise<string>;
  createGroup: (title: string, people: string[]) => Promise<string>;
  leave: (conversationId: string) => Promise<void>;
}

const Ctx = createContext<ChatStore | null>(null);
const EMPTY: Thread = { list: [], loaded: false, more: false, loading: false };

const byNewest = (a: Conversation, b: Conversation) => (a.lastMessageAt < b.lastMessageAt ? 1 : a.lastMessageAt > b.lastMessageAt ? -1 : 0);

/** The list with `m` added or replaced, oldest first. */
function upsert(list: ChatMessage[], m: ChatMessage): ChatMessage[] {
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) return list.map((x, j) => (j === i ? m : x));
  const next = [...list, m];
  return next.length > 1 && next[next.length - 2].createdAt > m.createdAt ? next.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)) : next;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { state } = useStore();
  const meId = state.sessionUserId;
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [error, setError] = useState<string | null>(null);
  const active = useRef<string | null>(null);
  // Another account signed in: drop the previous one's chats.
  const [owner, setOwner] = useState(meId);
  if (owner !== meId) { setOwner(meId); setConversations(null); setThreads({}); }
  const convRef = useRef<Conversation[] | null>(null);
  const threadsRef = useRef(threads);
  useEffect(() => { convRef.current = conversations; threadsRef.current = threads; });

  const patchConv = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((list) => list?.map((c) => (c.id === id ? fn(c) : c)).sort(byNewest) ?? list);
  }, []);
  const patchThread = useCallback((id: string, fn: (t: Thread) => Thread) => {
    setThreads((all) => ({ ...all, [id]: fn(all[id] ?? EMPTY) }));
  }, []);

  const reload = useCallback(async () => {
    if (!meId || !isSupabaseConfigured) return;
    try {
      const list = await listConversations();
      // Keep zero unread for the chat on screen; the server only hears about it a moment later.
      setConversations(list.map((c) => (c.id === active.current ? { ...c, unread: 0 } : c)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [meId]);

  const markRead = useCallback((id: string) => {
    if (!meId) return;
    const now = new Date().toISOString();
    patchConv(id, (c) => ({ ...c, unread: 0, members: c.members.map((m) => (m.id === meId ? { ...m, lastReadAt: now } : m)) }));
    markConversationRead(id).catch(() => {});
  }, [meId, patchConv]);

  const loadThread = useCallback(async (id: string) => {
    const t = threadsRef.current[id];
    if (t?.loading || t?.loaded) return;
    patchThread(id, (x) => ({ ...x, loading: true }));
    try {
      const list = await listMessages(id);
      // The server's copy wins; keep only what it can't have yet (still sending, or arrived live after the page).
      const newest = list[list.length - 1]?.createdAt ?? '';
      patchThread(id, (x) => ({ list: x.list.filter((m) => m.pending || m.createdAt > newest).reduce(upsert, list), loaded: true, more: list.length === PAGE, loading: false }));
    } catch (e) {
      patchThread(id, (x) => ({ ...x, loading: false }));
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [patchThread]);

  const loadOlder = useCallback(async (id: string) => {
    const t = threadsRef.current[id];
    if (!t?.loaded || !t.more || t.loading) return;
    const oldest = t.list.find((m) => !m.pending);
    if (!oldest) return;
    patchThread(id, (x) => ({ ...x, loading: true }));
    try {
      const older = await listMessages(id, oldest.createdAt);
      patchThread(id, (x) => ({ ...x, list: [...older, ...x.list], more: older.length === PAGE, loading: false }));
    } catch {
      patchThread(id, (x) => ({ ...x, loading: false }));
    }
  }, [patchThread]);

  const deliver = useCallback(async (m: ChatMessage) => {
    try {
      const saved = await sendMessage(m);
      patchThread(m.conversationId, (t) => ({ ...t, list: upsert(t.list, saved) }));
      patchConv(m.conversationId, (c) => (c.lastMessage?.id === m.id ? { ...c, lastMessage: saved, lastMessageAt: saved.createdAt } : c));
    } catch {
      patchThread(m.conversationId, (t) => ({ ...t, list: upsert(t.list, { ...m, pending: 'failed' }) }));
    }
  }, [patchConv, patchThread]);

  const send = useCallback((id: string, body: string, replyTo?: string) => {
    const text = body.trim();
    if (!meId || !text) return;
    const m: ChatMessage = { id: newMessageId(), conversationId: id, senderId: meId, body: text, replyTo, createdAt: new Date().toISOString(), pending: 'sending' };
    patchThread(id, (t) => ({ ...t, list: upsert(t.list, m) }));
    patchConv(id, (c) => ({ ...c, lastMessage: m, lastMessageAt: m.createdAt, unread: 0 }));
    void deliver(m);
  }, [meId, deliver, patchConv, patchThread]);

  const retry = useCallback((m: ChatMessage) => {
    patchThread(m.conversationId, (t) => ({ ...t, list: upsert(t.list, { ...m, pending: 'sending' }) }));
    void deliver({ ...m, pending: 'sending' });
  }, [deliver, patchThread]);

  const remove = useCallback(async (m: ChatMessage) => {
    if (m.pending) {
      patchThread(m.conversationId, (t) => ({ ...t, list: t.list.filter((x) => x.id !== m.id) }));
      return;
    }
    await deleteMessage(m.id);
    const gone = { ...m, body: '', deletedAt: new Date().toISOString() };
    patchThread(m.conversationId, (t) => ({ ...t, list: upsert(t.list, gone) }));
    patchConv(m.conversationId, (c) => (c.lastMessage?.id === m.id ? { ...c, lastMessage: gone } : c));
  }, [patchConv, patchThread]);

  const setActive = useCallback((id: string | null) => {
    active.current = id;
    if (id) markRead(id);
  }, [markRead]);

  // First load, and the live feed.
  useEffect(() => {
    if (!meId || !isSupabaseConfigured) return;
    let readTimer: ReturnType<typeof setTimeout> | null = null;
    void reload(); // don't wait for the live feed, which may not connect
    const stop = subscribeToChats(meId, {
      message: (m, isNew) => {
        const known = convRef.current?.some((c) => c.id === m.conversationId);
        if (!known) { void reload(); return; }
        if (threadsRef.current[m.conversationId]?.loaded) patchThread(m.conversationId, (t) => ({ ...t, list: upsert(t.list, m) }));
        const mine = m.senderId === meId;
        const onScreen = active.current === m.conversationId;
        patchConv(m.conversationId, (c) => {
          if (!isNew) return c.lastMessage?.id === m.id ? { ...c, lastMessage: m } : c;
          return { ...c, lastMessage: m, lastMessageAt: m.createdAt, unread: mine || onScreen ? c.unread : c.unread + 1 };
        });
        if (isNew && !mine && onScreen) {
          if (readTimer) clearTimeout(readTimer);
          readTimer = setTimeout(() => markRead(m.conversationId), 300);
        }
      },
      receipt: (convId, profileId, lastReadAt) => {
        patchConv(convId, (c) => ({
          ...c,
          unread: profileId === meId ? 0 : c.unread,
          members: c.members.map((x) => (x.id === profileId ? { ...x, lastReadAt } : x)),
        }));
      },
      membership: () => void reload(),
      // Also after every reconnect: catch up on anything missed while the feed was down.
      connected: () => {
        void reload();
        setThreads((all) => Object.fromEntries(Object.entries(all).map(([k, t]) => [k, { ...t, loaded: false, loading: false }])));
      },
    });
    let hiddenAt = 0;
    const appState = RNAppState.addEventListener('change', (s) => {
      if (s !== 'active') hiddenAt ||= Date.now();
      else if (hiddenAt) { if (Date.now() - hiddenAt > 30_000) void reload(); hiddenAt = 0; }
    });
    return () => { stop(); appState.remove(); if (readTimer) clearTimeout(readTimer); };
  }, [meId, reload, markRead, patchConv, patchThread]);

  const value = useMemo<ChatStore>(() => ({
    conversations,
    unreadTotal: (conversations ?? []).reduce((n, c) => n + c.unread, 0),
    error,
    threads,
    reload,
    loadThread,
    loadOlder,
    send,
    retry,
    remove,
    setActive,
    markRead,
    contacts: listContacts,
    openDirect: async (profileId) => {
      const id = await startDirectChat(profileId);
      if (!convRef.current?.some((c) => c.id === id)) await reload();
      return id;
    },
    createGroup: async (title, people) => {
      const id = await createGroupChat(title, people);
      await reload();
      return id;
    },
    leave: async (id) => {
      await leaveGroupChat(id);
      setConversations((list) => list?.filter((c) => c.id !== id) ?? list);
    },
  }), [conversations, error, threads, reload, loadThread, loadOlder, send, retry, remove, setActive, markRead]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChat(): ChatStore {
  const c = useContext(Ctx);
  if (!c) throw new Error('useChat must be used within ChatProvider');
  return c;
}

export const EMPTY_THREAD = EMPTY;
