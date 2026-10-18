import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Mapbox from "@rnmapbox/maps";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { MAPBOX_TOKEN } from "@/config/env";
import { palette } from "@/theme";
import { useMoviTheme } from "@/theme/ThemeProvider";

type Coordinate = { lat: number; lng: number };

export const DriverMap = React.memo(function DriverMap({ coordinate, recenterCoordinate, height = 260, label = "Sua região", fullScreen = false }: { coordinate: Coordinate | null; recenterCoordinate?: Coordinate | null; height?: number; label?: string; fullScreen?: boolean }) {
  const { colors: theme, mode } = useMoviTheme();
  const [mapReady, setMapReady] = useState(false);
  const camera = useRef<Mapbox.Camera>(null);
  const locationToRecenter = recenterCoordinate === undefined ? coordinate : recenterCoordinate;
  useEffect(() => {
    if (MAPBOX_TOKEN) void Mapbox.setAccessToken(MAPBOX_TOKEN).then(() => setMapReady(true)).catch(() => setMapReady(false));
  }, []);

  if (!MAPBOX_TOKEN || !coordinate || !mapReady) {
    return <View style={[styles.fallback, fullScreen && styles.fullScreen, { height, backgroundColor: mode === "dark" ? "#061820" : "#EAF1F2" }]}>
      <View style={[styles.roadOne, { backgroundColor: mode === "dark" ? "#0E4A5A" : "#C7D7DB" }]} /><View style={[styles.roadTwo, { backgroundColor: mode === "dark" ? "#0E4A5A" : "#C7D7DB" }]} /><View style={[styles.roadThree, { backgroundColor: mode === "dark" ? "#0E4A5A" : "#C7D7DB" }]} />
      <View style={styles.pin}><View style={styles.pinCore} /></View>
      <View style={[styles.mapLabel, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.mapLabelText, { color: theme.text }]}>{coordinate ? label : "Ative sua localização para ver o mapa"}</Text></View>
      <Text style={styles.mapCredit}>MAPA MOVI</Text>
    </View>;
  }

  return <View style={[styles.map, fullScreen && styles.fullScreen, { height }]}>
    <Mapbox.MapView style={StyleSheet.absoluteFill} styleURL={mode === "dark" ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Light} logoEnabled={false} attributionEnabled>
      <Mapbox.Camera ref={camera} centerCoordinate={[coordinate.lng, coordinate.lat]} zoomLevel={14} animationMode="flyTo" animationDuration={500} />
      <Mapbox.MarkerView id="driver-current-location" coordinate={[coordinate.lng, coordinate.lat]}>
        <View style={styles.marker}><View style={styles.markerCore} /></View>
      </Mapbox.MarkerView>
    </Mapbox.MapView>
    <View style={[styles.mapLabel, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.mapLabelText, { color: theme.text }]}>{label}</Text></View>
    {locationToRecenter && mapReady ? <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voltar para minha localização atual no mapa"
      hitSlop={8}
      onPress={() => camera.current?.setCamera({ centerCoordinate: [locationToRecenter.lng, locationToRecenter.lat], zoomLevel: 14, animationMode: "flyTo", animationDuration: 450 })}
      style={({ pressed }) => [styles.recenterButton, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && styles.recenterPressed]}
    ><MaterialCommunityIcons name="crosshairs-gps" size={22} color={theme.primary} /></Pressable> : null}
  </View>;
});

const styles = StyleSheet.create({
  map: { width: "100%", borderRadius: 24, overflow: "hidden", backgroundColor: "#061820" },
  fallback: { width: "100%", borderRadius: 24, overflow: "hidden", backgroundColor: "#061820", alignItems: "center", justifyContent: "center" },
  fullScreen: { borderRadius: 0 },
  roadOne: { position: "absolute", width: "130%", height: 3, backgroundColor: "#0E4A5A", transform: [{ rotate: "-14deg" }] },
  roadTwo: { position: "absolute", width: 3, height: "140%", backgroundColor: "#0E4A5A", left: "32%", transform: [{ rotate: "19deg" }] },
  roadThree: { position: "absolute", width: 2, height: "140%", backgroundColor: "#0E4A5A", right: "24%", transform: [{ rotate: "19deg" }] },
  pin: { width: 34, height: 34, borderRadius: 17, borderWidth: 5, borderColor: "#063A3B", backgroundColor: palette.forest, alignItems: "center", justifyContent: "center", shadowColor: palette.forest, shadowOpacity: 0.5, shadowRadius: 10 },
  pinCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  marker: { width: 34, height: 34, borderRadius: 17, borderWidth: 5, borderColor: "#063A3B", backgroundColor: palette.forest, alignItems: "center", justifyContent: "center" },
  markerCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  mapLabel: { position: "absolute", top: 14, left: 14, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 99, backgroundColor: "#071A21", borderColor: "#1B4853", borderWidth: 1 },
  mapLabelText: { color: palette.ink, fontSize: 11, fontWeight: "800" },
  mapCredit: { position: "absolute", bottom: 12, right: 14, color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  recenterButton: { position: "absolute", right: 14, bottom: 16, width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 1, elevation: 5, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6 },
  recenterPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
