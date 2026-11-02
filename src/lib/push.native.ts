/**
 * Push notifications on iOS and Android. The server sends them: every row added to public.notifications
 * is pushed to the recipients' tokens (supabase/migrations/20261023000000_push_notifications.sql), so the
 * app only registers this phone's token after sign-in, removes it on sign out, and opens the linked
 * screen when a notification is tapped.
 */
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import type { PushLink } from './push';

export type { PushLink } from './push';

// While the app is open, still show the banner: the feed updates live, but a banner says something changed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Simulators have no push token, and since SDK 53 Expo Go on Android can't receive push (use a development build). */
const supported = Device.isDevice && !(Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);

/** This phone's token once it is registered to the signed-in account. */
let current: string | null = null;

/** Asks for permission (once; the OS remembers a refusal) and links this phone to the signed-in account. */
export async function registerPush(): Promise<void> {
  if (!supported) return;
  try {
    // Android 13+ only shows the permission prompt once a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'PropertyHub', importance: Notifications.AndroidImportance.HIGH });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (!error) current = token;
  } catch {
    // Offline, or no push credentials in this build: the in-app feed still works; try again next launch.
  }
}

/** Unlinks this phone before signing out, while the session can still delete the token. */
export async function unregisterPush(): Promise<void> {
  const token = current;
  current = null;
  if (!token) return;
  await supabase.from('push_tokens').delete().eq('token', token).then(() => {}, () => {});
}

/** Calls `open` for a notification tapped while the app was running, in the background, or closed. */
export function onPushOpened(open: (link: PushLink | null, notificationId: string | null) => void): () => void {
  const seen = new Set<string>();
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { identifier, content } = response.notification.request;
    if (seen.has(identifier)) return; // a cold-start tap can arrive both ways
    seen.add(identifier);
    Notifications.clearLastNotificationResponse();
    const data = (content.data ?? {}) as { link?: PushLink | null; notificationId?: string };
    open(typeof data.link?.name === 'string' ? data.link : null, data.notificationId ?? null);
  };
  handle(Notifications.getLastNotificationResponse()); // the tap that launched the app
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
