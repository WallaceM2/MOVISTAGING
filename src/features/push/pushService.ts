import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { apiFetch } from "@/api/http";

const TOKEN_KEY = "movi.motorista.expo_push_token.v1";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function enableRideNotifications() {
  // A development build without google-services.json cannot initialize native
  // FCM. Fail with an actionable message before Expo's native call throws.
  if (Platform.OS === "android" && !Constants.expoConfig?.android?.googleServicesFile) {
    throw new Error("Notificações remotas ainda não estão configuradas neste Android. Para testar corridas, deixe o MOVI aberto: as ofertas chegam pela conexão ao vivo. Configure o Firebase/FCM depois para receber avisos com o app em segundo plano.");
  }
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("rides", { name: "Corridas MOVI", importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250] });
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("Ative notificações do MOVI nas configurações do aparelho.");
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Configure o ID do projeto EAS antes de registrar notificações remotas.");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await apiFetch("/api/notificacoes/dispositivo", { method: "POST", body: JSON.stringify({ expo_push_token: token, plataforma: Platform.OS, app_id: "movi-motorista" }), idempotencyKey: `push-register-${Date.now().toString(36)}` });
  await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

export async function disableRideNotifications() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    try { await apiFetch("/api/notificacoes/dispositivo", { method: "DELETE", body: JSON.stringify({ expo_push_token: token }) }); }
    finally { await SecureStore.deleteItemAsync(TOKEN_KEY); }
  }
}

export function subscribePushOpensRide(onOpen: (rideId: number) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { type?: unknown; rideId?: unknown };
    const rideId = Number(data?.rideId);
    if (data?.type === "ride" && Number.isSafeInteger(rideId) && rideId > 0) onOpen(rideId);
  });
  return () => subscription.remove();
}
