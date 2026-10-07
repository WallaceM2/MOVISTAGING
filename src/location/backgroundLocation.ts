import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { apiFetch } from "@/api/http";

export const DRIVER_LOCATION_TASK = "movi-driver-background-location-v1";
const ACTIVE_RIDE_KEY = "movi.motorista.active_ride_id.v1";

TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data || !Array.isArray((data as { locations?: unknown[] }).locations)) return;
  const locations = (data as { locations: Location.LocationObject[] }).locations;
  const latest = locations[locations.length - 1];
  if (!latest || !Number.isFinite(latest.coords.latitude) || !Number.isFinite(latest.coords.longitude)) return;
  const rideIdText = await SecureStore.getItemAsync(ACTIVE_RIDE_KEY);
  const corrida_id = rideIdText ? Number(rideIdText) : undefined;
  try {
    await apiFetch("/api/motoristas/localizacao", { method: "POST", body: JSON.stringify({ lat: latest.coords.latitude, lng: latest.coords.longitude, ...(Number.isSafeInteger(corrida_id) && corrida_id! > 0 ? { corrida_id } : {}), ...(latest.coords.heading == null ? {} : { direcao: latest.coords.heading }) }) });
  } catch (requestError) {
    const code = (requestError as { code?: string }).code;
    if (["DRIVER_OFFLINE", "DRIVER_NOT_APPROVED", "INVALID_ACTIVE_RIDE"].includes(String(code))) {
      await SecureStore.deleteItemAsync(ACTIVE_RIDE_KEY);
      if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => undefined);
    }
  }
});

export async function startBackgroundLocation(rideId?: number) {
  if (rideId && Number.isSafeInteger(rideId) && rideId > 0) await SecureStore.setItemAsync(ACTIVE_RIDE_KEY, String(rideId), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  const available = await TaskManager.isAvailableAsync();
  if (!available) throw new Error("O rastreamento em segundo plano exige uma development build nativa.");
  const permissions = await Location.getBackgroundPermissionsAsync();
  if (!permissions.granted) throw new Error("Ative a permissão de localização 'Sempre' para usar o MOVI em segundo plano.");
  if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) return;
  await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15000,
    distanceInterval: 25,
    deferredUpdatesInterval: 30000,
    deferredUpdatesDistance: 50,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    ...(Platform.OS === "android" ? { foregroundService: { notificationTitle: "MOVI ativo", notificationBody: "Sua localização é compartilhada enquanto você está online ou em uma corrida.", notificationColor: "#145C3A" } } : {}),
  });
}

export async function setBackgroundRide(rideId: number | null) {
  if (rideId && Number.isSafeInteger(rideId) && rideId > 0) {
    await SecureStore.setItemAsync(ACTIVE_RIDE_KEY, String(rideId), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    await startBackgroundLocation(rideId);
  } else {
    await SecureStore.deleteItemAsync(ACTIVE_RIDE_KEY);
    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  }
}

export async function stopBackgroundLocation() {
  await SecureStore.deleteItemAsync(ACTIVE_RIDE_KEY);
  if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
}
