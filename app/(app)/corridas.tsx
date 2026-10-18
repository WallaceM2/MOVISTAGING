import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Surface } from "@/components/ui";
import { getDriverStatement } from "@/features/corrida/corridaService";
import type { DriverPalette } from "@/theme";
import { useMoviTheme, useThemeStyles } from "@/theme/ThemeProvider";

const filters = ["Todas", "Concluídas", "Canceladas"] as const;
type Filter = typeof filters[number];
const dateLabel = (value?: string) => { if (!value) return "Data não informada"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); };
const money = (value: string | number | null | undefined) => Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function DriverRidesScreen() {
  const { colors: palette } = useMoviTheme();
  const styles = useThemeStyles(createStyles);
  const [filter, setFilter] = useState<Filter>("Todas");
  const query = useQuery({ queryKey: ["driver-statement", "rides"], queryFn: () => getDriverStatement(50, 0) });
  const rows = useMemo(() => (query.data?.historico ?? []).filter((ride) => filter === "Todas" || (filter === "Concluídas" ? ride.status === "concluida" : ride.status === "cancelada")), [filter, query.data?.historico]);
  return <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={palette.forest} />}>
    <Text style={styles.eyebrow}>SUA ATIVIDADE</Text><Text style={styles.title}>Minhas corridas</Text><Text style={styles.subtitle}>Histórico sincronizado com o MOVI V3.</Text>
    <View style={styles.filters}>{filters.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: filter === item }} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>)}</View>
    {query.isLoading ? <ActivityIndicator color={palette.forest} /> : null}
    {query.isError ? <Surface style={styles.empty}><Text style={styles.rowTitle}>Não foi possível carregar as corridas</Text><Pressable onPress={() => void query.refetch()}><Text style={styles.link}>Tentar novamente</Text></Pressable></Surface> : null}
    {rows.map((ride) => <Pressable key={ride.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/(app)/corrida", params: { id: String(ride.id) } })}><Surface style={styles.row}><View style={styles.icon}><MaterialCommunityIcons name={ride.status === "concluida" ? "check" : ride.status === "cancelada" ? "close" : "clock-outline"} size={18} color={ride.status === "concluida" ? palette.forest : palette.muted} /></View><View style={styles.copy}><Text style={styles.rowTitle} numberOfLines={1}>{ride.destino || "Corrida MOVI"}</Text><Text style={styles.meta}>{ride.origem || "Origem não informada"}</Text><Text style={styles.meta}>{dateLabel(ride.finalizada_em ?? ride.criado_em)} · {ride.status}</Text></View><View style={styles.money}><Text style={styles.amount}>{ride.status === "concluida" ? money(ride.ganho_motorista) : "—"}</Text><Text style={styles.meta}>{ride.forma_pagamento}</Text></View></Surface></Pressable>)}
    {!query.isLoading && !query.isError && rows.length === 0 ? <Surface style={styles.empty}><Text style={styles.rowTitle}>Nenhuma corrida nesta categoria</Text><Text style={styles.meta}>Quando o V3 registrar corridas, elas aparecerão aqui.</Text></Surface> : null}
  </ScrollView>;
}
function createStyles(palette: DriverPalette) { return StyleSheet.create({ page: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, paddingTop: 26, paddingBottom: 34, gap: 13 }, eyebrow: { color: palette.forest, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 }, title: { color: palette.ink, fontSize: 26, fontWeight: "900", marginTop: -8 }, subtitle: { color: palette.muted, fontSize: 12 }, filters: { flexDirection: "row", gap: 8, marginVertical: 6 }, filter: { borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper }, filterActive: { backgroundColor: palette.mint, borderColor: palette.forest }, filterText: { color: palette.muted, fontSize: 11, fontWeight: "800" }, filterTextActive: { color: palette.forest }, row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13 }, icon: { width: 36, height: 36, borderRadius: 13, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }, copy: { flex: 1, gap: 4 }, rowTitle: { color: palette.ink, fontSize: 12, fontWeight: "900" }, meta: { color: palette.muted, fontSize: 9 }, money: { alignItems: "flex-end", gap: 4 }, amount: { color: palette.forest, fontSize: 11, fontWeight: "900" }, empty: { gap: 8 }, link: { color: palette.forest, fontSize: 12, fontWeight: "800" } }); }
