import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, AppState, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Surface } from "@/components/ui";
import { DriverAvailabilityControl } from "@/components/DriverAvailabilityControl";
import { DriverMap } from "@/components/DriverMap";
import { getDriverProfile } from "@/features/motorista/motoristaService";
import { getActiveRide, getDriverStatement, getOffers, type RideOffer } from "@/features/corrida/corridaService";
import { sendHeartbeat, setAvailability, subscribeRideEvents, updateLocation, getSocket } from "@/realtime/socket";
import { getCurrentCoordinates } from "@/location/location";
import { useAuthStore } from "@/store/authStore";
import { startBackgroundLocation, stopBackgroundLocation, setBackgroundRide } from "@/location/backgroundLocation";
import type { DriverPalette } from "@/theme";
import { useMoviTheme, useThemeStyles } from "@/theme/ThemeProvider";
import { useDriverAvailabilityStore } from "@/store/availabilityStore";

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
  const navigation = useNavigation();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors: palette } = useMoviTheme();
  const styles = useThemeStyles(createStyles);
  const accessToken = useAuthStore((state) => state.accessToken);
  const cachedDriver = useAuthStore((state) => state.motorista);
  const setDriver = useAuthStore((state) => state.setDriver);
  const [online, setOnline] = useState(false);
  const setDriverOnline = useDriverAvailabilityStore((state) => state.setOnline);
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [connected, setConnected] = useState(false);
  const [internet, setInternet] = useState<boolean | null>(true);
  const [clock, setClock] = useState(Date.now());

  const profile = useQuery({ queryKey: ["driver-profile"], queryFn: getDriverProfile, enabled: Boolean(accessToken) });
  const statement = useQuery({ queryKey: ["driver-statement"], queryFn: () => getDriverStatement(5, 0), enabled: Boolean(accessToken), refetchInterval: 60000 });
  const activeRide = useQuery({ queryKey: ["driver-active-ride"], queryFn: getActiveRide, enabled: Boolean(accessToken), refetchInterval: online ? 15000 : false });
  const driver = profile.data ?? cachedDriver;
  const approved = driver?.status_cadastro === "aprovado" && driver?.status_conta === "ativa";
  const cashBlocked = Number(statement.data?.saldo_total ?? 0) <= -10;
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
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void profile.refetch();
        void activeRide.refetch();
        void statement.refetch();
      }
    });
    return () => subscription.remove();
  }, [activeRide.refetch, profile.refetch, statement.refetch]);
  useEffect(() => {
    if (!offer?.validadeCliente) return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [offer?.validadeCliente]);
  useEffect(() => {
    if (!approved) return;
    const socket = getSocket();
    if (!socket) return;
    const refreshOffers = () => { void getOffers().then((items) => { const active = items[0]; setOffer(active ? { ...active, validadeCliente: active.expira_em ? new Date(active.expira_em).getTime() : Date.now() + 30000 } : null); }).catch(() => undefined); };
    const onConnect = () => { setConnected(true); refreshOffers(); };
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setConnected(socket.connected);
    const unsubscribeRide = subscribeRideEvents({ nova_oferta_corrida: (payload) => setOffer(mapLiveOffer(payload)) });
    if (socket.connected) refreshOffers();
    return () => { unsubscribeRide(); socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); };
  }, [approved]);
  useEffect(() => {
    if (!approved || !online) return;
    let active = true;
    const refreshOffers = async () => {
      try {
        const items = await getOffers();
        if (!active) return;
        const current = items[0];
        setOffer(current ? { ...current, validadeCliente: current.expira_em ? new Date(current.expira_em).getTime() : Date.now() + 30000 } : null);
      } catch {
        // Realtime remains the primary delivery path; a transient polling error
        // should not clear an offer that may still be accepted.
      }
    };
    if (!connected) void refreshOffers();
    const timer = setInterval(() => void refreshOffers(), connected ? 30000 : 5000);
    return () => { active = false; clearInterval(timer); };
  }, [approved, online, connected]);
  useEffect(() => {
    if (!accessToken) return;
    const timer = setInterval(() => sendHeartbeat(), 25000);
    return () => clearInterval(timer);
  }, [accessToken]);
  useEffect(() => { setDriverOnline(online); }, [online, setDriverOnline]);
  useEffect(() => () => setDriverOnline(false), [setDriverOnline]);
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

  const offersLeft = offer?.validadeCliente ? Math.max(0, Math.ceil((offer.validadeCliente - clock) / 1000)) : null;
  const homeMapHeight = online
    ? Math.max(460, Math.round(windowHeight - insets.top - insets.bottom - 150))
    : Math.max(460, Math.min(580, Math.round(windowHeight * 0.62)));

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border, height: 64, paddingTop: 7, paddingBottom: 7, display: offer && online ? "none" : "flex" } });
  }, [navigation, offer, online, palette.border, palette.surface]);

  useEffect(() => {
    const ride = activeRide.data;
    if (approved && ride && (ride.status === "aceita" || ride.status === "em_andamento")) {
      void setBackgroundRide(ride.id);
      router.replace({ pathname: "/(app)/corrida", params: { id: String(ride.id) } });
    }
  }, [activeRide.data, approved]);

  if (offer && online) {
    const origin = Number.isFinite(Number(offer.origem_lat)) && Number.isFinite(Number(offer.origem_lng)) && Number(offer.origem_lat) !== 0 && Number(offer.origem_lng) !== 0
      ? { lat: Number(offer.origem_lat), lng: Number(offer.origem_lng) }
      : coords;
    return <View style={styles.offerPage}>
      <View style={styles.offerHeader}>
        <MaterialCommunityIcons name="chevron-left" size={23} color={palette.text} />
        <Text style={styles.offerPageTitle}>Nova corrida</Text>
        <View style={styles.offerHeaderSpacer} />
        <View style={styles.timerPill}><MaterialCommunityIcons name="timer-outline" size={15} color={offersLeft === 0 ? palette.red : palette.amber} /><Text style={styles.timerText}>{offersLeft != null ? `${offersLeft}s` : "AGORA"}</Text></View>
      </View>
      <View style={styles.offerMap}><DriverMap coordinate={origin} recenterCoordinate={coords} height={300} label="Local de embarque" /></View>
      <Surface style={styles.offerDetail}>
        <View style={styles.offerAddressRow}>
          <View style={styles.offerMarkerColumn}><MaterialCommunityIcons name="crosshairs-gps" size={17} color={palette.forest} /><View style={styles.offerRouteDash} /><MaterialCommunityIcons name="map-marker" size={18} color={palette.cyan} /></View>
          <View style={styles.offerAddressCopy}>
            <Text style={styles.offerAddress} numberOfLines={2}>{offer.origem}</Text>
            <Text style={styles.offerAddressSecondary} numberOfLines={2}>{offer.destino}</Text>
          </View>
        </View>
        <View style={styles.offerSummary}>
          <View style={styles.offerMetric}><MaterialCommunityIcons name="map-marker-distance" size={16} color={palette.forest} /><Text style={styles.offerMetricText}>{Number(offer.distancia_km).toFixed(1)} km</Text></View>
          <View style={styles.offerMetric}><MaterialCommunityIcons name="clock-outline" size={16} color={palette.forest} /><Text style={styles.offerMetricText}>{Math.round(Number(offer.tempo_minutos))} min</Text></View>
          <View style={styles.offerPayout}><Text style={styles.offerPayoutLabel}>Repasse</Text><Text style={styles.offerPayoutValue}>{money(offer.ganho_motorista)}</Text></View>
        </View>
        <Text style={styles.offerCategory}>{offer.categoria === "moto" ? "Moto" : "Carro"} · {offer.forma_pagamento === "dinheiro" ? "Dinheiro" : offer.forma_pagamento.toUpperCase()}</Text>
        <Pressable accessibilityRole="button" disabled={busy || offersLeft === 0} onPress={() => void respondToOffer(true)} style={[styles.offerAccept, (busy || offersLeft === 0) && styles.offerDisabled]}>{busy ? <ActivityIndicator color={palette.bg} /> : <Text style={styles.offerAcceptText}>Aceitar</Text>}</Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void respondToOffer(false)} style={styles.offerDecline}><Text style={styles.offerDeclineText}>{busy ? "Aguarde…" : "Recusar"}</Text></Pressable>
        <Text style={styles.disclaimer}>Repasse e detalhes informados pelo MOVI V3.</Text>
      </Surface>
    </View>;
  }

  if (online) {
    return <View style={styles.onlinePage}>
      <DriverMap coordinate={coords} height={homeMapHeight} label="Você está visível para receber corridas" fullScreen />
      <View pointerEvents="box-none" style={[styles.onlineEarningsPosition, { top: Math.max(8, insets.top + 2) }]}>
        <Surface accessibilityLabel={`Ganhos nas últimas 24 horas: ${money(statement.data?.ganhos_ultimas_24h)}`} style={styles.onlineEarnings}>
          <Text style={styles.onlineEarningsLabel}>GANHOS NAS ÚLTIMAS 24H</Text>
          <Text style={styles.onlineEarningsValue}>{money(statement.data?.ganhos_ultimas_24h)}</Text>
        </Surface>
      </View>
      {cashBlocked ? <Surface style={[styles.onlineCashNotice, { top: Math.max(78, insets.top + 72) }]}><MaterialCommunityIcons name="cash-lock" size={17} color={palette.amber} /><Text style={styles.onlineCashText}>Corridas em dinheiro pausadas</Text></Surface> : null}
      <View style={[styles.connectBar, { paddingBottom: Math.max(10, insets.bottom) }]}><Pressable accessibilityRole="button" accessibilityLabel="Ficar offline" disabled={busy} onPress={() => void setOnlineStatus()} style={[styles.connectButton, styles.disconnectButton, busy && styles.connectDisabled]}>{busy ? <ActivityIndicator color={palette.text} /> : <><MaterialCommunityIcons name="power-standby" size={19} color={palette.text} /><Text style={[styles.connectText, styles.disconnectText]}>Ficar offline</Text></>}</Pressable></View>
    </View>;
  }

  return <>
  <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: Math.max(15, insets.top + 8) }]} refreshControl={<RefreshControl refreshing={profile.isRefetching || statement.isRefetching || activeRide.isRefetching} onRefresh={() => { void profile.refetch(); void statement.refetch(); void activeRide.refetch(); if (online) void getOffers().then((items) => { if (items[0]) setOffer({ ...items[0] }); }); }} tintColor={palette.forest} />}>
    {!online ? <View style={styles.header}><View style={styles.headerStart}><Text style={styles.greeting}>{greeting},</Text><Text style={styles.name}>{driver?.nome?.split(" ")[0] ?? "motorista"}</Text></View><View style={styles.brand}><Image source={require("../../assets/movi-logo-oficial.png")} style={styles.brandMark} resizeMode="contain" /><Text style={styles.brandWord}>MOVI</Text></View></View> : null}
    {profile.isLoading ? <Surface style={styles.loading}><ActivityIndicator color={palette.forest} /><Text style={styles.muted}>Carregando sua área segura…</Text></Surface> : null}
    {profile.isError ? <Surface style={styles.notice}><Text style={styles.noticeTitle}>Não conseguimos carregar seu perfil</Text><Text style={styles.muted}>Verifique sua conexão. Seus dados continuam protegidos.</Text><Pressable onPress={() => void profile.refetch()}><Text style={styles.link}>Tentar novamente</Text></Pressable></Surface> : null}
    {driver && !approved ? <Surface style={styles.pending}><View style={styles.pendingIcon}><MaterialCommunityIcons name="shield-lock-outline" size={23} color={palette.amber} /></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.pendingTitle}>{driver.status_conta !== "ativa" ? "Conta temporariamente indisponível" : driver.status_cadastro === "reprovado" ? "Revise seu cadastro" : "Estamos analisando seu cadastro"}</Text><Text style={styles.pendingCopy}>{driver.status_conta !== "ativa" ? "Fale com o suporte para entender o status da conta." : driver.status_cadastro === "reprovado" ? "Confira os documentos e atualize o que estiver pendente." : "A equipe MOVI está conferindo suas informações e documentos."}</Text></View></Surface> : null}
    {!online ? <View style={styles.availabilityRow}>
      <DriverAvailabilityControl online={online} disabled={!approved || busy || internet === false} onGoOnline={() => void setOnlineStatus()} onGoOffline={() => void setOnlineStatus()} />
      <View style={styles.connection}><View style={[styles.connectionDot, { backgroundColor: internet === false ? palette.red : connected ? palette.forest : palette.amber }]} /><Text style={styles.connectionText}>{internet === false ? "Sem internet" : connected ? "Conectado ao MOVI" : "Conectando…"}</Text></View>
    </View> : null}
    {cashBlocked ? <Surface style={styles.pending}><View style={styles.pendingIcon}><MaterialCommunityIcons name="cash-lock" size={23} color={palette.amber} /></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.pendingTitle}>Corridas em dinheiro pausadas</Text><Text style={styles.pendingCopy}>Seu saldo da carteira atingiu -R$ 10,00. Você poderá receber corridas pagas pelo app até regularizar esse saldo.</Text></View></Surface> : null}
    <DriverMap coordinate={coords} height={homeMapHeight} label={online ? "Você está visível para receber corridas" : "Sua localização só é usada quando você fica online"} />
    {offer && online ? <Surface style={styles.offerCard}><View style={styles.offerTop}><View><Text style={styles.offerEyebrow}>NOVA OPORTUNIDADE</Text><Text style={styles.offerPrice}>{money(offer.ganho_motorista)}</Text></View><View style={styles.timerPill}><MaterialCommunityIcons name="timer-outline" size={15} color={offersLeft === 0 ? palette.red : palette.amber} /><Text style={styles.timerText}>{offersLeft != null ? `${offersLeft}s` : "AGORA"}</Text></View></View><View style={styles.tripStats}><Text style={styles.tripStat}><MaterialCommunityIcons name="map-marker-distance" size={15} color={palette.forest} />  {Number(offer.distancia_km).toFixed(1)} km</Text><Text style={styles.tripStat}><MaterialCommunityIcons name="clock-outline" size={15} color={palette.forest} />  {Math.round(Number(offer.tempo_minutos))} min</Text><Text style={styles.tripStat}>{offer.categoria === "moto" ? "Moto" : "Carro"} · {offer.forma_pagamento === "dinheiro" ? "Dinheiro" : offer.forma_pagamento.toUpperCase()}</Text></View><View style={styles.route}><View style={styles.routeRail}><View style={styles.pickupDot} /><View style={styles.routeDash} /><View style={styles.destinationDot} /></View><View style={styles.routeText}><Text style={styles.routeAddress} numberOfLines={2}>{offer.origem}</Text><Text style={styles.routeAddress} numberOfLines={2}>{offer.destino}</Text></View></View><View style={styles.offerActions}><Pressable disabled={busy} onPress={() => void respondToOffer(false)} style={styles.reject}><Text style={styles.rejectText}>Recusar</Text></Pressable><Pressable disabled={busy || offersLeft === 0} onPress={() => void respondToOffer(true)} style={[styles.accept, (busy || offersLeft === 0) && { opacity: 0.55 }]}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.acceptText}>Aceitar corrida</Text>}</Pressable></View><Text style={styles.disclaimer}>O valor exibido é o ganho informado pelo MOVI V3. Confirme o embarque com o código do passageiro.</Text></Surface> : null}
    {offer && !online ? <Surface style={styles.notice}><Text style={styles.noticeTitle}>Uma oferta está aguardando</Text><Text style={styles.muted}>Fique online para responder enquanto ela ainda estiver disponível.</Text></Surface> : null}
    {!online ? <Text style={styles.footer}>Sua segurança vem primeiro. Se precisar, fale com o suporte MOVI pela área Conta.</Text> : null}
  </ScrollView>
  <View style={styles.connectBar}><Pressable accessibilityRole="button" accessibilityLabel={online ? "Ficar offline" : "Conectar para receber corridas"} accessibilityState={{ disabled: !approved || busy || internet === false }} disabled={!approved || busy || internet === false} onPress={() => void setOnlineStatus()} style={({ pressed }) => [styles.connectButton, online && styles.disconnectButton, (!approved || busy || internet === false) && styles.connectDisabled, pressed && styles.connectPressed]}>{busy ? <ActivityIndicator color={online ? palette.text : palette.bg} /> : <><MaterialCommunityIcons name={online ? "power-standby" : "radio-tower"} size={19} color={online ? palette.text : palette.bg} /><Text style={[styles.connectText, online && styles.disconnectText]}>{online ? "Ficar offline" : "Conectar"}</Text></>}</Pressable></View>
  </>;
}

