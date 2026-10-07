import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { AppButton, SectionTitle, Surface } from "@/components/ui";
import { DriverMap } from "@/components/DriverMap";
import { getDriverProfile } from "@/features/motorista/motoristaService";
import { getDriverStatement, getOffers, type RideOffer } from "@/features/corrida/corridaService";
import { sendHeartbeat, setAvailability, subscribeRideEvents, updateLocation, getSocket } from "@/realtime/socket";
import { getCurrentCoordinates } from "@/location/location";
import { useAuthStore } from "@/store/authStore";
import { startBackgroundLocation, stopBackgroundLocation, setBackgroundRide } from "@/location/backgroundLocation";
import { palette } from "@/theme";

type Offer = RideOffer & { validadeCliente?: number };

function money(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00";
}

function mapLiveOffer(payload: { corrida_id: number; local_embarque: string; local_desembarque: string; valor_motorista: number | string; distancia_km: number | string; tempo_minutos: number | string; forma_pagamento: RideOffer["forma_pagamento"]; categoria: RideOffer["categoria"]; coordenadas?: { origem: { lat: number; lng: number }; destino: { lat: number; lng: number } }; tempo_para_aceitar?: number }): Offer {
  return {
    corrida_id: payload.corrida_id,
    origem: payload.local_embarque,
    destino: payload.local_desembarque,
    origem_lat: payload.coordenadas?.origem.lat ?? 0,
    origem_lng: payload.coordenadas?.origem.lng ?? 0,
    destino_lat: payload.coordenadas?.destino.lat ?? 0,
    destino_lng: payload.coordenadas?.destino.lng ?? 0,
    valor: payload.valor_motorista,
    ganho_motorista: payload.valor_motorista,
    distancia_km: payload.distancia_km,
    tempo_minutos: payload.tempo_minutos,
    categoria: payload.categoria,
    forma_pagamento: payload.forma_pagamento,
    validadeCliente: Date.now() + Math.max(0, Number(payload.tempo_para_aceitar ?? 30)) * 1000,
  };
}

