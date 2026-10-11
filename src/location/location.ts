import * as Location from 'expo-location';
import type { Coordinates } from '@/types/api';

export async function requestForegroundLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  const requested = await Location.requestForegroundPermissionsAsync();
  return requested.granted;
}

export async function getCurrentCoordinates(): Promise<Coordinates> {
  const granted = await requestForegroundLocationPermission();
  if (!granted) throw new Error('Permissão de localização não concedida.');

  // A cached fix avoids blocking ride requests while Android's fused provider
  // is waiting for a new GPS update (common indoors and on emulators). Keep it
  // recent and precise enough for pickup/route estimation.
  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: 60_000,
    requiredAccuracy: 100,
  }).catch(() => null);
  if (lastKnown?.coords && (lastKnown.coords.accuracy == null || lastKnown.coords.accuracy <= 100)) {
    return { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude };
  }

  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: location.coords.latitude, lng: location.coords.longitude };
}
