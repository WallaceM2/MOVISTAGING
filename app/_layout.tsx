import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers';
import { subscribePushOpensRide } from '@/notifications/notifications';
import { ThemeProvider, useMoviTheme } from '@/theme/ThemeProvider';

export default function RootLayout() {
  return <ThemeProvider><AppProviders><ThemedNavigation /><PushSetup /></AppProviders></ThemeProvider>;
}

function ThemedNavigation() { const { colors, mode } = useMoviTheme(); return <><StatusBar style={mode === 'dark' ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} /></>; }
function PushSetup() { useEffect(() => subscribePushOpensRide((rideId) => router.push({ pathname: '/(app)/corrida/status', params: { id: String(rideId) } })), []); return null; }
