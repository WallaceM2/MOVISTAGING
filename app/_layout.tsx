import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers';
import { subscribePushOpensRide } from '@/notifications/notifications';

export default function RootLayout() {
  useEffect(() => subscribePushOpensRide((rideId) => router.push({ pathname: '/(app)/corrida/status', params: { id: String(rideId) } })), []);
  return <AppProviders><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></AppProviders>;
}
