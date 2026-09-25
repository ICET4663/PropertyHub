import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from './src/store/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import { useTheme } from './src/theme';

function AppContent() {
  const t = useTheme();
  const navTheme = {
    ...(t.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(t.dark ? DarkTheme.colors : DefaultTheme.colors),
      background: t.colors.bg,
      card: t.colors.card,
      text: t.colors.text,
      border: t.colors.border,
      primary: t.colors.primary,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <AppContent />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
