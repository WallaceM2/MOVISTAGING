import React, { useMemo } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Surface } from "@/components/ui";
import { getDriverStatement } from "@/features/corrida/corridaService";
import { listDriverRatings, type DriverRating } from "@/features/avaliacao/avaliacaoService";
import { getDriverProfile } from "@/features/motorista/motoristaService";
import { useAuthStore } from "@/store/authStore";
import type { DriverPalette } from "@/theme";
import { useMoviTheme, useThemeStyles } from "@/theme/ThemeProvider";

const compliments = [
  { id: "atencioso", label: "Bom motorista", icon: "account-heart-outline" },
  { id: "veiculo_limpo", label: "Veículo limpo e confortável", icon: "car-wash" },
  { id: "boa_rota", label: "Boa rota", icon: "map-marker-path" },
  { id: "atendimento_excelente", label: "Ótimo atendimento", icon: "hand-heart-outline" },
  { id: "viagem_confortavel", label: "Viagem confortável", icon: "seat-recline-normal" },
  { id: "direcao_segura", label: "Direção segura", icon: "shield-check-outline" },
] as const;

function tenure(value?: string) {
  if (!value) return "Data indisponível";
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return "Data indisponível";
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0 && remainingMonths === 0) return "Há menos de um mês";
  if (years === 0) return `${remainingMonths} ${remainingMonths === 1 ? "mês" : "meses"}`;
  if (remainingMonths === 0) return `${years} ${years === 1 ? "ano" : "anos"}`;
  return `${years} ${years === 1 ? "ano" : "anos"} e ${remainingMonths} ${remainingMonths === 1 ? "mês" : "meses"}`;
}

function ratingValue(rating: DriverRating) {
  const value = Number(rating.nota);
  return Number.isFinite(value) ? Math.min(5, Math.max(1, Math.round(value))) : 0;
}