function createStyles(palette: DriverPalette) { return StyleSheet.create({
  onlinePage: { flex: 1, backgroundColor: palette.canvas, justifyContent: "flex-end" }, onlineEarningsPosition: { position: "absolute", left: 0, right: 0, alignItems: "center" }, onlineEarnings: { minWidth: 150, alignItems: "center", gap: 3, paddingHorizontal: 17, paddingVertical: 8, borderRadius: 15, borderColor: palette.border, backgroundColor: palette.surface }, onlineEarningsLabel: { color: palette.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 }, onlineEarningsValue: { color: palette.primary, fontSize: 19, fontWeight: "900" }, onlineCashNotice: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, padding: 10, borderRadius: 13, backgroundColor: palette.amberBg }, onlineCashText: { color: palette.amber, fontSize: 11, fontWeight: "800" },
  offerPage: { flex: 1, backgroundColor: palette.canvas, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 12 }, offerHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5 }, offerPageTitle: { color: palette.ink, fontSize: 15, fontWeight: "800" }, offerHeaderSpacer: { flex: 1 }, offerMap: { borderRadius: 22, overflow: "hidden" }, offerDetail: { marginTop: -27, borderRadius: 22, padding: 15, gap: 11, borderColor: palette.line, elevation: 8 }, offerAddressRow: { flexDirection: "row", alignItems: "stretch", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderColor: palette.line }, offerMarkerColumn: { alignItems: "center", justifyContent: "space-between", paddingVertical: 2 }, offerRouteDash: { flex: 1, borderLeftWidth: 1, borderStyle: "dashed", borderColor: palette.muted, marginVertical: 4 }, offerAddressCopy: { flex: 1, justifyContent: "space-between", gap: 10 }, offerAddress: { color: palette.ink, fontSize: 12, fontWeight: "800" }, offerAddressSecondary: { color: palette.inkSoft, fontSize: 11 }, offerSummary: { flexDirection: "row", alignItems: "center", gap: 12 }, offerMetric: { flexDirection: "row", alignItems: "center", gap: 5 }, offerMetricText: { color: palette.inkSoft, fontSize: 10, fontWeight: "700" }, offerPayout: { marginLeft: "auto", alignItems: "flex-end", gap: 2 }, offerPayoutLabel: { color: palette.muted, fontSize: 9 }, offerPayoutValue: { color: palette.ink, fontSize: 16, fontWeight: "900" }, offerCategory: { color: palette.muted, fontSize: 10, marginTop: -5 }, offerAccept: { minHeight: 46, borderRadius: 14, backgroundColor: palette.forest, alignItems: "center", justifyContent: "center" }, offerAcceptText: { color: palette.bg, fontSize: 13, fontWeight: "900" }, offerDecline: { minHeight: 30, alignItems: "center", justifyContent: "center", marginTop: -8 }, offerDeclineText: { color: palette.forest, fontSize: 11, fontWeight: "800" }, offerDisabled: { opacity: 0.55 },
  availabilityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  flex: { flex: 1, backgroundColor: palette.canvas }, content: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 18, gap: 15 }, connectBar: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10, backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.border }, connectButton: { minHeight: 52, borderRadius: 16, backgroundColor: palette.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, connectText: { color: palette.bg, fontSize: 15, fontWeight: "900" }, disconnectButton: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }, disconnectText: { color: palette.text }, connectDisabled: { opacity: 0.55 }, connectPressed: { opacity: 0.82 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 2 }, headerStart: { flexDirection: "column", alignItems: "flex-start", gap: 0 }, menuButton: { height: 48, width: 48, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, alignItems: "center", justifyContent: "center" }, brand: { alignItems: "center", flexDirection: "row", gap: 5 }, brandMark: { width: 28, height: 28 }, brandWord: { color: palette.ink, fontSize: 15, fontWeight: "900", letterSpacing: 1.2 }, greeting: { color: palette.muted, fontSize: 11, fontWeight: "700" }, name: { color: palette.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.5 }, avatar: { height: 40, width: 40, borderRadius: 16, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }, avatarText: { color: palette.forest, fontSize: 18, fontWeight: "900" }, balance: { backgroundColor: palette.ink, borderRadius: 24, padding: 20, gap: 17, borderColor: palette.ink }, balanceOnline: { backgroundColor: palette.forestDark, borderColor: palette.forestDark }, balanceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, balanceLabel: { color: "#C5D7CE", fontSize: 10, fontWeight: "900", letterSpacing: 1.3 }, balanceValue: { color: "white", fontWeight: "900", fontSize: 30, marginTop: 5 }, onlineBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 99 }, dot: { width: 7, height: 7, borderRadius: 4 }, onlineText: { color: palette.inkSoft, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, balanceDivider: { height: 1, backgroundColor: "#FFFFFF2A" }, metrics: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, metricValue: { color: "white", fontWeight: "900", fontSize: 15 }, metricLabel: { color: "#C5D7CE", fontSize: 9, marginTop: 3 }, metricSeparator: { height: 26, width: 1, backgroundColor: "#FFFFFF2A" }, star: { color: palette.lime }, connection: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, connectionDot: { width: 7, height: 7, borderRadius: 4 }, connectionText: { fontSize: 11, color: palette.muted, fontWeight: "700" }, connectionHint: { fontSize: 11, color: palette.muted }, offerCard: { borderColor: palette.forest, borderWidth: 1.5, gap: 15, shadowColor: palette.shadow, shadowOpacity: 0.09, shadowRadius: 16, elevation: 3 }, offerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, offerEyebrow: { fontSize: 10, color: palette.forest, fontWeight: "900", letterSpacing: 1.1 }, offerPrice: { color: palette.ink, fontWeight: "900", fontSize: 29, marginTop: 3 }, timerPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 99, backgroundColor: palette.amberBg, paddingHorizontal: 10, paddingVertical: 7 }, timerText: { color: palette.amber, fontWeight: "900", fontSize: 11 }, tripStats: { flexDirection: "row", flexWrap: "wrap", gap: 13, paddingVertical: 11, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line }, tripStat: { fontSize: 11, fontWeight: "800", color: palette.inkSoft }, route: { flexDirection: "row", gap: 12 }, routeRail: { alignItems: "center", justifyContent: "center", width: 15 }, pickupDot: { height: 9, width: 9, borderRadius: 5, backgroundColor: palette.forest }, routeDash: { height: 24, borderLeftWidth: 1, borderStyle: "dashed", borderColor: palette.muted }, destinationDot: { height: 9, width: 9, borderWidth: 2, borderColor: palette.ink, borderRadius: 2 }, routeText: { flex: 1, justifyContent: "space-between", gap: 15 }, routeAddress: { color: palette.ink, fontSize: 13, fontWeight: "700", lineHeight: 18 }, offerActions: { flexDirection: "row", gap: 10 }, reject: { height: 52, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: palette.canvas }, rejectText: { color: palette.inkSoft, fontWeight: "800" }, accept: { height: 52, flex: 1.4, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: palette.forest }, acceptText: { color: "#04120F", fontWeight: "900" }, disclaimer: { color: palette.muted, fontSize: 10, lineHeight: 15 }, pending: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: palette.amberBg, borderColor: "#F2D897" }, pendingIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#FFE8B4", alignItems: "center", justifyContent: "center" }, pendingTitle: { color: palette.ink, fontWeight: "900", fontSize: 13 }, pendingCopy: { color: palette.amber, fontSize: 11, lineHeight: 16 }, notice: { gap: 8 }, noticeTitle: { color: palette.ink, fontWeight: "900", fontSize: 15 }, loading: { flexDirection: "row", alignItems: "center", gap: 10 }, muted: { color: palette.muted, fontSize: 12, lineHeight: 18 }, link: { color: palette.forest, fontSize: 12, fontWeight: "900" }, footer: { textAlign: "center", color: palette.muted, fontSize: 10, lineHeight: 15, paddingHorizontal: 10 },
}); }
