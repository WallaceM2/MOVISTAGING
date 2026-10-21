import React, { useCallback } from "react";
import { Image } from "react-native";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { AppButton, Surface } from "@/components/ui";
import { logout } from "@/features/auth/authService";
import { getDriverProfile } from "@/features/motorista/motoristaService";
import { disconnectSocket } from "@/realtime/socket";
import { useAuthStore } from "@/store/authStore";
import type { DriverPalette } from "@/theme";
import { useMoviTheme, useThemeStyles } from "@/theme/ThemeProvider";
import { enableRideNotifications, disableRideNotifications } from "@/features/push/pushService";
import { stopBackgroundLocation } from "@/location/backgroundLocation";
import { getMercadoPagoLinkStatus, startMercadoPagoLink } from "@/features/motorista/mercadoPagoService";

const links = [
  { route: "/(app)/suporte", icon: "message-question-outline", title: "Ajuda e suporte", detail: "Perguntas rápidas e chamados para a equipe MOVI" },
  { route: "/(app)/documentos", icon: "file-document-outline", title: "Documentos", detail: "Identidade, habilitação e veículo" },
  { route: "/legal", icon: "shield-check-outline", title: "Termos e privacidade", detail: "Documentos oficiais do MOVI" },
  { route: "/(app)/alterar-senha", icon: "lock-reset", title: "Alterar senha", detail: "Atualize sua credencial de acesso" },
] as const;

export default function DriverAccountScreen() {
  const { colors: palette } = useMoviTheme();
  const styles = useThemeStyles(createStyles);
  const clearSession = useAuthStore((state) => state.clearSession);
  const query = useQuery({ queryKey: ["driver-profile"], queryFn: getDriverProfile });
  const driver = query.data ?? useAuthStore.getState().motorista;
  const mpLink = useQuery({ queryKey: ["mercado-pago-link"], queryFn: getMercadoPagoLinkStatus, enabled: driver?.status_cadastro === "aprovado" });
  useFocusEffect(useCallback(() => {
    if (driver?.status_cadastro === "aprovado") void mpLink.refetch();
  }, [driver?.status_cadastro, mpLink.refetch]));

  async function linkMercadoPago() {
    try {
      await startMercadoPagoLink();
      Alert.alert("Autorização aberta", "Conclua a autorização na página segura do Mercado Pago e volte para esta tela.");
    } catch (error) {
      Alert.alert("Mercado Pago", error instanceof Error ? error.message : "Não foi possível iniciar a vinculação.");
    }
  }

  async function confirmLogout() {
    Alert.alert("Sair do MOVI", "Sua sessão será encerrada neste aparelho.", [
      { text: "Continuar conectado", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => {
        disconnectSocket();
        void stopBackgroundLocation().catch(() => undefined);
        void logout().catch(() => undefined).finally(() => { clearSession(); router.replace("/login"); });
      } },
    ]);
  }

  return <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>ÁREA DO PARCEIRO</Text><Text style={styles.title}>Sua conta</Text>
    <Surface style={styles.profile}><View style={styles.avatar}>{driver?.foto_perfil_url ? <Image source={{ uri: driver.foto_perfil_url }} style={styles.avatarImage} accessibilityLabel="Foto do motorista" /> : <Text style={styles.avatarText}>{driver?.nome?.charAt(0)?.toUpperCase() ?? "M"}</Text>}</View><View style={styles.profileText}><View style={styles.profileNameRow}><Text style={styles.name}>{driver?.nome ?? "Motorista MOVI"} {driver?.sobrenome ?? ""}</Text>{driver?.status_cadastro === "aprovado" && driver?.status_conta === "ativa" ? <MaterialCommunityIcons name="check-decagram" size={18} color={palette.cyan} accessibilityLabel="Conta verificada" /> : null}</View><Text style={styles.email}>{driver?.email ?? ""}</Text><Text style={styles.id}>ID MOVI · {driver?.id ?? "—"}</Text>{driver?.veiculo ? <Text style={styles.vehicle}>{driver.veiculo.marca} {driver.veiculo.modelo} · {driver.veiculo.placa}</Text> : null}</View></Surface>
    <Surface style={styles.statusCard}><View style={styles.statusTop}><Text style={styles.statusTitle}>Status do cadastro</Text><View style={[styles.pill, driver?.status_cadastro === "aprovado" ? styles.approved : styles.review]}><Text style={[styles.pillText, driver?.status_cadastro === "aprovado" ? styles.approvedText : styles.reviewText]}>{driver?.status_cadastro === "aprovado" ? "APROVADO" : driver?.status_cadastro === "reprovado" ? "REVISAR" : "EM ANÁLISE"}</Text></View></View><Text style={styles.statusCopy}>Conta {driver?.status_conta ?? "—"} · Categoria {driver?.categoria === "carro" ? "carro" : "moto"}</Text></Surface>
    <Text style={styles.section}>Conta e segurança</Text>
    <Surface style={styles.pushCard}><Text style={styles.linkTitle}>Avisos de corrida</Text><Text style={styles.linkSub}>Receba novas ofertas e atualizações quando o MOVI estiver em segundo plano.</Text><AppButton title="Ativar notificações" secondary onPress={() => void enableRideNotifications().then(() => Alert.alert("Notificações ativadas", "Este aparelho foi registrado para receber avisos do MOVI." )).catch((error) => Alert.alert("Notificações", error instanceof Error ? error.message : "Não foi possível ativar notificações."))} /><AppButton title="Desativar neste aparelho" secondary onPress={() => void disableRideNotifications().then(() => Alert.alert("Notificações desativadas", "Este aparelho não receberá novos avisos do MOVI." )).catch((error) => Alert.alert("Notificações", error instanceof Error ? error.message : "Não foi possível atualizar esta configuração."))} /></Surface>
    <Surface style={styles.pushCard}>
      <Text style={styles.linkTitle}>Conta de recebimento digital</Text>
      <Text style={styles.linkSub}>{mpLink.isError ? "A vinculação de teste ainda não está configurada no servidor MOVI." : mpLink.data?.vinculado ? "Conta Mercado Pago de teste vinculada. O vínculo não habilita pagamentos nem saques no MOVI." : "Vincule sua conta Mercado Pago para preparar os testes de marketplace. O MOVI nunca pede sua senha ou token nesta tela."}</Text>
      {driver?.status_cadastro === "aprovado" ? <AppButton title={mpLink.data?.vinculado ? "Atualizar vínculo de teste" : "Vincular Mercado Pago de teste"} secondary disabled={mpLink.isError} onPress={() => void linkMercadoPago()} /> : <Text style={styles.linkSub}>Disponível após aprovação do cadastro.</Text>}
      {mpLink.data?.vinculado ? <Text style={styles.connectionStatus}>Vínculo de teste ativo</Text> : null}
    </Surface>
    {links.map((item) => <Pressable key={item.route} onPress={() => router.push(item.route)}><Surface style={styles.linkCard}><View style={styles.linkIcon}><MaterialCommunityIcons name={item.icon as never} size={21} color={palette.forest} /></View><View style={styles.linkCopy}><Text style={styles.linkTitle}>{item.title}</Text><Text style={styles.linkSub}>{item.detail}</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color={palette.muted} /></Surface></Pressable>)}
    <Surface style={styles.help}><Text style={styles.helpTitle}>Conte com o MOVI</Text><Text style={styles.helpText}>Em caso de risco imediato, procure os serviços de emergência da sua região. Para dúvidas ou ocorrências, acesse Ajuda e suporte.</Text></Surface>
    <AppButton title="Sair da conta" danger secondary onPress={() => confirmLogout()} />
  </ScrollView>;
}

