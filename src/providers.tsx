import React, { PropsWithChildren, useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { tokenStore } from '@/auth/tokenStore';
import { useAuthStore } from '@/store/authStore';
import { getProfile, getExtrato } from '@/features/perfil/profileService';
import { connectSocket, disconnectSocket, sendHeartbeat } from '@/realtime/socket';
import { refreshAccessToken } from '@/api/http';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 15000, gcTime: 10 * 60 * 1000, refetchOnReconnect: true },
    mutations: { retry: 0 },
  },
});

function RuntimeBridge() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const requiresLegalConsent = useAuthStore((state) => state.requiresLegalConsent);

  useEffect(() => NetInfo.addEventListener((state) => onlineManager.setOnline(Boolean(state.isConnected))), []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!accessToken) { disconnectSocket(); return; }
    const socket = connectSocket();
    const onConnect = () => { void queryClient.invalidateQueries({ queryKey: ['ride-active'] }); };
    socket?.on('connect', onConnect);
    const heartbeatTimer = setInterval(() => sendHeartbeat(), 25000);
    return () => {
      socket?.off('connect', onConnect);
      clearInterval(heartbeatTimer);
    };
  }, [accessToken]);

  useEffect(() => {
    if (accessToken && requiresLegalConsent) router.replace('/(app)/legal');
  }, [accessToken, requiresLegalConsent]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const refreshToken = await tokenStore.getRefreshToken();
        if (!refreshToken) return;
        const renewed = await refreshAccessToken();
        if (!renewed) return;
        const profile = await getProfile();
        if (alive) useAuthStore.getState().setPassenger(profile.passageiro);
        // Em produção esta consulta também revela imediatamente se houve atualização dos aceites legais.
        try { await getExtrato(1, 0); } catch (_) { /* O interceptor marca LEGAL_CONSENT_REQUIRED quando aplicável. */ }
      } catch {
        await tokenStore.clear();
        useAuthStore.getState().clearSession();
      } finally {
        if (alive) useAuthStore.getState().setHydrated(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}><RuntimeBridge />{children}</QueryClientProvider>;
}
