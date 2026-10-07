import React, { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function AppLayout() {
  const token = useAuthStore((state) => state.accessToken);
  const hydrated = useAuthStore((state) => state.hydrated);
  useEffect(() => { if (hydrated && !token) router.replace('/(public)/login'); }, [hydrated, token]);
  return <Stack screenOptions={{ headerShown: false }} />;
}