export default function DriverHome() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const setDriver = useAuthStore((state) => state.setDriver);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [connected, setConnected] = useState(false);
  const [internet, setInternet] = useState<boolean | null>(true);
  const [clock, setClock] = useState(Date.now());

  const profile = useQuery({ queryKey: ["driver-profile"], queryFn: getDriverProfile, enabled: Boolean(accessToken) });
  const statement = useQuery({ queryKey: ["driver-statement"], queryFn: () => getDriverStatement(5, 0), enabled: Boolean(accessToken), refetchInterval: 60000 });
  const driver = profile.data;
  const approved = driver?.status_cadastro === "aprovado" && driver?.status_conta === "ativa";
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  }, []);

  useEffect(() => { if (driver) setDriver(driver); }, [driver, setDriver]);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => setInternet(state.isConnected && state.isInternetReachable !== false));
    return unsubscribe;
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!approved) return;
    const socket = getSocket();
    if (!socket) return;
    const refreshOffers = () => { void getOffers().then((items) => { if (items[0]) setOffer((current) => current ?? { ...items[0], validadeCliente: items[0].expira_em ? new Date(items[0].expira_em).getTime() : undefined }); }).catch(() => undefined); };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setConnected(socket.connected);
    const unsubscribeRide = subscribeRideEvents({ nova_oferta_corrida: (payload) => setOffer(mapLiveOffer(payload)) });
    if (socket.connected) refreshOffers(); else socket.once("connect", refreshOffers);
    return () => { unsubscribeRide(); socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); socket.off("connect", refreshOffers); };
  }, [approved]);
  useEffect(() => {
    if (!accessToken) return;
    const timer = setInterval(() => sendHeartbeat(), 25000);
    return () => clearInterval(timer);
  }, [accessToken]);
  useEffect(() => {
    if (!online) return;
    let subscription: Location.LocationSubscription | null = null;
    let mounted = true;
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 12000, distanceInterval: 30 }, (position) => {
      const next = { lat: position.coords.latitude, lng: position.coords.longitude };
      setCoords(next);
      void updateLocation(next.lat, next.lng).catch(() => undefined);
    }).then((next) => { if (mounted) subscription = next; else next.remove(); }).catch(() => undefined);
    return () => { mounted = false; subscription?.remove(); };
  }, [online]);

  const setOnlineStatus = useCallback(async () => {
    if (busy) return;
    if (!approved) return Alert.alert("Cadastro em análise", "Você poderá ficar online assim que o MOVI aprovar seus documentos e liberar a conta.");
    setBusy(true);
    try {
      if (online) {
        await setAvailability(false);
        await stopBackgroundLocation().catch(() => undefined);
        setOnline(false);
        setOffer(null);
      } else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error("Permita o acesso à localização enquanto usa o app para ficar online.");
        const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
        if (!backgroundPermission.granted) throw new Error("Para ficar online com a tela bloqueada, permita a localização 'Sempre' nas configurações do aparelho.");
        const current = await getCurrentCoordinates();
        await updateLocation(current.lat, current.lng);
        await setAvailability(true);
        try { await startBackgroundLocation(); } catch (error) { await setAvailability(false).catch(() => undefined); throw error; }
        setCoords(current);
        setOnline(true);
        const offers = await getOffers();
        if (offers[0]) setOffer({ ...offers[0], validadeCliente: offers[0].expira_em ? new Date(offers[0].expira_em).getTime() : undefined });
      }
    } catch (error) {
      Alert.alert("Disponibilidade", error instanceof Error ? error.message : "Não foi possível alterar sua disponibilidade.");
    } finally { setBusy(false); }
  }, [approved, busy, online]);

  async function respondToOffer(accept: boolean) {
    if (!offer || busy) return;
    if (offer.validadeCliente && offer.validadeCliente <= clock) { setOffer(null); return Alert.alert("Oferta expirada", "Esta corrida não está mais disponível. Aguarde uma nova oferta."); }
    if (!online) return Alert.alert("Você está offline", "Fique online para responder a ofertas.");
    setBusy(true);
    const rideId = offer.corrida_id;
    try {
      if (accept) {
        const { acceptRide } = await import("@/features/corrida/corridaService");
        const result = await acceptRide(rideId);
        setOffer(null);
        await setBackgroundRide(result.corrida.id);
        await setAvailability(false);
        setOnline(false);
        router.push({ pathname: "/(app)/corrida", params: { id: String(result.corrida.id) } });
      } else {
        const { rejectRide } = await import("@/features/corrida/corridaService");
        await rejectRide(rideId);
        setOffer(null);
        const offers = await getOffers();
        if (offers[0]) setOffer({ ...offers[0], validadeCliente: offers[0].expira_em ? new Date(offers[0].expira_em).getTime() : undefined });
      }
    } catch (error) {
      Alert.alert(accept ? "Não foi possível aceitar" : "Não foi possível recusar", error instanceof Error ? error.message : "A oferta pode ter expirado. Atualize e tente novamente.");
      setOffer(null);
      void getOffers().then((offers) => { if (offers[0]) setOffer({ ...offers[0], validadeCliente: offers[0].expira_em ? new Date(offers[0].expira_em).getTime() : undefined }); }).catch(() => undefined);
    } finally { setBusy(false); }
  }

  const recent = statement.data?.historico.slice(0, 3) ?? [];
  const offersLeft = offer?.validadeCliente ? Math.max(0, Math.ceil((offer.validadeCliente - clock) / 1000)) : null;

  useEffect(() => {
    if (!approved) return;
    const activeRide = statement.data?.historico.find((ride) => ride.status === "aceita" || ride.status === "em_andamento");
    if (activeRide) router.replace({ pathname: "/(app)/corrida", params: { id: String(activeRide.id) } });
  }, [approved, statement.data?.historico]);

  return <ScrollView style={styles.flex} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={profile.isRefetching || statement.isRefetching} onRefresh={() => { void profile.refetch(); void statement.refetch(); if (online) void getOffers().then((items) => { if (items[0]) setOffer({ ...items[0] }); }); }} tintColor={palette.forest} />}>
    <View style={styles.header}><View><Text style={styles.greeting}>{greeting},</Text><Text style={styles.name}>{driver?.nome?.split(" ")[0] ?? "motorista"}</Text></View><Pressable onPress={() => router.push("/(app)/conta")} style={styles.avatar}><Text style={styles.avatarText}>{driver?.nome?.charAt(0)?.toUpperCase() ?? "M"}</Text></Pressable></View>
    {profile.isLoading ? <Surface style={styles.loading}><ActivityIndicator color={palette.forest} /><Text style={styles.muted}>Carregando sua área segura…</Text></Surface> : null}
    {profile.isError ? <Surface style={styles.notice}><Text style={styles.noticeTitle}>Não conseguimos carregar seu perfil</Text><Text style={styles.muted}>Verifique sua conexão. Seus dados continuam protegidos.</Text><Pressable onPress={() => void profile.refetch()}><Text style={styles.link}>Tentar novamente</Text></Pressable></Surface> : null}
    {driver && !approved ? <Surface style={styles.pending}><View style={styles.pendingIcon}><MaterialCommunityIcons name="shield-clock-outline" size={23} color={palette.amber} /></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.pendingTitle}>{driver.status_conta !== "ativa" ? "Conta temporariamente indisponível" : driver.status_cadastro === "reprovado" ? "Revise seu cadastro" : "Estamos analisando seu cadastro"}</Text><Text style={styles.pendingCopy}>{driver.status_conta !== "ativa" ? "Fale com o suporte para entender o status da conta." : driver.status_cadastro === "reprovado" ? "Confira os documentos e atualize o que estiver pendente." : "A equipe MOVI está conferindo suas informações e documentos."}</Text></View></Surface> : null}
    <Surface style={[styles.balance, online && styles.balanceOnline]}><View style={styles.balanceTop}><View><Text style={styles.balanceLabel}>GANHOS ACUMULADOS</Text><Text style={styles.balanceValue}>{money(statement.data?.ganhos_acumulados)}</Text></View><View style={[styles.onlineBadge, { backgroundColor: online ? palette.lime : "#E8EEEA" }]}><View style={[styles.dot, { backgroundColor: online ? palette.forest : palette.muted }]} /><Text style={[styles.onlineText, online && { color: palette.forestDark }]}>{online ? "ONLINE" : "OFFLINE"}</Text></View></View><View style={styles.balanceDivider} /><View style={styles.metrics}><View><Text style={styles.metricValue}>{statement.data?.corridas_concluidas ?? 0}</Text><Text style={styles.metricLabel}>corridas concluídas</Text></View><View style={styles.metricSeparator} /><View><Text style={styles.metricValue}>{driver?.nota_media ? Number(driver.nota_media).toFixed(1) : "—"}<Text style={styles.star}> ★</Text></Text><Text style={styles.metricLabel}>avaliação média</Text></View><View style={styles.metricSeparator} /><View><Text style={styles.metricValue}>{money(statement.data?.saldo_total)}</Text><Text style={styles.metricLabel}>saldo atual</Text></View></View></Surface>
    <AppButton title={online ? "Ficar offline" : "Ficar online"} loading={busy} disabled={!approved || internet === false} onPress={() => void setOnlineStatus()} />
    <View style={styles.connection}><View style={[styles.connectionDot, { backgroundColor: internet === false ? palette.red : connected ? palette.forest : palette.amber }]} /><Text style={styles.connectionText}>{internet === false ? "Sem internet" : connected ? "Conectado ao MOVI" : "Conectando ao MOVI…"}</Text><Text style={styles.connectionHint}>•  {driver?.categoria === "carro" ? "Carro" : "Moto"}</Text></View>
    <DriverMap coordinate={coords} height={210} label={online ? "Você está visível para receber corridas" : "Sua localização só é usada quando você fica online"} />
    {offer && online ? <Surface style={styles.offerCard}><View style={styles.offerTop}><View><Text style={styles.offerEyebrow}>NOVA OPORTUNIDADE</Text><Text style={styles.offerPrice}>{money(offer.ganho_motorista)}</Text></View><View style={styles.timerPill}><MaterialCommunityIcons name="timer-outline" size={15} color={offersLeft === 0 ? palette.red : palette.amber} /><Text style={styles.timerText}>{offersLeft != null ? `${offersLeft}s` : "AGORA"}</Text></View></View><View style={styles.tripStats}><Text style={styles.tripStat}><MaterialCommunityIcons name="map-marker-distance" size={15} color={palette.forest} />  {Number(offer.distancia_km).toFixed(1)} km</Text><Text style={styles.tripStat}><MaterialCommunityIcons name="clock-outline" size={15} color={palette.forest} />  {Math.round(Number(offer.tempo_minutos))} min</Text><Text style={styles.tripStat}>{offer.categoria === "moto" ? "Moto" : "Carro"} · {offer.forma_pagamento === "dinheiro" ? "Dinheiro" : offer.forma_pagamento.toUpperCase()}</Text></View><View style={styles.route}><View style={styles.routeRail}><View style={styles.pickupDot} /><View style={styles.routeDash} /><View style={styles.destinationDot} /></View><View style={styles.routeText}><Text style={styles.routeAddress} numberOfLines={2}>{offer.origem}</Text><Text style={styles.routeAddress} numberOfLines={2}>{offer.destino}</Text></View></View><View style={styles.offerActions}><Pressable disabled={busy} onPress={() => void respondToOffer(false)} style={styles.reject}><Text style={styles.rejectText}>Recusar</Text></Pressable><Pressable disabled={busy || offersLeft === 0} onPress={() => void respondToOffer(true)} style={[styles.accept, (busy || offersLeft === 0) && { opacity: 0.55 }]}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.acceptText}>Aceitar corrida</Text>}</Pressable></View><Text style={styles.disclaimer}>O valor exibido é o ganho informado pelo MOVI V3. Confirme o embarque com o código do passageiro.</Text></Surface> : null}
    {offer && !online ? <Surface style={styles.notice}><Text style={styles.noticeTitle}>Uma oferta está aguardando</Text><Text style={styles.muted}>Fique online para responder enquanto ela ainda estiver disponível.</Text></Surface> : null}
    <SectionTitle title="Atividade recente" action={<Pressable onPress={() => router.push("/(app)/historico")}><Text style={styles.link}>Ver todas</Text></Pressable>} />
    {recent.length ? recent.map((ride) => <Surface key={ride.id} style={styles.recent}><View style={styles.recentIcon}><MaterialCommunityIcons name="map-marker-path" size={19} color={palette.forest} /></View><View style={styles.recentInfo}><Text numberOfLines={1} style={styles.recentDestination}>{ride.destino}</Text><Text style={styles.recentMeta}>{ride.status === "concluida" ? "Concluída" : ride.status === "cancelada" ? "Cancelada" : "Em andamento"} · {ride.forma_pagamento}</Text></View><Text style={styles.recentGain}>{money(ride.ganho_motorista)}</Text></Surface>) : <Surface style={styles.empty}><Text style={styles.emptyTitle}>Sua próxima corrida começa aqui</Text><Text style={styles.muted}>Fique online para receber oportunidades na sua região.</Text></Surface>}
    <Text style={styles.footer}>Sua segurança vem primeiro. Se precisar, fale com o suporte MOVI pela área Conta.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.canvas }, content: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 32, gap: 15 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 2 }, greeting: { color: palette.muted, fontSize: 13, fontWeight: "700" }, name: { color: palette.ink, fontSize: 27, fontWeight: "900", letterSpacing: -0.5 }, avatar: { height: 44, width: 44, borderRadius: 16, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }, avatarText: { color: palette.forestDark, fontSize: 18, fontWeight: "900" }, balance: { backgroundColor: palette.ink, borderRadius: 24, padding: 20, gap: 17, borderColor: palette.ink }, balanceOnline: { backgroundColor: palette.forestDark, borderColor: palette.forestDark }, balanceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, balanceLabel: { color: "#C5D7CE", fontSize: 10, fontWeight: "900", letterSpacing: 1.3 }, balanceValue: { color: "white", fontWeight: "900", fontSize: 30, marginTop: 5 }, onlineBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 99 }, dot: { width: 7, height: 7, borderRadius: 4 }, onlineText: { color: palette.inkSoft, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, balanceDivider: { height: 1, backgroundColor: "#FFFFFF2A" }, metrics: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, metricValue: { color: "white", fontWeight: "900", fontSize: 15 }, metricLabel: { color: "#C5D7CE", fontSize: 9, marginTop: 3 }, metricSeparator: { height: 26, width: 1, backgroundColor: "#FFFFFF2A" }, star: { color: palette.lime }, connection: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, connectionDot: { width: 7, height: 7, borderRadius: 4 }, connectionText: { fontSize: 11, color: palette.muted, fontWeight: "700" }, connectionHint: { fontSize: 11, color: palette.muted }, offerCard: { borderColor: palette.forest, borderWidth: 1.5, gap: 15, shadowColor: palette.shadow, shadowOpacity: 0.09, shadowRadius: 16, elevation: 3 }, offerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, offerEyebrow: { fontSize: 10, color: palette.forest, fontWeight: "900", letterSpacing: 1.1 }, offerPrice: { color: palette.ink, fontWeight: "900", fontSize: 29, marginTop: 3 }, timerPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 99, backgroundColor: palette.amberBg, paddingHorizontal: 10, paddingVertical: 7 }, timerText: { color: palette.amber, fontWeight: "900", fontSize: 11 }, tripStats: { flexDirection: "row", flexWrap: "wrap", gap: 13, paddingVertical: 11, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line }, tripStat: { fontSize: 11, fontWeight: "800", color: palette.inkSoft }, route: { flexDirection: "row", gap: 12 }, routeRail: { alignItems: "center", justifyContent: "center", width: 15 }, pickupDot: { height: 9, width: 9, borderRadius: 5, backgroundColor: palette.forest }, routeDash: { height: 24, borderLeftWidth: 1, borderStyle: "dashed", borderColor: palette.muted }, destinationDot: { height: 9, width: 9, borderWidth: 2, borderColor: palette.ink, borderRadius: 2 }, routeText: { flex: 1, justifyContent: "space-between", gap: 15 }, routeAddress: { color: palette.ink, fontSize: 13, fontWeight: "700", lineHeight: 18 }, offerActions: { flexDirection: "row", gap: 10 }, reject: { height: 52, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: palette.canvas }, rejectText: { color: palette.inkSoft, fontWeight: "800" }, accept: { height: 52, flex: 1.4, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: palette.forest }, acceptText: { color: "white", fontWeight: "900" }, disclaimer: { color: palette.muted, fontSize: 10, lineHeight: 15 }, pending: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: palette.amberBg, borderColor: "#F2D897" }, pendingIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#FFE8B4", alignItems: "center", justifyContent: "center" }, pendingTitle: { color: palette.ink, fontWeight: "900", fontSize: 13 }, pendingCopy: { color: palette.amber, fontSize: 11, lineHeight: 16 }, notice: { gap: 8 }, noticeTitle: { color: palette.ink, fontWeight: "900", fontSize: 15 }, loading: { flexDirection: "row", alignItems: "center", gap: 10 }, muted: { color: palette.muted, fontSize: 12, lineHeight: 18 }, link: { color: palette.forest, fontSize: 12, fontWeight: "900" }, recent: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13 }, recentIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }, recentInfo: { flex: 1, gap: 4 }, recentDestination: { fontSize: 12, color: palette.ink, fontWeight: "800" }, recentMeta: { fontSize: 10, color: palette.muted }, recentGain: { fontSize: 12, color: palette.ink, fontWeight: "900" }, empty: { gap: 6 }, emptyTitle: { fontSize: 13, color: palette.ink, fontWeight: "900" }, footer: { textAlign: "center", color: palette.muted, fontSize: 10, lineHeight: 15, paddingHorizontal: 10 },
});
