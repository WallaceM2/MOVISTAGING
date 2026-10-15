import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { MAPBOX_TOKEN } from '@/config/env';
import type { Coordinates } from '@/types/api';
import { colors, radius } from '@/theme/colors';

if (MAPBOX_TOKEN) Mapbox.setAccessToken(MAPBOX_TOKEN);

type Props = {
  center?: Coordinates | null;
  origin?: Coordinates | null;
  destination?: Coordinates | null;
  driver?: Coordinates | null;
  route?: { type: 'LineString'; coordinates: [number, number][] } | null;
  height?: number;
};

const DEFAULT_CAMERA = { lat: -8.281, lng: -35.976 };
const ROUTE_LINE_STYLE = { lineColor: '#111111', lineWidth: 5, lineCap: 'round', lineJoin: 'round' } as const;

const Marker = React.memo(function Marker({ kind }: { kind: 'origin' | 'destination' | 'driver' }) {
  const label = kind === 'origin' ? 'A' : kind === 'destination' ? 'B' : 'M';
  return <View style={[styles.marker, kind === 'driver' ? styles.driverMarker : styles.pointMarker]}><Text style={styles.markerText}>{label}</Text></View>;
});

export const MapViewCard = React.memo(function MapViewCard({ center, origin, destination, driver, route, height = 430 }: Props) {
  const routeShape = useMemo(() => route ? { type: 'Feature' as const, properties: {}, geometry: route } : null, [route]);
  if (!MAPBOX_TOKEN) return <View style={[styles.fallback, { height }]}><Text style={styles.fallbackTitle}>Mapa aguardando configuração</Text><Text style={styles.fallbackText}>Defina EXPO_PUBLIC_MAPBOX_TOKEN com um token público pk...</Text></View>;
  const camera = center ?? driver ?? origin ?? DEFAULT_CAMERA;
  return (
    <View style={[styles.container, { height }]}>
      <Mapbox.MapView style={StyleSheet.absoluteFill} styleURL={Mapbox.StyleURL.Street} logoEnabled={false} compassEnabled>
        <Mapbox.Camera zoomLevel={14} centerCoordinate={[camera.lng, camera.lat]} />
        <Mapbox.UserLocation visible />
        {origin ? <Mapbox.PointAnnotation id="origin" coordinate={[origin.lng, origin.lat]}><Marker kind="origin" /></Mapbox.PointAnnotation> : null}
        {destination ? <Mapbox.PointAnnotation id="destination" coordinate={[destination.lng, destination.lat]}><Marker kind="destination" /></Mapbox.PointAnnotation> : null}
        {driver ? <Mapbox.PointAnnotation id="driver" coordinate={[driver.lng, driver.lat]}><Marker kind="driver" /></Mapbox.PointAnnotation> : null}
        {routeShape?.geometry.coordinates.length ? <Mapbox.ShapeSource id="ride-route" shape={routeShape}><Mapbox.LineLayer id="ride-route-line" style={ROUTE_LINE_STYLE} /></Mapbox.ShapeSource> : null}
      </Mapbox.MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: '#E5E7EB' },
  fallback: { borderRadius: radius.lg, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', padding: 24 },
  fallbackTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  fallbackText: { textAlign: 'center', marginTop: 8, color: colors.muted },
  marker: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  pointMarker: { backgroundColor: '#111827' },
  driverMarker: { backgroundColor: '#FFFFFF', borderColor: '#111827' },
  markerText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
});
