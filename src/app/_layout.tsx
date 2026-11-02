import 'react-native-gesture-handler';
import '../../global.css';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { StoreProvider, useStore } from '../store/AppContext';
import { ToastProvider, useToast } from '../components/ui';
import { colors } from '../theme';
import { registerPush } from '../lib/push';
import { LinkHandler } from '../nav/links';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.title = 'PropertyHub';
  const style = document.createElement('style');
  style.textContent = `html,body,#root{height:100%;background:${colors.bg}} *{-webkit-tap-highlight-color:transparent} ::-webkit-scrollbar{width:10px;height:10px} ::-webkit-scrollbar-thumb{background:#d6d2c7;border-radius:10px;border:3px solid transparent;background-clip:content-box}`;
  document.head.appendChild(style);
}

/** Shows server write failures (the store has already undone them). */
function SyncErrors() {
  const { syncError, clearSyncError } = useStore();
  const toast = useToast();
  useEffect(() => {
    if (!syncError) return;
    toast(syncError, 'danger');
    clearSyncError();
  }, [syncError, clearSyncError, toast]);
  return null;
}

/**
 * Signed-out users can only open the (auth) screens and signed-in users only the (app) screens; when the
 * session changes, Expo Router drops the other group's history and falls back to index, which picks the
 * home screen. The navigator waits until the saved session is restored, so a link or a browser refresh
 * opens the screen it names instead of bouncing through sign-in. Links opened while signed out, and
 * notification taps, are opened after sign-in by LinkHandler.
 */
function RootNavigator() {
  const { hydrated, me } = useStore();
  const userId = me?.id;
  // Link this phone to the account for push (asks for permission the first time; no-op on the web).
  useEffect(() => {
    if (userId) void registerPush();
  }, [userId]);
  if (!hydrated) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sidebar }}><ActivityIndicator color={colors.accent} /></View>;
  }
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        {/* Public pages, open signed in or out. */}
        <Stack.Screen name="welcome" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="terms" />
        <Stack.Protected guard={!me}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!!me}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      <LinkHandler />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.sidebar }} />;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <SyncErrors />
          <RootNavigator />
        </ToastProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
