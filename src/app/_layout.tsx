import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL ?? 'https://judicious-crane-17.convex.cloud', { unsavedChangesWarning: false });

export default function Layout() {
  const dark = useColorScheme() === 'dark';
  return <SafeAreaProvider><ConvexProvider client={convex}><ThemeProvider value={dark ? DarkTheme : DefaultTheme}><StatusBar style={dark ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false, animation: 'none' }} /></ThemeProvider></ConvexProvider></SafeAreaProvider>;
}
