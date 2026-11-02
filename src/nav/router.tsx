/**
 * The app's navigation API, on top of Expo Router.
 *
 * Screens navigate by route name, the same names stored in notification links: `navigate('request', { id })`.
 * Each name is a file in src/app/(app) or src/app/(auth), and params travel as the query string, so the
 * same screen opens from /request?id=MR-2083 on the web and propertyhub://request?id=MR-2083 on a phone.
 */
import { useMemo } from 'react';
import { useLocalSearchParams, usePathname, useRootNavigationState, useRouter as useExpoRouter, type Href } from 'expo-router';

export type Params = Record<string, string>;
export interface Route { name: string; params: Params }

interface RouterValue {
  /** `name` is the screen on top; `params` are this screen's own. */
  route: Route;
  navigate: (name: string, params?: Params) => void;
  replace: (name: string, params?: Params) => void;
  back: (fallback?: string) => void;
  /** For top-level destinations (tabs, sidebar): returns to that screen if it is already open instead of stacking another copy. */
  go: (name: string) => void;
  canGoBack: boolean;
}

export const hrefFor = (name: string, params: Params = {}): Href => ({ pathname: `/${name}`, params }) as Href;

interface NavState { index?: number; routes: { name: string; state?: NavState }[] }

/** Route names in the innermost stack on screen, bottom first: the screens Back would walk through. */
function openScreens(state: NavState | undefined): string[] {
  let names: string[] = [];
  for (let s = state; s?.routes?.length; s = s.routes[s.index ?? s.routes.length - 1].state) names = s.routes.map((r) => r.name);
  return names;
}

export function useRouter(): RouterValue {
  const router = useExpoRouter();
  const pathname = usePathname();
  const local = useLocalSearchParams();
  const open = openScreens(useRootNavigationState() as NavState | undefined).join(',');
  const name = pathname.split('/').filter(Boolean)[0] ?? 'index';
  const key = JSON.stringify(local);
  return useMemo(() => {
    const params: Params = {};
    for (const [k, v] of Object.entries(JSON.parse(key) as Record<string, string | string[]>)) params[k] = Array.isArray(v) ? v[0] : v;
    const isCurrent = (n: string, p: Params) => n === name && JSON.stringify(p) === JSON.stringify(params);
    return {
      route: { name, params },
      navigate: (n, p = {}) => { if (!isCurrent(n, p)) router.push(hrefFor(n, p)); },
      replace: (n, p = {}) => router.replace(hrefFor(n, p)),
      back: (fallback) => {
        if (router.canGoBack()) router.back();
        else if (fallback) router.replace(hrefFor(fallback));
      },
      go: (n) => {
        if (n === name) return;
        if (open.split(',').includes(n)) router.dismissTo(hrefFor(n));
        else router.push(hrefFor(n));
      },
      canGoBack: router.canGoBack(),
    };
  }, [router, name, key, open]);
}
