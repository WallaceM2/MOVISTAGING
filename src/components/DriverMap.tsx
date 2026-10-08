import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Mapbox from "@rnmapbox/maps";
import { MAPBOX_TOKEN } from "@/config/env";
import { palette } from "@/theme";

export function DriverMap({ coordinate, height = 260, label = "Sua região" }: { coordinate: { lat: number; lng: number } | null; height?: number; label?: string }) {
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    if (MAPBOX_TOKEN) void Mapbox.setAccessToken(MAPBOX_TOKEN).then(() => setMapReady(true)).catch(() => setMapReady(false));
  }, []);

  if (!MAPBOX_TOKEN || !coordinate || !mapReady) {
    return <View style={[styles.fallback, { height }]}>
      <View style={styles.roadOne} /><View style={styles.roadTwo} /><View style={styles.roadThree} />
      <View style={styles.pin}><View style={styles.pinCore} /></View>
      <View style={styles.mapLabel}><Text style={styles.mapLabelText}>{coordinate ? label : "Ative sua localização para ver o mapa"}</Text></View>
      <Text style={styles.mapCredit}>MAPA MOVI</Text>
    </View>;
  }

  return <View style={[styles.map, { height }]}>
    <Mapbox.MapView style={StyleSheet.absoluteFill} styleURL={Mapbox.StyleURL.Street} logoEnabled={false} attributionEnabled>
      <Mapbox.Camera centerCoordinate={[coordinate.lng, coordinate.lat]} zoomLevel={14} animationMode="flyTo" animationDuration={500} />
      <Mapbox.MarkerView id="driver-current-location" coordinate={[coordinate.lng, coordinate.lat]}>
        <View style={styles.marker}><View style={styles.markerCore} /></View>
      </Mapbox.MarkerView>
    </Mapbox.MapView>
    <View style={styles.mapLabel}><Text style={styles.mapLabelText}>{label}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  map: { width: "100%", borderRadius: 24, overflow: "hidden", backgroundColor: "#E8EFE9" },
  fallback: { width: "100%", borderRadius: 24, overflow: "hidden", backgroundColor: "#E7EEE7", alignItems: "center", justifyContent: "center" },
  roadOne: { position: "absolute", width: "130%", height: 34, backgroundColor: "#FAFCF8", transform: [{ rotate: "-14deg" }] },
  roadTwo: { position: "absolute", width: 30, height: "140%", backgroundColor: "#FAFCF8", left: "32%", transform: [{ rotate: "19deg" }] },
  roadThree: { position: "absolute", width: 22, height: "140%", backgroundColor: "#FAFCF8", right: "24%", transform: [{ rotate: "19deg" }] },
  pin: { width: 34, height: 34, borderRadius: 17, borderWidth: 7, borderColor: "#FFFFFF", backgroundColor: palette.forest, alignItems: "center", justifyContent: "center", shadowColor: palette.ink, shadowOpacity: 0.18, shadowRadius: 10 },
  pinCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  marker: { width: 34, height: 34, borderRadius: 17, borderWidth: 7, borderColor: "#FFFFFF", backgroundColor: palette.forest, alignItems: "center", justifyContent: "center" },
  markerCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  mapLabel: { position: "absolute", top: 14, left: 14, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 99, backgroundColor: "#FFFFFF" },
  mapLabelText: { color: palette.ink, fontSize: 11, fontWeight: "800" },
  mapCredit: { position: "absolute", bottom: 12, right: 14, color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
});
