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
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: location.coords.latitude, lng: location.coords.longitude };
}
