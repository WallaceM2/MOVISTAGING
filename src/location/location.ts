import * as Location from "expo-location";

const MAX_CACHED_LOCATION_AGE_MS = 30_000;
const MAX_ACCEPTABLE_ACCURACY_METERS = 100;

function toCoordinates(position: Location.LocationObject) {
  const { latitude, longitude, accuracy } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("A localização retornada pelo aparelho é inválida.");
  }
  if (accuracy != null && accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
    throw new Error("A precisão da localização está baixa. Aguarde o GPS atualizar.");
  }
  return { lat: latitude, lng: longitude };
}

async function getRecentLocation() {
  try {
    return await Location.getLastKnownPositionAsync({
      maxAge: MAX_CACHED_LOCATION_AGE_MS,
      requiredAccuracy: MAX_ACCEPTABLE_ACCURACY_METERS,
    });
  } catch {
    return null;
  }
}

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

  const recent = await getRecentLocation();
  if (recent) return toCoordinates(recent);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("A localização atual demorou para responder.")),
          12_000,
        );
      }),
    ]);
    return toCoordinates(current);
  } catch {
    const fallback = await getRecentLocation();
    if (fallback) return toCoordinates(fallback);
    throw new Error(
      "A localização atual está indisponível. Ative a localização precisa e tente novamente.",
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }

}
