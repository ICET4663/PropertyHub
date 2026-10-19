// Web: the browser's own localStorage (undefined during static rendering, where there is no session).
export const authStorage = typeof window !== 'undefined' ? window.localStorage : undefined;
