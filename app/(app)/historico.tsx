import React from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Surface } from "@/components/ui";
import { getDriverStatement } from "@/features/corrida/corridaService";
import { palette } from "@/theme";

function money(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00";
}

function rideDate(value?: string) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
}

export default function EarningsScreen() {
  const query = useQuery({ queryKey: ["driver-statement"], queryFn: () => getDriverStatement(50, 0) });
  return <ScrollView style={styles.flex} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={palette.forest} />}>
    <Text style={styles.eyebrow}>SEU DESEMPENHO</Text><Text style={styles.title}>Ganhos e corridas</Text><Text style={styles.subtitle}>Resumo financeiro sincronizado com o MOVI V3.</Text>
    <Surface style={styles.total}><Text style={styles.totalLabel}>GANHOS ACUMULADOS</Text><Text style={styles.totalValue}>{money(query.data?.ganhos_acumulados)}</Text><View style={styles.totalDivider} /><View style={styles.totalRow}><View><Text style={styles.metricValue}>{query.data?.corridas_concluidas ?? 0}</Text><Text style={styles.metricLabel}>concluídas</Text></View><View><Text style={styles.metricValue}>{query.data?.total_viagens ?? 0}</Text><Text style={styles.metricLabel}>no total</Text></View><View><Text style={styles.metricValue}>{money(query.data?.saldo_total)}</Text><Text style={styles.metricLabel}>saldo atual</Text></View></View></Surface>
    <Text style={styles.section}>Movimentações de corridas</Text>
    {query.isLoading ? <ActivityIndicator color={palette.forest} /> : null}
    {query.isError ? <Surface style={styles.empty}><Text style={styles.emptyTitle}>Não foi possível carregar o extrato</Text><Text style={styles.subtitle}>O servidor não confirmou esses dados. Tente atualizar.</Text></Surface> : null}
    {query.data?.historico.map((ride) => <Surface key={ride.id} style={styles.row}><View style={styles.icon}><MaterialCommunityIcons name={ride.status === "concluida" ? "check" : ride.status === "cancelada" ? "close" : "clock-outline"} size={18} color={ride.status === "concluida" ? palette.forest : palette.muted} /></View><View style={styles.ride}><Text style={styles.destination} numberOfLines={1}>{ride.destino || "Corrida MOVI"}</Text><Text style={styles.meta}>{rideDate(ride.finalizada_em ?? ride.criado_em)}</Text><Text style={styles.meta}>{ride.status === "concluida" ? "Concluída" : ride.status === "cancelada" ? "Cancelada" : ride.status === "em_andamento" ? "Em andamento" : ride.status === "aceita" ? "Aceita" : "Solicitada"} · {ride.forma_pagamento}</Text></View><View style={styles.amountWrap}><Text style={[styles.amount, ride.status !== "concluida" && styles.amountMuted]}>{ride.status === "concluida" ? `+ ${money(ride.ganho_motorista)}` : "—"}</Text><Text style={styles.payment}>{ride.status_pagamento ?? ""}</Text></View></Surface>)}
    {!query.isLoading && !query.data?.historico.length ? <Surface style={styles.empty}><Text style={styles.emptyTitle}>Suas primeiras corridas aparecerão aqui</Text><Text style={styles.subtitle}>Os ganhos só são exibidos depois que a corrida é confirmada pelo servidor.</Text></Surface> : null}
    <Text style={styles.footnote}>Este app ainda não solicita saques. Consulte o MOVI V3 para atualizações sobre repasses e conciliação.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({ flex: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, paddingTop: 28, paddingBottom: 45, gap: 14 }, eyebrow: { color: palette.forest, fontWeight: "900", fontSize: 9, letterSpacing: 1.5 }, title: { color: palette.ink, fontSize: 27, fontWeight: "900", marginTop: -8 }, subtitle: { color: palette.muted, fontSize: 12, lineHeight: 18 }, total: { backgroundColor: palette.ink, borderColor: palette.ink, gap: 10, marginVertical: 4 }, totalLabel: { color: "#C5D7CE", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, totalValue: { color: "white", fontSize: 30, fontWeight: "900" }, totalDivider: { height: 1, backgroundColor: "#FFFFFF2A", marginVertical: 3 }, totalRow: { flexDirection: "row", justifyContent: "space-between" }, metricValue: { color: "white", fontWeight: "900", fontSize: 13 }, metricLabel: { color: "#C5D7CE", fontSize: 9, marginTop: 3 }, section: { color: palette.ink, fontSize: 16, fontWeight: "900", marginTop: 4 }, row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13 }, icon: { width: 34, height: 34, borderRadius: 12, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }, ride: { flex: 1, gap: 3 }, destination: { color: palette.ink, fontSize: 12, fontWeight: "900" }, meta: { color: palette.muted, fontSize: 9 }, amountWrap: { alignItems: "flex-end", gap: 3 }, amount: { color: palette.forest, fontWeight: "900", fontSize: 11 }, amountMuted: { color: palette.muted }, payment: { color: palette.muted, fontSize: 8 }, empty: { gap: 8 }, emptyTitle: { color: palette.ink, fontWeight: "900", fontSize: 13 }, footnote: { textAlign: "center", color: palette.muted, fontSize: 10, lineHeight: 15, paddingHorizontal: 8, marginTop: 2 } });
