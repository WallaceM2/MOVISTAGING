import React from 'react';
import { Stack } from 'expo-router';

export default function AccountLayout() {
  return <Stack screenOptions={{ headerShown: true, headerBackTitle: 'Voltar', headerTintColor: '#111827' }} />;
}