function createStyles(palette: DriverPalette) { return StyleSheet.create({ flex: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, paddingTop: 28, paddingBottom: 45, gap: 13 }, eyebrow: { color: palette.forest, fontSize: 9, letterSpacing: 1.4, fontWeight: "900" }, title: { color: palette.ink, fontSize: 27, fontWeight: "900", marginTop: -8 }, profile: { flexDirection: "row", alignItems: "center", gap: 13, marginTop: 5 }, avatar: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: palette.mint }, avatarText: { fontSize: 23, fontWeight: "900", color: palette.forest }, profileText: { flex: 1, gap: 3 }, profileNameRow: { flexDirection: "row", alignItems: "center", gap: 6 }, avatarImage: { width: 52, height: 52, borderRadius: 18 }, name: { color: palette.ink, fontWeight: "900", fontSize: 15 }, email: { color: palette.muted, fontSize: 11 }, id: { color: palette.forest, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 }, vehicle: { color: palette.inkSoft, fontSize: 10, fontWeight: "800", marginTop: 2 }, statusCard: { gap: 8 }, statusTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, statusTitle: { color: palette.ink, fontWeight: "900", fontSize: 13 }, pill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6 }, approved: { backgroundColor: palette.mint }, review: { backgroundColor: palette.amberBg }, pillText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.7 }, approvedText: { color: palette.forest }, reviewText: { color: palette.amber }, statusCopy: { color: palette.muted, fontSize: 11 }, section: { color: palette.ink, fontWeight: "900", fontSize: 15, marginTop: 6 }, pushCard: { gap: 9 }, connectionStatus: { color: palette.forest, fontWeight: "900", fontSize: 10 }, linkCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13 }, linkIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }, linkCopy: { flex: 1, gap: 3 }, linkTitle: { color: palette.ink, fontWeight: "900", fontSize: 12 }, linkSub: { color: palette.muted, fontSize: 10 }, help: { backgroundColor: "#0B302C", borderColor: "#0B302C", gap: 6, marginTop: 3 }, helpTitle: { color: "white", fontWeight: "900", fontSize: 13 }, helpText: { color: "#C5D7CE", fontSize: 10, lineHeight: 16 } }); }

