import 'react-native-gesture-handler';
import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { StoreProvider, useStore } from './src/store/AppContext';
import { RouterProvider } from './src/nav/router';
import { ToastProvider } from './src/components/ui';
import { AuthFlowProvider } from './src/screens/auth';
import { AppRoutes } from './src/screens';
import { colors } from './src/theme';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.title = 'PropertyHub';
  const style = document.createElement('style');
  style.textContent = `html,body,#root{height:100%;background:${colors.bg}} *{-webkit-tap-highlight-color:transparent} ::-webkit-scrollbar{width:10px;height:10px} ::-webkit-scrollbar-thumb{background:#d6d2c7;border-radius:10px;border:3px solid transparent;background-clip:content-box}`;
  document.head.appendChild(style);
}

function Root() {
  const { hydrated, me } = useStore();
  if (!hydrated) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sidebar }}><ActivityIndicator color={colors.accent} /></View>;
  }
  // Re-mount the router when the session changes so each role starts on its own home screen.
  return (
    <RouterProvider key={me?.id ?? 'guest'} initial={me ? (me.role === 'tenant' ? 'home' : me.role === 'caretaker' ? 'maintenance' : 'dashboard') : 'signIn'}>
      <AuthFlowProvider>
        <AppRoutes />
      </AuthFlowProvider>
    </RouterProvider>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.sidebar }} />;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Root />
        </ToastProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
