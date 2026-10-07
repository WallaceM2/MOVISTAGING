import { MAPBOX_TOKEN } from '@/config/env';

export type PlaceSuggestion = { id: string; label: string; lat: number; lng: number };

export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  if (!MAPBOX_TOKEN || query.trim().length < 2) return [];
  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.searchParams.set('q', query.trim()); url.searchParams.set('access_token', MAPBOX_TOKEN); url.searchParams.set('limit', '6'); url.searchParams.set('language', 'pt-BR'); url.searchParams.set('country', 'BR');
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('Não foi possível buscar este endereço.');
  const body = await response.json() as { features?: Array<{ id?: string; geometry?: { coordinates?: [number, number] }; properties?: { full_address?: string; name?: string; place_formatted?: string } }> };
  return (body.features ?? []).flatMap((feature, index) => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates) return [];
    const [lng, lat] = coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const label = feature.properties?.full_address ?? [feature.properties?.name, feature.properties?.place_formatted].filter(Boolean).join(', ') ?? `Local ${index + 1}`;
    return [{ id: feature.id ?? `${lat}-${lng}-${index}`, label, lat, lng }];
  });
}
