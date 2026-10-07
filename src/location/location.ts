import * as Location from "expo-location";

export async function getCurrentCoordinates() {
  const current = await Location.getForegroundPermissionsAsync();

  let status = current.status;

  if (status !== "granted") {
    const requested = await Location.requestForegroundPermissionsAsync();
    status = requested.status;
  }

  if (status !== "granted") {
    throw new Error(
      "O acesso à localização é necessário para ficar online."
    );
  }

  const x = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    lat: x.coords.latitude,
    lng: x.coords.longitude,
  };
}