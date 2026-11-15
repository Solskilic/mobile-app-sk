import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL ?? 'https://judicious-crane-17.convex.cloud', { unsavedChangesWarning: false });

export default function Layout() {
  return <SafeAreaProvider><ConvexProvider client={convex}><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F8F4E9' }, animation: 'none' }} /></ConvexProvider></SafeAreaProvider>;
}
