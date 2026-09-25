import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type Params = Record<string, string>;
export interface Route { name: string; params: Params }

interface RouterValue {
  route: Route;
  navigate: (name: string, params?: Params) => void;
  replace: (name: string, params?: Params) => void;
  back: (fallback?: string) => void;
  canGoBack: boolean;
}

const RouterCtx = createContext<RouterValue | null>(null);
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

function parseHash(): Route | null {
  if (!isWeb) return null;
  const h = window.location.hash.replace(/^#\/?/, '');
  if (!h) return null;
  const [name, qs] = h.split('?');
  const params: Params = {};
  if (qs) new URLSearchParams(qs).forEach((v, k) => { params[k] = v; });
  return { name, params };
}

function toHash(r: Route): string {
  const qs = new URLSearchParams(r.params).toString();
  return `#/${r.name}${qs ? `?${qs}` : ''}`;
}

export function RouterProvider({ initial, children }: { initial: string; children: React.ReactNode }) {
  const [stack, setStack] = useState<Route[]>(() => [parseHash() ?? { name: initial, params: {} }]);
  const route = stack[stack.length - 1];
  const skipPush = useRef(false);

  // keep the URL in sync on web
  useEffect(() => {
    if (!isWeb) return;
    const target = toHash(route);
    if (window.location.hash !== target) {
      if (skipPush.current) window.history.replaceState(null, '', target);
      else window.history.pushState(null, '', target);
    }
    skipPush.current = false;
  }, [route]);

  useEffect(() => {
    if (!isWeb) return;
    const onPop = () => {
      const r = parseHash();
      if (!r) return;
      skipPush.current = true;
      setStack((s) => {
        const idx = s.map(toHash).lastIndexOf(toHash(r));
        return idx >= 0 ? s.slice(0, idx + 1) : [...s, r];
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((name: string, params: Params = {}) => {
    setStack((s) => {
      const top = s[s.length - 1];
      if (top.name === name && JSON.stringify(top.params) === JSON.stringify(params)) return s;
      return [...s.slice(-40), { name, params }];
    });
  }, []);

  const replace = useCallback((name: string, params: Params = {}) => {
    skipPush.current = true;
    setStack((s) => [...s.slice(0, -1), { name, params }]);
  }, []);

  const back = useCallback((fallback?: string) => {
    setStack((s) => {
      if (s.length > 1) {
        skipPush.current = true;
        return s.slice(0, -1);
      }
      return fallback ? [{ name: fallback, params: {} }] : s;
    });
  }, []);

  const value = useMemo(() => ({ route, navigate, replace, back, canGoBack: stack.length > 1 }), [route, navigate, replace, back, stack.length]);
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}

export function useRouter(): RouterValue {
  const c = useContext(RouterCtx);
  if (!c) throw new Error('useRouter must be used within RouterProvider');
  return c;
}
