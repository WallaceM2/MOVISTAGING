import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { AppButton, Surface } from "@/components/ui";
import { DriverMap } from "@/components/DriverMap";
import { EmergencyAccess } from "@/components/EmergencyAccess";
import { cancelRide, finishRide, getRide, markArrival, startRide } from "@/features/corrida/corridaService";
import { subscribeRideEvents, updateLocation } from "@/realtime/socket";
import type { DriverPalette } from "@/theme";
import { useMoviTheme, useThemeStyles } from "@/theme/ThemeProvider";
import { setBackgroundRide, stopBackgroundLocation } from "@/location/backgroundLocation";

function money(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00";
}

export default function ActiveRideScreen() {
  const { colors: palette } = useMoviTheme();
  const styles = useThemeStyles(createStyles);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const rideId = Number(params.id);
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [received, setReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const rideQuery = useQuery({ queryKey: ["driver-ride", rideId], queryFn: () => getRide(rideId), enabled: Number.isInteger(rideId) && rideId > 0, refetchInterval: 15000, refetchIntervalInBackground: false });
  const ride = rideQuery.data;

  useEffect(() => subscribeRideEvents({
    corrida_cancelada: (event) => {
      if (event.corrida_id !== rideId) return;
      client.setQueryData(["driver-ride", rideId], event.corrida);
      void client.invalidateQueries({ queryKey: ["driver-statement"] });
      if (event.corrida.taxa_cancelamento) {
        Alert.alert("Corrida cancelada", `Crédito recebido na carteira MOVI: ${money(event.corrida.taxa_cancelamento.valor)}. O débito do passageiro permanece em aberto.`);
      }
    },
  }), [client, rideId]);

  useEffect(() => {
    if (!ride || !["aceita", "em_andamento"].includes(ride.status)) return;
    void setBackgroundRide(ride.id).catch(() => undefined);
    let mounted = true;
    let subscription: Location.LocationSubscription | null = null;
    void Location.requestForegroundPermissionsAsync().then((permission) => {
      if (!permission.granted) return;
      return Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 20 }, (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setLocation(point);
        void updateLocation(point.lat, point.lng, ride.id, position.coords.heading ?? undefined).catch(() => undefined);
      });
    }).then((watch) => { if (watch && mounted) subscription = watch; else watch?.remove(); }).catch(() => undefined);
    return () => { mounted = false; subscription?.remove(); };
  }, [ride?.id, ride?.status]);

  useEffect(() => {
    if (ride && ["concluida", "cancelada", "expirada"].includes(ride.status)) void stopBackgroundLocation().catch(() => undefined);
  }, [ride?.status]);

  async function begin() {
    if (!ride || code.trim().length !== 6) return Alert.alert("Código necessário", "Peça ao passageiro o código de embarque de 6 caracteres antes de iniciar a corrida.");
    setBusy(true);
    try {
      const result = await startRide(ride.id, code.trim().toUpperCase());
      client.setQueryData(["driver-ride", ride.id], result.corrida);
      setCode("");
      await client.invalidateQueries({ queryKey: ["driver-statement"] });
    } catch (error) {
      Alert.alert("Não foi possível iniciar", error instanceof Error ? error.message : "Confirme o código com o passageiro.");
      if (error instanceof Error && error.message.includes("Limite de tentativas")) setCode("");
    } finally { setBusy(false); }
  }

  async function confirmArrival() {
    if (!ride || ride.status !== "aceita") return;
    setBusy(true);
    try {
      const result = await markArrival(ride.id);
      client.setQueryData(["driver-ride", ride.id], result.corrida);
      Alert.alert("Chegada registrada", "O passageiro foi avisado de que você chegou ao embarque.");
    } catch (error) {
      Alert.alert("Não foi possível registrar a chegada", error instanceof Error ? error.message : "Confira sua conexão e tente novamente.");
      void rideQuery.refetch();
    } finally { setBusy(false); }
  }

  async function finalize(payment: { status_pagamento: "pago" | "parcial" | "nao_pago"; valor_recebido_motorista?: number }) {
    if (!ride) return;
    setBusy(true);
    try {
      const result = await finishRide(ride.id, payment);
      await stopBackgroundLocation().catch(() => undefined);
      client.setQueryData(["driver-ride", ride.id], result.corrida);
      await client.invalidateQueries({ queryKey: ["driver-statement"] });
      const cashSettlement = result.financeiro.acerto_dinheiro;
      const financialMessage = cashSettlement
        ? `Recebido em dinheiro: ${money(cashSettlement.valor_recebido)}\nDébito registrado para o passageiro: ${money(cashSettlement.debito_passageiro)}\nComissão total da MOVI: ${money(cashSettlement.comissao_total)} (contabilizada uma única vez)\nAdiantamento econômico previsto: ${money(cashSettlement.adiantamento_motorista_previsto)}\nAté ${money(cashSettlement.protecao_nao_recuperavel_maxima)} dentro do teto de proteção; ${money(cashSettlement.parcela_acima_do_teto_recuperavel)} acima do teto é recuperável.\n\nA liquidação bancária do adiantamento ainda não está integrada.`
        : "A conclusão e o registro financeiro foram confirmados pelo servidor.";
      Alert.alert("Corrida concluída", financialMessage, [{ text: "Voltar ao início", onPress: () => router.replace("/(app)/home") }]);
    } catch (error) {
      Alert.alert("Não foi possível finalizar", error instanceof Error ? error.message : "O backend não confirmou a finalização.");
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!ride) return;
    Alert.alert("Cancelar corrida", "O cancelamento será registrado no MOVI e informado ao passageiro.", [
      { text: "Continuar corrida", style: "cancel" },
      { text: "Cancelar corrida", style: "destructive", onPress: () => {
        setBusy(true);
        void cancelRide(ride.id).then(async () => {
          await stopBackgroundLocation().catch(() => undefined);
          await client.invalidateQueries({ queryKey: ["driver-statement"] });
          router.replace("/(app)/home");
        }).catch((error) => Alert.alert("Não foi possível cancelar", error instanceof Error ? error.message : "Tente novamente.")).finally(() => setBusy(false));
      } },
    ]);
  }

  function navigate() {
    if (!ride) return;
    const point = ride.status === "em_andamento" ? { lat: Number(ride.destino_lat), lng: Number(ride.destino_lng) } : { lat: Number(ride.origem_lat), lng: Number(ride.origem_lng) };
    const url = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}&travelmode=driving`;
    void Linking.openURL(url).catch(() => Alert.alert("Navegação", "Não foi possível abrir o aplicativo de mapas."));
  }

  if (!Number.isInteger(rideId) || rideId < 1) return <View style={styles.center}><Text style={styles.title}>Corrida não identificada</Text><AppButton title="Voltar ao início" onPress={() => router.replace("/(app)/home")} /></View>;
  if (rideQuery.isLoading) return <View style={styles.center}><ActivityIndicator color={palette.forest} /><Text style={styles.muted}>Carregando corrida segura…</Text></View>;
  if (rideQuery.isError || !ride) return <View style={styles.center}><Text style={styles.title}>Não foi possível carregar a corrida</Text><Text style={styles.muted}>O acesso é conferido pelo MOVI para sua conta de motorista.</Text><AppButton title="Tentar novamente" onPress={() => void rideQuery.refetch()} /><AppButton title="Voltar ao início" secondary onPress={() => router.replace("/(app)/home")} /></View>;

  const destination = ride.status === "em_andamento";
  const statusLabel = ride.status === "aceita" ? (ride.motorista_chegou_em ? "Cheguei ao embarque" : "A caminho do embarque") : ride.status === "em_andamento" ? "Corrida em andamento" : ride.status === "concluida" ? "Corrida concluída" : ride.status === "cancelada" ? "Corrida cancelada" : "Corrida indisponível";
  const mapPoint = location ?? { lat: Number(destination ? ride.destino_lat : ride.origem_lat), lng: Number(destination ? ride.destino_lng : ride.origem_lng) };
  const fareValue = Number(ride.valor ?? 0);
  const cancellationDebt = Number(ride.debito_taxa_cancelamento ?? 0);
  const fullValue = Number((fareValue + cancellationDebt).toFixed(2));
  const cash = ride.forma_pagamento === "dinheiro";
  const partialAmount = Number(received.replace(/\./g, "").replace(",", "."));
  const activeRide = ride.status === "aceita" || ride.status === "em_andamento";
  const rideMapHeight = Math.min(560, Math.max(380, Math.round(windowHeight * 0.56)));

  function handleDockAction() {
    if (!ride) return;
    if (ride.status === "aceita") {
      if (!ride.motorista_chegou_em) return void confirmArrival();
      if (code.trim().length !== 6) { setDetailsExpanded(true); return; }
      return void begin();
    }
    if (ride.status !== "em_andamento") return;
    if (!detailsExpanded) { setDetailsExpanded(true); return; }
    if (!cash) return Alert.alert("Pagamento digital", "A finalização depende da confirmação do provedor de pagamento integrado ao MOVI.");
    if (partialAmount > fullValue) return Alert.alert("Valor recebido", "O valor informado não pode ser maior que o total a receber.");
    if (partialAmount === 0) return Alert.alert("Não recebeu o pagamento?", "Confirme o não pagamento para registrar o saldo pendente do passageiro.", [
      { text: "Voltar", style: "cancel" },
      { text: "Confirmar não pagamento", style: "destructive", onPress: () => void finalize({ status_pagamento: "nao_pago", valor_recebido_motorista: 0 }) },
    ]);
    void finalize({ status_pagamento: partialAmount >= fullValue ? "pago" : "parcial", valor_recebido_motorista: partialAmount });
  }

  return <><ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: activeRide ? 14 : 42 }]}>
    <View style={styles.top}><Text style={styles.topEyebrow}>CORRIDA MOVI · #{ride.id}</Text><Text style={styles.status}>{statusLabel}</Text></View>
    <DriverMap coordinate={mapPoint} recenterCoordinate={location} height={rideMapHeight} label={destination ? "Navegue até o destino" : "Navegue até o passageiro"} />
    {(!activeRide || detailsExpanded) ? <>
    {ride.passageiro ? <Surface style={styles.passengerCard}><View style={styles.passengerAvatar}><Text style={styles.passengerAvatarText}>{ride.passageiro.nome.slice(0, 1).toUpperCase()}</Text></View><View style={styles.passengerDetails}><Text style={styles.passengerName}>{ride.passageiro.nome}</Text><Text style={styles.passengerRating}>{Number(ride.passageiro.nota_media) > 0 ? `★ ${Number(ride.passageiro.nota_media).toFixed(1)} · ${ride.passageiro.total_avaliacoes} avaliações` : "Sem avaliações"}{ride.passageiro.conta_verificada ? " · conta verificada" : ""}</Text></View></Surface> : null}
    <Surface style={styles.routeCard}><View style={styles.addressRow}><View style={[styles.addressMarker, { backgroundColor: destination ? palette.line : palette.forest }]} /><View style={styles.addressText}><Text style={styles.addressLabel}>EMBARQUE</Text><Text selectable style={styles.address}>{ride.origem}</Text></View></View><View style={styles.routeLine} /><View style={styles.addressRow}><View style={[styles.addressMarker, { backgroundColor: destination ? palette.forest : palette.ink }]} /><View style={styles.addressText}><Text style={styles.addressLabel}>DESTINO</Text><Text selectable style={styles.address}>{ride.destino}</Text></View></View><AppButton title={destination ? "Abrir navegação até o destino" : "Abrir navegação até o embarque"} secondary onPress={navigate} /></Surface>
    {ride.status === "aceita" || ride.status === "em_andamento" ? <AppButton title="Chat com passageiro" secondary onPress={() => router.push({ pathname: "/(app)/chat", params: { id: String(ride.id) } })} /> : null}
    <Surface style={styles.summary}><View><Text style={styles.summaryLabel}>SEU GANHO PREVISTO</Text><Text style={styles.gain}>{money(ride.ganho_motorista)}</Text></View><View style={styles.summaryDivider} /><View style={styles.summaryStats}><Text style={styles.summaryMeta}>{Number(ride.distancia_km).toFixed(1)} km de viagem</Text><Text style={styles.summaryMeta}>{Math.round(Number(ride.tempo_minutos))} min estimados</Text><Text style={styles.summaryMeta}>{ride.categoria === "moto" ? "Moto" : "Carro"} · {cash ? "Dinheiro" : ride.forma_pagamento.toUpperCase()}</Text></View></Surface>
    {ride.status === "aceita" ? <Surface style={styles.actionCard}><View style={styles.safetyHeader}><Text style={styles.actionTitle}>{ride.motorista_chegou_em ? "Você chegou ao embarque" : "A caminho do embarque"}</Text><View style={styles.secureIcon}><Text style={styles.secureIconText}>✓</Text></View></View><Text style={styles.instructions}>Ao chegar, registre sua chegada para avisar o passageiro. Depois, peça o código de 6 caracteres e valide-o antes de iniciar a viagem.</Text>{!ride.motorista_chegou_em ? <Text style={styles.safetyNote}>Use o botão inferior para confirmar que chegou ao embarque.</Text> : <Text style={styles.safetyNote}>O passageiro foi avisado. Confirme a pessoa e informe o código de embarque para iniciar.</Text>}<TextInput value={code} onChangeText={(value) => setCode(value.replace(/[^0-9a-f]/gi, "").toUpperCase().slice(0, 6))} placeholder="CÓDIGO DE EMBARQUE" placeholderTextColor={palette.muted} maxLength={6} autoCapitalize="characters" autoCorrect={false} autoComplete="off" textContentType="oneTimeCode" keyboardType="default" style={styles.codeInput} /><Text style={styles.safetyNote}>O MOVI valida o código no servidor e limita tentativas incorretas. Nunca inicie sem confirmar o passageiro correto.</Text><AppButton title="Cancelar corrida" danger secondary onPress={() => void cancel()} disabled={busy} /></Surface> : null}
    {ride.status === "em_andamento" ? <Surface style={styles.actionCard}><Text style={styles.actionTitle}>Ao chegar ao destino</Text><Text style={styles.instructions}>Registre somente o valor que você realmente recebeu. Os 15% da MOVI incidem apenas sobre a tarifa da viagem; eventual débito anterior é recuperado separadamente e não paga comissão novamente.</Text>{cash ? <><Text style={styles.paymentLabel}>TARIFA DA CORRIDA</Text><Text style={styles.paymentTotal}>{money(fareValue)}</Text>{cancellationDebt > 0 ? <><Text style={styles.paymentLabel}>DÉBITO ANTERIOR A DEVOLVER À MOVI</Text><Text style={styles.paymentTotal}>{money(cancellationDebt)}</Text><Text style={styles.paymentPending}>O passageiro tinha saldo pendente. Receba o total exibido; o sistema debitará essa recuperação da sua carteira MOVI.</Text></> : null}<Text style={styles.paymentLabel}>TOTAL A RECEBER</Text><Text style={styles.paymentTotal}>{money(fullValue)}</Text><TextInput value={received} onChangeText={(value) => setReceived(value.replace(/[^0-9,.]/g, ""))} placeholder="Valor recebido em dinheiro" placeholderTextColor={palette.muted} keyboardType="decimal-pad" style={styles.codeInput} /></> : <Text style={styles.paymentPending}>A confirmação do pagamento digital precisa vir do provedor integrado ao MOVI. A corrida só poderá ser finalizada após essa confirmação.</Text>}</Surface> : null}
    {ride.status === "concluida" ? <Surface style={styles.finished}><Text style={styles.finishedTitle}>Corrida concluída</Text><Text style={styles.muted}>Pagamento: {ride.status_pagamento ?? "registrado"}. Seu extrato será atualizado.</Text><AppButton title="Voltar ao início" onPress={() => router.replace("/(app)/home")} /></Surface> : null}
    {(ride.status === "em_andamento" || ride.status === "concluida") && ride.passageiro_id ? <AppButton title="Relatar problema com esta corrida" secondary onPress={() => router.push({ pathname: "/(app)/denunciar", params: { corridaId: String(ride.id), passageiroId: String(ride.passageiro_id) } })} disabled={busy} /> : null}
    {ride.status === "cancelada" || ride.status === "expirada" ? <Surface style={styles.finished}><Text style={styles.finishedTitle}>Esta corrida não está ativa</Text>{ride.taxa_cancelamento ? <Text style={styles.muted}>Valor recebido na carteira MOVI: {money(ride.taxa_cancelamento.valor)}. O crédito foi feito pela plataforma e já está no seu saldo operacional; o débito do passageiro continua em aberto. Este crédito não representa transferência bancária.</Text> : ride.status === "cancelada" ? <Text style={styles.muted}>Nenhuma taxa de cancelamento foi registrada para esta corrida.</Text> : null}<AppButton title="Voltar ao início" onPress={() => router.replace("/(app)/home")} /></Surface> : null}
    <Text style={styles.footer}>Sua localização é compartilhada com o passageiro somente durante a corrida ativa, conforme as permissões do MOVI.</Text>
    </> : null}
  </ScrollView>{activeRide ? <View style={[styles.actionDock, { paddingBottom: Math.max(insets.bottom, 10) }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={detailsExpanded ? "Minimizar informações da corrida" : "Expandir informações da corrida"} onPress={() => setDetailsExpanded((current) => !current)} style={styles.dockToggle}>
      <MaterialCommunityIcons name={detailsExpanded ? "close" : "chevron-up"} size={19} color={palette.cyan} />
      <Text style={styles.dockToggleText}>{detailsExpanded ? "Minimizar informações" : "Ver informações da corrida"}</Text>
    </Pressable>
    <AppButton title={ride.status === "aceita" ? (ride.motorista_chegou_em ? "Iniciar corrida" : "Cheguei ao embarque") : detailsExpanded ? "Finalizar corrida" : "Corrida em andamento"} onPress={handleDockAction} loading={busy} disabled={busy} />
  </View> : null}{ride.status === "em_andamento" ? <EmergencyAccess visible /> : null}</>;
}

function createStyles(palette: DriverPalette) { return StyleSheet.create({ flex: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 18, paddingTop: 16, paddingBottom: 42, gap: 14 }, actionDock: { backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.border, paddingHorizontal: 18, paddingTop: 8, gap: 6, elevation: 18 }, dockToggle: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, dockToggleText: { color: palette.cyan, fontSize: 11, fontWeight: "800" }, center: { flex: 1, backgroundColor: palette.canvas, justifyContent: "center", padding: 24, gap: 14 }, top: { gap: 4 }, topEyebrow: { color: palette.forest, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }, status: { color: palette.ink, fontSize: 24, fontWeight: "900" }, passengerCard: { flexDirection: "row", alignItems: "center", gap: 12 }, passengerAvatar: { width: 44, height: 44, borderRadius: 16, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }, passengerAvatarText: { color: palette.forest, fontSize: 19, fontWeight: "900" }, passengerDetails: { flex: 1, gap: 4 }, passengerName: { color: palette.ink, fontSize: 14, fontWeight: "900" }, passengerRating: { color: palette.muted, fontSize: 11, fontWeight: "700" }, routeCard: { gap: 15 }, addressRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 }, addressMarker: { width: 12, height: 12, marginTop: 4, borderRadius: 4 }, addressText: { flex: 1, gap: 4 }, addressLabel: { color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, address: { color: palette.ink, fontSize: 13, fontWeight: "700", lineHeight: 19 }, routeLine: { height: 14, marginLeft: 5, borderLeftWidth: 1, borderColor: palette.line, borderStyle: "dashed" }, summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#0B302C", borderColor: "#0B302C" }, summaryLabel: { color: "#C5D7CE", fontSize: 9, fontWeight: "900", letterSpacing: 1 }, gain: { color: "white", fontSize: 25, fontWeight: "900", marginTop: 5 }, summaryDivider: { height: 50, width: 1, backgroundColor: "#FFFFFF2A" }, summaryStats: { gap: 5, alignItems: "flex-end" }, summaryMeta: { color: "white", fontSize: 10, fontWeight: "700" }, actionCard: { gap: 13 }, safetyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, actionTitle: { color: palette.ink, fontSize: 19, fontWeight: "900" }, secureIcon: { width: 31, height: 31, borderRadius: 12, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }, secureIconText: { color: palette.forest, fontWeight: "900", fontSize: 16 }, instructions: { color: palette.muted, fontSize: 12, lineHeight: 18 }, codeInput: { height: 55, borderRadius: 15, backgroundColor: palette.canvas, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 14, color: palette.ink, fontSize: 15, fontWeight: "800", letterSpacing: 2 }, safetyNote: { color: palette.muted, fontSize: 10, lineHeight: 15 }, paymentLabel: { fontSize: 9, color: palette.muted, fontWeight: "900", letterSpacing: 1 }, paymentTotal: { fontSize: 24, fontWeight: "900", color: palette.ink, marginTop: -8 }, paymentPending: { fontSize: 12, lineHeight: 18, color: palette.amber, backgroundColor: palette.amberBg, padding: 12, borderRadius: 12 }, finished: { gap: 12 }, finishedTitle: { fontSize: 19, fontWeight: "900", color: palette.ink }, muted: { color: palette.muted, fontSize: 13, lineHeight: 20 }, title: { fontSize: 24, fontWeight: "900", color: palette.ink, textAlign: "center" }, footer: { textAlign: "center", color: palette.muted, fontSize: 10, lineHeight: 16, paddingHorizontal: 12 } }); }