export default function PartnerProfileScreen() {
  const styles = useThemeStyles(createStyles);
  const { colors } = useMoviTheme();
  const cachedDriver = useAuthStore((state) => state.motorista);
  const profile = useQuery({ queryKey: ["driver-profile"], queryFn: getDriverProfile, staleTime: 60000 });
  const driver = profile.data ?? cachedDriver;
  const statement = useQuery({ queryKey: ["driver-statement", "partner-profile"], queryFn: () => getDriverStatement(1, 0), staleTime: 60000, enabled: Boolean(driver?.id) });
  const ratings = useQuery({ queryKey: ["driver-ratings", driver?.id], queryFn: () => listDriverRatings(driver!.id, 100), staleTime: 60000, refetchInterval: 60000, refetchIntervalInBackground: false, enabled: Boolean(driver?.id) });
  const latest = (ratings.data ?? []).slice(0, 100);
  const aggregate = useMemo(() => {
    const distribution = [1, 2, 3, 4, 5].map((star) => latest.filter((item) => ratingValue(item) === star).length);
    const average = latest.length ? latest.reduce((sum, item) => sum + ratingValue(item), 0) / latest.length : null;
    const tagCounts = new Map<string, number>();
    latest.filter((item) => ratingValue(item) === 5).forEach((item) => {
      for (const tag of new Set(item.tags ?? [])) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    });
    return { distribution, average, tagCounts };
  }, [latest]);
  const name = [driver?.nome, driver?.sobrenome].filter(Boolean).join(" ").trim();
  const initial = name.charAt(0).toLocaleUpperCase("pt-BR") || "M";

  const refresh = () => { void Promise.all([profile.refetch(), statement.refetch(), ratings.refetch()]); };
  if (profile.isLoading && !driver) return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Carregando perfil…</Text></View>;

  return <ScrollView style={styles.fill} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={profile.isRefetching || statement.isRefetching || ratings.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}>
    <Text style={styles.eyebrow}>MOVI DRIVE</Text>
    <Text style={styles.title}>Perfil parceiro</Text>
    <Surface style={styles.profileCard}>
      {driver?.foto_perfil_url ? <Image source={{ uri: driver.foto_perfil_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{initial}</Text></View>}
      <View style={styles.identity}>
        <Text style={styles.name}>{name || "Motorista parceiro"}</Text>
        <Text style={styles.subtitle}>Parceiro MOVI desde {tenure(driver?.criado_em)}</Text>
      </View>
    </Surface>

    <View style={styles.statsRow}>
      <Surface style={styles.statCard}><MaterialCommunityIcons name="car-multiple" size={20} color={colors.primary} /><Text style={styles.statValue}>{statement.data?.corridas_concluidas ?? "—"}</Text><Text style={styles.statLabel}>Corridas concluídas</Text></Surface>
      <Surface style={styles.statCard}><MaterialCommunityIcons name="calendar-star" size={20} color={colors.cyan} /><Text style={styles.statValue}>{tenure(driver?.criado_em)}</Text><Text style={styles.statLabel}>Tempo com o MOVI</Text></Surface>
    </View>

    <Surface style={styles.ratingCard}>
      <Text style={styles.sectionTitle}>Avaliação</Text>
      {ratings.isLoading ? <ActivityIndicator color={colors.primary} /> : ratings.isError ? <>
        <Text style={styles.muted}>Não foi possível carregar as avaliações agora.</Text>
        <Text onPress={() => void ratings.refetch()} accessibilityRole="button" style={styles.retry}>Tentar novamente</Text>
      </> : latest.length ? <>
        <View style={styles.averageRow}><Text style={styles.average}>{aggregate.average?.toFixed(1)}</Text><View><View style={styles.starDisplay}>{[1, 2, 3, 4, 5].map((star) => <MaterialCommunityIcons key={star} name="star" size={17} color={star <= Math.round(aggregate.average ?? 0) ? colors.amber : colors.border} />)}</View><Text style={styles.muted}>Baseada nas {latest.length} avaliações mais recentes</Text></View></View>
        <Text style={styles.sectionTitle}>Últimas 100 avaliações de corridas</Text>
        {[5, 4, 3, 2, 1].map((star) => {
          const count = aggregate.distribution[star - 1];
          return <View key={star} style={styles.distributionRow}>
            <Text style={styles.starLabel}>{star}</Text><MaterialCommunityIcons name="star" size={15} color={colors.amber} />
            <View accessibilityRole="progressbar" accessibilityLabel={`${count} avaliações de ${star} estrelas entre as últimas 100`} accessibilityValue={{ min: 0, max: 100, now: count }} style={styles.track}><View style={[styles.progress, { width: `${count}%` }]} /></View>
            <Text style={styles.count}>{count}</Text>
          </View>;
        })}
      </> : <Text style={styles.muted}>Você ainda não recebeu avaliações de corridas.</Text>}
    </Surface>

    <Surface style={styles.complimentsCard}>
      <Text style={styles.sectionTitle}>Minhas avaliações positivas</Text>
      <Text style={styles.muted}>Elogios recebidos em avaliações de 5 estrelas, entre as 100 mais recentes.</Text>
      {ratings.isError ? <Text style={styles.muted}>Os elogios não estão disponíveis enquanto as avaliações não carregarem.</Text> : null}
      {!ratings.isError && !compliments.some((item) => (aggregate.tagCounts.get(item.id) ?? 0) > 0) ? <Text style={styles.muted}>Seus elogios aparecerão aqui quando passageiros os enviarem.</Text> : null}
      <View style={styles.badges}>
        {compliments.filter((item) => (aggregate.tagCounts.get(item.id) ?? 0) > 0).map((item) => <View key={item.id} style={styles.badge}>
          <View style={styles.badgeIcon}><MaterialCommunityIcons name={item.icon as never} size={21} color={colors.primary} /><Text style={styles.badgeCount}>{aggregate.tagCounts.get(item.id)}</Text></View>
          <Text style={styles.badgeLabel}>{item.label}</Text>
        </View>)}
      </View>
    </Surface>
    <Text style={styles.footnote}>A nota e a distribuição são calculadas pelas até 100 avaliações mais recentes. A cada nova avaliação, a mais antiga sai dessa janela quando o limite é atingido.</Text>
    {statement.isError ? <Text style={styles.muted}>O total de corridas não pôde ser atualizado. Puxe a tela para tentar novamente.</Text> : null}
  </ScrollView>;
}

function createStyles(palette: DriverPalette) { return StyleSheet.create({
  fill: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, paddingTop: 22, paddingBottom: 42, gap: 13 }, center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, backgroundColor: palette.canvas },
  eyebrow: { color: palette.forest, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 }, title: { color: palette.ink, fontSize: 27, fontWeight: "900", marginTop: -8 }, profileCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 }, avatar: { width: 68, height: 68, borderRadius: 23, backgroundColor: palette.mint }, avatarFallback: { width: 68, height: 68, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: palette.mint }, avatarText: { color: palette.forest, fontSize: 27, fontWeight: "900" }, identity: { flex: 1, gap: 6 }, name: { color: palette.ink, fontSize: 17, fontWeight: "900" }, subtitle: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  statsRow: { flexDirection: "row", gap: 10 }, statCard: { flex: 1, minHeight: 112, alignItems: "flex-start", justifyContent: "center", gap: 5, padding: 13 }, statValue: { color: palette.ink, fontSize: 17, fontWeight: "900" }, statLabel: { color: palette.muted, fontSize: 10, lineHeight: 15 }, ratingCard: { gap: 13 }, sectionTitle: { color: palette.ink, fontSize: 15, fontWeight: "900" }, averageRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 6 }, average: { color: palette.ink, fontSize: 40, fontWeight: "900" }, starDisplay: { flexDirection: "row", gap: 2, marginBottom: 4 }, muted: { color: palette.muted, fontSize: 11, lineHeight: 17 }, retry: { color: palette.forest, fontSize: 12, fontWeight: "900", paddingVertical: 6 },
  distributionRow: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 7 }, starLabel: { width: 12, color: palette.ink, fontSize: 11, fontWeight: "800", textAlign: "right" }, track: { flex: 1, height: 8, overflow: "hidden", borderRadius: 99, backgroundColor: palette.line }, progress: { height: "100%", borderRadius: 99, backgroundColor: palette.forest }, count: { width: 25, color: palette.muted, fontSize: 10, textAlign: "right" }, complimentsCard: { gap: 12 }, badges: { flexDirection: "row", flexWrap: "wrap", gap: 14 }, badge: { width: 92, alignItems: "center", gap: 7 }, badgeIcon: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: palette.mint, borderWidth: 1, borderColor: palette.line }, badgeCount: { position: "absolute", top: -4, right: -7, minWidth: 21, height: 21, overflow: "hidden", borderRadius: 11, textAlign: "center", textAlignVertical: "center", color: palette.paper, backgroundColor: palette.forest, fontSize: 10, fontWeight: "900" }, badgeLabel: { color: palette.inkSoft, fontSize: 10, lineHeight: 14, textAlign: "center" }, footnote: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: "center", paddingHorizontal: 4 },
}); }
