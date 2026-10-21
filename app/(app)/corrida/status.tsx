import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { MapViewCard } from '@/components/MapViewCard';
import { Screen } from '@/components/Screen';
import { getRide, cancelRide, createRideShare, revokeRideShare } from '@/features/corrida/corridaService';
import { canCancelRide, isTerminalRide, rideRefetchInterval, rideStatusCopy } from '@/features/corrida/rideState';
import { subscribeRideEvents } from '@/realtime/socket';
import { queryClient } from '@/providers';
import { brl, km, minutes } from '@/utils/format';
import type { Coordinates } from '@/types/api';
import { useMoviTheme, useThemeStyles } from '@/theme/ThemeProvider';

const RideTrackingMap = React.memo(function RideTrackingMap({ rideId, originLatitude, originLongitude, destinationLatitude, destinationLongitude, initialDriverLocation, height }: {
  rideId: number;
  originLatitude: number | string;
  originLongitude: number | string;
  destinationLatitude: number | string;
  destinationLongitude: number | string;
  initialDriverLocation?: Coordinates | null;
  height: number;
}) {
  const [driverLocation, setDriverLocation] = useState<Coordinates | null>(initialDriverLocation ?? null);
  const lastMapUpdateAt = useRef(0);
  const origin = useMemo(() => ({ lat: Number(originLatitude), lng: Number(originLongitude) }), [originLatitude, originLongitude]);
  const destination = useMemo(() => ({ lat: Number(destinationLatitude), lng: Number(destinationLongitude) }), [destinationLatitude, destinationLongitude]);
  const initialDriverLat = initialDriverLocation?.lat;
  const initialDriverLng = initialDriverLocation?.lng;

  useEffect(() => {
    if (typeof initialDriverLat !== 'number' || typeof initialDriverLng !== 'number' || !Number.isFinite(initialDriverLat) || !Number.isFinite(initialDriverLng)) return;
    const frame = requestAnimationFrame(() => setDriverLocation({ lat: initialDriverLat, lng: initialDriverLng }));
    return () => cancelAnimationFrame(frame);
  }, [initialDriverLat, initialDriverLng]);

  useEffect(() => subscribeRideEvents({
    motorista_em_movimento: (event) => {
      if (event.corrida_id !== rideId || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return;
      const now = Date.now();
      if (now - lastMapUpdateAt.current < 1500) return;
      lastMapUpdateAt.current = now;
      setDriverLocation({ lat: event.lat, lng: event.lng });
    },
  }), [rideId]);

  return <MapViewCard center={driverLocation ?? origin} origin={origin} destination={destination} driver={driverLocation} height={height} />;
});

export default function RideStatusScreen() {
  const theme = useMoviTheme().colors;
  const styles = useThemeStyles(createStyles);
  const { height: viewportHeight } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const rideId = Number(id);
  const [driverMovingRideId, setDriverMovingRideId] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [clockNow, setClockNow] = useState(0);
  const arrivalAlertedAt = useRef<string | null>(null);
  const query = useQuery({ queryKey: ['ride-active', rideId], queryFn: () => getRide(rideId), enabled: Number.isInteger(rideId) && rideId > 0, refetchInterval: (q) => rideRefetchInterval(q.state.data?.status) });
  const ride = query.data;
  const mapHeight = Math.max(310, Math.min(460, Math.round(viewportHeight * 0.48)));

  useEffect(() => subscribeRideEvents({
    corrida_solicitada: (event) => { if (event.corrida_id === rideId) void queryClient.invalidateQueries({ queryKey: ['ride-active', rideId] }); },
    corrida_aceita: (event) => { if (event.id === rideId) queryClient.setQueryData(['ride-active', rideId], event); },
    motorista_chegou: (event) => {
      if (event.id !== rideId) return;
      queryClient.setQueryData(['ride-active', rideId], event);
      const arrivedAt = event.motorista_chegou_em ?? null;
      if (arrivedAt && arrivalAlertedAt.current !== arrivedAt) {
        arrivalAlertedAt.current = arrivedAt;
        Alert.alert('Seu motorista chegou', 'Ele está aguardando no local de embarque. A contagem de espera de 3 minutos começou.');
      }
    },
    corrida_iniciada: (event) => { if (event.id === rideId) queryClient.setQueryData(['ride-active', rideId], event); },
    corrida_finalizada: (event) => { if (event.corrida.id === rideId) queryClient.setQueryData(['ride-active', rideId], event.corrida); },
    corrida_cancelada: (event) => { if (event.corrida_id === rideId) queryClient.setQueryData(['ride-active', rideId], event.corrida); },
    motorista_em_movimento: (event) => { if (event.corrida_id === rideId) setDriverMovingRideId(rideId); },
  }), [rideId]);

  useEffect(() => {
    if (!ride?.motorista_chegou_em || ride.status !== 'aceita') return;
    const update = () => setClockNow(Date.now());
    update();
    const timer = setInterval(update, 1000);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') update(); });
    return () => { clearInterval(timer); appState.remove(); };
  }, [ride?.motorista_chegou_em, ride?.status]);

  async function onCancel() {
    const acceptedRide = ride?.status === 'aceita' && Boolean(ride.motorista_id);
    const acceptedAtMs = ride?.aceita_em ? new Date(ride.aceita_em).getTime() : Number.NaN;
    const feeWindowElapsed = acceptedRide && Number.isFinite(acceptedAtMs) && Date.now() - acceptedAtMs >= 180_000;
    Alert.alert(
      'Cancelar corrida?',
      acceptedRide
        ? feeWindowElapsed
          ? 'Já passaram 180 segundos desde o aceite. Se confirmar, será registrado um débito de R$ 3,00 e o valor será creditado na carteira MOVI do motorista. O servidor confirma o tempo; o débito continua em aberto até a quitação.'
          : 'Ainda não passaram 180 segundos desde o aceite, pelo horário deste aparelho. O servidor valida o tempo exato; se o limite tiver sido atingido, será registrado um débito de R$ 3,00 e creditado na carteira MOVI do motorista.'
        : 'Como nenhum motorista aceitou a corrida, não será aplicada taxa de cancelamento.',
      [
        { text: 'Continuar corrida', style: 'cancel' },
        { text: 'Confirmar cancelamento', style: 'destructive', onPress: () => {
          void cancelRide(rideId).then(() => query.refetch()).catch((error) => Alert.alert('Não foi possível cancelar', error instanceof Error ? error.message : 'Tente novamente.'));
        } },
      ],
    );
  }

  function returnToHome() {
    void queryClient.invalidateQueries({ queryKey: ['extrato'] });
    router.replace('/(app)/home');
  }

  async function onShareRide() {
    Alert.alert('Compartilhar viagem?', 'Quem receber o link poderá ver o trajeto, a identificação do veículo e a localização recente do motorista até o link ser revogado ou expirar.', [
      { text: 'Agora não', style: 'cancel' },
      { text: 'Gerar link seguro', onPress: () => {
        setSharing(true);
        void createRideShare(rideId).then(({ url }) => Share.share({ message: `Acompanhe minha viagem MOVI: ${url}`, url, title: 'Acompanhar viagem MOVI' })).catch((error) => Alert.alert('Não foi possível compartilhar', error instanceof Error ? error.message : 'Tente novamente.')).finally(() => setSharing(false));
      } },
    ]);
  }

  if (query.isLoading) return <Screen title="Sua corrida" loading />;
  if (query.isError || !ride) return <Screen title="Sua corrida"><Text>Não foi possível carregar esta corrida.</Text><Button title="Voltar ao início" onPress={() => router.replace('/(app)/home')} /></Screen>;
  const copy = rideStatusCopy(ride.status);
  const terminal = isTerminalRide(ride.status);
  const pageTitle = ride.status === 'aceita' ? 'Corrida em andamento' : ride.status === 'em_andamento' ? 'Em viagem' : ride.status === 'solicitada' ? 'Buscando motoristas' : copy.title;
  const activeStep = ride.status === 'solicitada' ? 0 : ride.status === 'aceita' ? (ride.motorista_chegou_em ? 2 : 1) : ride.status === 'em_andamento' ? 3 : 4;
  const steps = ['Motorista', 'Embarque', 'Viagem', 'Destino'];
  const arrivalAt = ride.motorista_chegou_em ? new Date(ride.motorista_chegou_em).getTime() : Number.NaN;
  const waitSeconds = Number.isFinite(arrivalAt) && clockNow > 0 ? Math.max(0, Math.ceil((arrivalAt + 180_000 - clockNow) / 1000)) : null;
  const waitLabel = waitSeconds === null ? null : `${String(Math.floor(waitSeconds / 60)).padStart(2, '0')}:${String(waitSeconds % 60).padStart(2, '0')}`;
  return <Screen title={pageTitle} scroll>
    {!terminal ? <RideTrackingMap key={rideId} rideId={rideId} originLatitude={ride.origem_lat} originLongitude={ride.origem_lng} destinationLatitude={ride.destino_lat} destinationLongitude={ride.destino_lng} initialDriverLocation={ride.motorista_localizacao ? { lat: ride.motorista_localizacao.lat, lng: ride.motorista_localizacao.lng } : null} height={mapHeight} /> : null}
    {!terminal ? <View style={styles.progress} accessibilityLabel={`Etapa ${Math.min(activeStep + 1, steps.length)} de ${steps.length}`}><View style={styles.progressLine} />{steps.map((step, index) => <View key={step} style={styles.progressStep}><View style={[styles.progressDot, index <= activeStep && styles.progressDotActive]} /><Text style={[styles.progressLabel, index <= activeStep && styles.progressLabelActive]}>{step}</Text></View>)}</View> : null}
    <Card>
      <Text style={styles.status}>{copy.title}</Text>
      <Text style={styles.subtitle}>{copy.description}</Text>
      {ride.status === 'solicitada' ? <View style={styles.searching}><ActivityIndicator size="small" color={theme.primary} /><View style={styles.searchCopy}><Text style={styles.searchingText}>Buscando motoristas próximos</Text><Text style={styles.searchHint}>Avisaremos assim que alguém aceitar sua corrida.</Text></View></View> : null}
      {driverMovingRideId === rideId ? <Text style={styles.live}>● Motorista em movimento</Text> : null}
      {ride.status === 'aceita' && ride.motorista_chegou_em ? <Text style={styles.arrived}>● Motorista chegou ao embarque. Apresente o código para iniciar.</Text> : null}
      {ride.status === 'aceita' && waitLabel !== null ? <View accessibilityLiveRegion="polite" style={styles.waitCard}><Text style={styles.waitTitle}>{waitSeconds === 0 ? 'Tempo de espera concluído' : 'Motorista aguardando você'}</Text><Text style={styles.waitTimer}>{waitLabel}</Text><Text style={styles.waitCopy}>{waitSeconds === 0 ? 'O período de espera de três minutos terminou. O motorista pode cancelar sem impacto na taxa de finalização.' : 'A contagem de 3 minutos começou quando o motorista registrou a chegada.'}</Text></View> : null}
      <Text style={styles.value}>{brl(ride.valor)}</Text>
      <Text style={styles.meta}>{km(ride.distancia_km)} • {minutes(ride.tempo_minutos)} • {ride.categoria === 'moto' ? 'Moto' : 'Carro'}</Text>
      <Text style={styles.meta}>Pagamento: {ride.forma_pagamento}</Text>
      <Text style={styles.meta}>Origem: {ride.origem}</Text>
      <Text style={styles.meta}>Destino: {ride.destino}</Text>
      {ride.taxa_cancelamento ? <Text style={styles.fee}>Taxa de cancelamento: {brl(ride.taxa_cancelamento.valor)} · débito {ride.taxa_cancelamento.status === 'contestada' ? 'em análise' : 'pendente'}. O motorista já recebeu esse valor como crédito na carteira MOVI; seu débito continua em aberto até a quitação.</Text> : null}
      {(ride.status === 'aceita' || ride.status === 'em_andamento') && ride.motorista ? <><Text style={styles.driverTitle}>Seu motorista</Text><Text style={styles.meta}>{ride.motorista.nome} {ride.motorista.sobrenome ?? ''} • {ride.motorista.categoria === 'moto' ? 'Moto' : 'Carro'}{ride.motorista.nota_media ? ` • ★ ${Number(ride.motorista.nota_media).toFixed(1)}` : ''}</Text>{ride.motorista.modelo || ride.motorista.cor ? <Text style={styles.meta}>Veículo: {[ride.motorista.marca, ride.motorista.modelo, ride.motorista.cor].filter(Boolean).join(' ')}</Text> : null}{ride.motorista.placa ? <Text style={styles.plate}>{ride.motorista.placa}</Text> : null}</> : null}
    </Card>
    {ride.status === 'aceita' && ride.codigo_embarque ? <Card><Text style={styles.driverTitle}>Código seguro de embarque</Text><Text style={styles.code}>{ride.codigo_embarque}</Text><Text style={styles.codeHint}>Mostre este código ao motorista quando ele chegar. Ele precisa validá-lo para iniciar a corrida.</Text></Card> : null}
    {canCancelRide(ride.status) ? <><Button title="Cancelar corrida" variant="danger" onPress={() => void onCancel()} />{ride.status === 'aceita' ? <Text style={styles.cancelHint}>Antes de confirmar, o app informa se a taxa de cancelamento se aplica.</Text> : null}</> : null}
    {ride.status === 'aceita' || ride.status === 'em_andamento' ? <Button title="Conversar com o motorista" variant="secondary" onPress={() => router.push({ pathname: '/(app)/chat', params: { id: String(ride.id) } })} /> : null}
    {ride.status === 'aceita' || ride.status === 'em_andamento' ? <><Button title={sharing ? 'Gerando link seguro…' : 'Compartilhar minha viagem'} variant="secondary" disabled={sharing} onPress={() => void onShareRide()} /><Button title="Revogar link compartilhado" variant="secondary" onPress={() => void revokeRideShare(ride.id).then(() => Alert.alert('Link revogado', 'O link não mostrará mais os dados da viagem.')).catch((error) => Alert.alert('Não foi possível revogar', error instanceof Error ? error.message : 'Tente novamente.'))} /></> : null}
    {ride.status === 'concluida' ? <><Button title="Avaliar motorista" onPress={() => router.push({ pathname: '/(app)/conta/avaliar', params: { id: String(ride.id), motoristaId: String(ride.motorista_id ?? '') } })} /><Button title="Relatar um problema" variant="secondary" onPress={() => router.push({ pathname: '/(app)/conta/denunciar', params: { id: String(ride.id), motoristaId: String(ride.motorista_id ?? '') } })} /></> : null}
    {terminal ? <Button title="Voltar para início" onPress={returnToHome} /> : null}
  </Screen>;
}

function createStyles(colors: ReturnType<typeof useMoviTheme>['colors']) { return StyleSheet.create({ progress: { minHeight: 58, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 4, position: 'relative' }, progressLine: { position: 'absolute', top: 11, left: 33, right: 33, height: 2, backgroundColor: colors.border }, progressStep: { width: 58, alignItems: 'center', gap: 6 }, progressDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.border }, progressDotActive: { backgroundColor: colors.primary, borderColor: colors.primary }, progressLabel: { color: colors.muted, fontSize: 10, fontWeight: '600' }, progressLabelActive: { color: colors.primary }, status: { fontSize: 24, fontWeight: '900', color: colors.text }, subtitle: { color: colors.muted, lineHeight: 20, marginTop: 6 }, searching: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, marginTop: 14, borderRadius: 14, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border }, searchCopy: { flex: 1, gap: 3 }, searchingText: { color: colors.text, fontWeight: '800', fontSize: 13 }, searchHint: { color: colors.muted, fontSize: 11, lineHeight: 16 }, waitCard: { marginTop: 14, alignItems: 'center', padding: 14, borderRadius: 15, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border }, waitTitle: { color: colors.text, fontWeight: '800', fontSize: 13 }, waitTimer: { color: colors.primary, fontSize: 30, fontWeight: '900', marginVertical: 3, fontVariant: ['tabular-nums'] }, waitCopy: { color: colors.muted, textAlign: 'center', fontSize: 11, lineHeight: 16 }, cancelHint: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: -8 }, live: { color: colors.success, marginTop: 10, fontWeight: '700' }, arrived: { color: colors.success, marginTop: 10, fontWeight: '800', lineHeight: 20 }, value: { fontSize: 32, fontWeight: '900', color: colors.text, marginTop: 18 }, meta: { color: colors.muted, marginTop: 8 }, fee: { color: colors.danger, marginTop: 12, lineHeight: 20, fontWeight: '700' }, driverTitle: { color: colors.text, fontWeight: '900', marginTop: 16, fontSize: 16 }, plate: { color: colors.text, fontWeight: '900', fontSize: 21, letterSpacing: 2, marginTop: 10 }, code: { color: colors.text, fontWeight: '900', fontSize: 30, letterSpacing: 8, textAlign: 'center', marginVertical: 10 }, codeHint: { color: colors.muted, lineHeight: 19, textAlign: 'center', fontSize: 13 } }); }
