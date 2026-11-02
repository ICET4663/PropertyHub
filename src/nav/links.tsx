/**
 * Opens the screen a notification tap or a link points at, waiting for sign-in when needed.
 *
 * Signed in, Expo Router opens links by itself; this only adds notification taps. Signed out, the
 * guards in src/app/_layout.tsx send every link to sign-in and then to the home screen, so the
 * target is kept here and opened once the person is signed in and on a signed-in screen.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { router, usePathname } from 'expo-router';
import { useStore } from '../store/AppContext';
import { onPushOpened, type PushLink } from '../lib/push';
import { isAppRoute } from '../screens';
import { hrefFor } from './router';

/** On the web, the address the page was opened at, read before the guards redirect. */
const launchHref = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null;

function linkFromUrl(url: string | null): PushLink | null {
  if (!url) return null;
  const { path, queryParams } = Linking.parse(url);
  const name = (path ?? '').split('/').filter(Boolean)[0] ?? '';
  if (!isAppRoute(name)) return null;
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(queryParams ?? {})) if (typeof v === 'string') params[k] = v;
  return { name, params };
}

interface Pending { link: PushLink | null; notificationId: string | null }

export function LinkHandler() {
  const store = useStore();
  const signedIn = !!store.me;
  // Read by the listeners and the open effect below; declared first so they are current there.
  const storeRef = useRef(store);
  const signedInRef = useRef(signedIn);
  useEffect(() => {
    storeRef.current = store;
    signedInRef.current = signedIn;
  });
  const onAppScreen = isAppRoute(usePathname().split('/').filter(Boolean)[0] ?? '');

  // On the web, a link opened while signed out is the page's own address.
  const [launch] = useState<Pending | null>(() => {
    const link = signedIn ? null : linkFromUrl(launchHref);
    return link ? { link, notificationId: null } : null;
  });
  const pending = useRef<Pending | null>(launch);
  const [queued, setQueued] = useState(0);
  const keep = (p: Pending) => {
    pending.current = p;
    setQueued((n) => n + 1);
  };

  useEffect(() => onPushOpened((link, notificationId) => keep({ link, notificationId })), []);

  // On a phone, links opened while signed out: the one that launched the app, then any that arrive later.
  useEffect(() => {
    if (!launchHref && !signedInRef.current) {
      void Linking.getInitialURL().then((url) => {
        const link = linkFromUrl(url);
        if (link && !signedInRef.current) keep({ link, notificationId: null });
      });
    }
    const sub = Linking.addEventListener('url', ({ url }) => {
      const link = signedInRef.current ? null : linkFromUrl(url);
      if (link) keep({ link, notificationId: null });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const p = pending.current;
    const { me, markNotificationRead } = storeRef.current;
    if (!p || !me || !onAppScreen) return;
    pending.current = null;
    if (p.notificationId) markNotificationRead(p.notificationId);
    const link = p.link ?? { name: me.role === 'tenant' ? 'myNotifications' : 'notifications' };
    // appRoute() sends a role that may not open this screen back to its home screen.
    router.push(hrefFor(link.name, link.params ?? {}));
  }, [queued, signedIn, onAppScreen]);

  return null;
}
