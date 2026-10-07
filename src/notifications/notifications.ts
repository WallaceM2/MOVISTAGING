import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { apiFetch } from '@/api/http';

const TOKEN_KEY = 'movi.passageiro.expo_push_token.v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function getExpoPushToken(): Promise<string | null> {
  const granted = await requestNotificationPermission();
  if (!granted) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('rides', {
      name: 'Corridas MOVI',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export async function enableRideNotifications(): Promise<void> {
  const token = await getExpoPushToken();
  if (!token) throw new Error('Notificações remotas exigem uma build nativa compatível, permissão ativa e o projeto EAS configurado.');
  await apiFetch('/api/notificacoes/dispositivo', {
    method: 'POST',
    body: JSON.stringify({ expo_push_token: token, plataforma: Platform.OS, app_id: 'movi-passageiro' }),
    idempotencyKey: `push-register-${Date.now().toString(36)}`,
  });
  await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

export async function disableRideNotifications(): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;
  try {
    await apiFetch('/api/notificacoes/dispositivo', { method: 'DELETE', body: JSON.stringify({ expo_push_token: token }) });
  } finally {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export function subscribePushOpensRide(onOpen: (rideId: number) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { type?: unknown; rideId?: unknown };
    const rideId = Number(data?.rideId);
    if (data?.type === 'ride' && Number.isSafeInteger(rideId) && rideId > 0) onOpen(rideId);
  });
  return () => subscription.remove();
}
