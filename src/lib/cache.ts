/**
 * The last data a tenant or caretaker loaded, kept on the phone so the app still opens with no signal.
 * One account per device: the copy carries its owner's id and is deleted on sign out. Staff roles
 * and the web app always load fresh, so nothing is left behind on a shared computer.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppState, Role } from '../types';

const KEY = 'propertyhub_cache_v1';
/** Builds before Supabase kept the whole app state, demo passwords included, under this key. */
const LEGACY_KEY = 'propertyhub_state_v3';

export type CachedData = Omit<AppState, 'sessionUserId' | 'locationFilter'>;

export const cacheable = (role: Role | undefined) => Platform.OS !== 'web' && (role === 'tenant' || role === 'caretaker');

export async function saveCache(userId: string, data: CachedData): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ userId, savedAt: new Date().toISOString(), data }));
}

/** The saved copy, only if it belongs to this account. */
export async function readCache(userId: string): Promise<{ savedAt: string; data: CachedData } | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { userId: string; savedAt: string; data: CachedData };
    return c.userId === userId && c.data?.version === 1 ? { savedAt: c.savedAt, data: c.data } : null;
  } catch {
    return null;
  }
}

export async function clearCache(): Promise<void> {
  if (Platform.OS === 'web') return;
  await AsyncStorage.multiRemove([KEY, LEGACY_KEY]).catch(() => {});
}

/** Can't reach Supabase at all, as opposed to Supabase refusing. */
export const isNetworkError = (message: string) => /network request failed|failed to fetch|fetch failed|network|timed? ?out/i.test(message);
