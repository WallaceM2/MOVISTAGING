import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Surface } from "@/components/ui";
import { acceptRadarRide, getRadarRides } from "@/features/corrida/corridaService";
import type { DriverPalette } from "@/theme";
import { useMoviTheme, useThemeStyles } from "@/theme/ThemeProvider";

const money = (value: number | string | null | undefined) => Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function DriverRadarScreen() {
  const { colors: palette } = useMoviTheme();
  const styles = useThemeStyles(createStyles);
  const client = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);
  const query = useQuery({ queryKey: ["driver-ride-radar"], queryFn: getRadarRides, refetchInterval: 12000 });

  async function accept(id: number) {
    if (busyId != null) return;
    setBusyId(id);
    try {
      const result = await acceptRadarRide(id);
      client.setQueryData(["driver-ride", id], result.corrida);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["driver-ride-radar"] }),
        client.invalidateQueries({ queryKey: ["driver-active-ride"] }),
      ]);
      router.replace({ pathname: "/(app)/corrida", params: { id: String(id) } });
    } catch (error) {
      Alert.alert("Corrida indisponível", error instanceof Error ? error.message : "Outro motorista pode ter aceitado. Atualize o Radar.");
      void query.refetch();
    } finally { setBusyId(null); }
  }

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={palette.forest} />}>
    <View style={styles.headingRow}><View style={styles.headingIcon}><MaterialCommunityIcons name="radar" size={22} color={palette.forest} /></View><View style={styles.headingCopy}><Text style={styles.eyebrow}>OPORTUNIDADES DA REGIÃO</Text><Text style={styles.title}>Radar</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Atualizar Radar" onPress={() => void query.refetch()} style={styles.refresh}><MaterialCommunityIcons name="refresh" size={21} color={palette.forest} /></Pressable></View>
    <Text style={styles.subtitle}>Veja corridas disponíveis após a busca inicial por motoristas.</Text>
    {query.isLoading ? <Surface style={styles.state}><ActivityIndicator color={palette.forest} /><Text style={styles.meta}>Buscando oportunidades próximas…</Text></Surface> : null}
    {query.isError ? <Surface style={styles.state}><MaterialCommunityIcons name="wifi-alert" size={23} color={palette.amber} /><Text style={styles.cardTitle}>Não foi possível carregar o Radar</Text><Text style={styles.meta}>Confira sua conexão e tente novamente.</Text><Pressable accessibilityRole="button" onPress={() => void query.refetch()}><Text style={styles.link}>Tentar novamente</Text></Pressable></Surface> : null}
    {(query.data ?? []).map((ride) => <Surface key={ride.corrida_id} style={styles.card}>
      <View style={styles.cardTop}><View style={styles.category}><MaterialCommunityIcons name={ride.categoria === "moto" ? "motorbike" : "car"} size={17} color={palette.forest} /><Text style={styles.categoryText}>{ride.categoria === "moto" ? "Moto" : "Carro"}</Text></View><View style={styles.payout}><Text style={styles.payoutLabel}>SEU REPASSE</Text><Text style={styles.payoutValue}>{money(ride.ganho_motorista)}</Text></View></View>
      <View style={styles.route}><View style={styles.routeRail}><View style={styles.pickupDot} /><View style={styles.routeDash} /><View style={styles.destinationDot} /></View><View style={styles.routeCopy}><View><Text style={styles.addressLabel}>EMBARQUE</Text><Text style={styles.address}>{ride.origem}</Text></View><View><Text style={styles.addressLabel}>DESTINO</Text><Text style={styles.address}>{ride.destino}</Text></View></View></View>
      <View style={styles.details}><Text style={styles.detail}><MaterialCommunityIcons name="map-marker-distance" size={15} color={palette.cyan} /> {Number(ride.distancia_ate_origem_km ?? 0).toFixed(1)} km até o embarque</Text><Text style={styles.detail}><MaterialCommunityIcons name="map-marker-path" size={15} color={palette.cyan} /> {Number(ride.distancia_km).toFixed(1)} km de corrida</Text><Text style={styles.detail}><MaterialCommunityIcons name="clock-outline" size={15} color={palette.cyan} /> {Math.round(Number(ride.tempo_minutos))} min</Text></View>
      <Text style={styles.payment}>{ride.forma_pagamento === "dinheiro" ? "Pagamento em dinheiro" : `Pagamento ${ride.forma_pagamento.toUpperCase()}`} · preço confirmado</Text>
      <Pressable accessibilityRole="button" disabled={busyId != null} onPress={() => void accept(ride.corrida_id)} style={[styles.acceptButton, busyId != null && styles.disabled]}>{busyId === ride.corrida_id ? <ActivityIndicator color={palette.bg} /> : <><MaterialCommunityIcons name="check-circle-outline" size={19} color={palette.bg} /><Text style={styles.acceptText}>Aceitar corrida</Text></>}</Pressable>
    </Surface>)}
    {!query.isLoading && !query.isError && !query.data?.length ? <Surface style={styles.state}><MaterialCommunityIcons name="radar" size={28} color={palette.muted} /><Text style={styles.cardTitle}>Nenhuma corrida no Radar agora</Text><Text style={styles.meta}>Novas oportunidades podem aparecer aqui quando uma corrida não encontra motorista na busca inicial. A lista é atualizada automaticamente.</Text></Surface> : null}
  </ScrollView>;
}

function createStyles(palette: DriverPalette) { return StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 18, paddingTop: 28, paddingBottom: 32, gap: 13 }, headingRow: { flexDirection: "row", alignItems: "center", gap: 11 }, headingIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }, headingCopy: { flex: 1, gap: 3 }, eyebrow: { color: palette.forest, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, title: { color: palette.ink, fontSize: 25, fontWeight: "900", lineHeight: 29 }, refresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }, subtitle: { color: palette.muted, fontSize: 12, lineHeight: 18, marginBottom: 3 }, state: { alignItems: "center", gap: 9, paddingVertical: 24, paddingHorizontal: 18 }, card: { gap: 14, borderWidth: 1, borderColor: palette.line }, cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, category: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: palette.mint, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7 }, categoryText: { color: palette.forest, fontSize: 11, fontWeight: "900" }, payout: { alignItems: "flex-end", gap: 2 }, payoutLabel: { color: palette.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 }, payoutValue: { color: palette.ink, fontSize: 21, fontWeight: "900" }, route: { flexDirection: "row", gap: 11 }, routeRail: { width: 13, alignItems: "center", paddingVertical: 4 }, pickupDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.forest }, routeDash: { height: 25, borderLeftWidth: 1, borderStyle: "dashed", borderColor: palette.muted }, destinationDot: { width: 9, height: 9, borderRadius: 3, borderWidth: 2, borderColor: palette.ink }, routeCopy: { flex: 1, gap: 13 }, addressLabel: { color: palette.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 }, address: { color: palette.ink, fontSize: 12, fontWeight: "800", lineHeight: 17, marginTop: 3 }, details: { flexDirection: "row", flexWrap: "wrap", gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line, paddingVertical: 10 }, detail: { color: palette.inkSoft, fontSize: 10, fontWeight: "700" }, payment: { color: palette.muted, fontSize: 10 }, acceptButton: { minHeight: 48, borderRadius: 14, backgroundColor: palette.forest, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, acceptText: { color: palette.bg, fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.55 }, cardTitle: { color: palette.ink, fontSize: 14, fontWeight: "900", textAlign: "center" }, meta: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "center" }, link: { color: palette.forest, fontSize: 12, fontWeight: "900", padding: 7 },
}); }

