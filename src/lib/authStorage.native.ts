// expo-sqlite provides a persistent localStorage on iOS/Android for the Supabase session.
import 'expo-sqlite/localStorage/install';

export const authStorage = globalThis.localStorage;
