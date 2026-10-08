import React, { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { MapViewCard } from '@/components/MapViewCard';
import { Screen } from '@/components/Screen';
import { getRide, cancelRide, createRideShare, revokeRideShare } from '@/features/corrida/corridaService';
import { canCancelRide, isTerminalRide, rideStatusCopy } from '@/features/corrida/rideState';
import { subscribeRideEvents } from '@/realtime/socket';
import { queryClient } from '@/providers';
import { brl, km, minutes } from '@/utils/format';
import type { Coordinates } from '@/types/api';
import { colors } from '@/theme/colors';

export default function RideStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rideId = Number(id);
  const [driverLocation, setDriverLocation] = useState<Coordinates | null>(null);
  const [sharing, setSharing] = useState(false);
  const query = useQuery({ queryKey: ['ride-active', rideId], queryFn: () => getRide(rideId), enabled: Number.isInteger(rideId) && rideId > 0, refetchInterval: (q) => q.state.data?.status === 'solicitada' ? 10000 : false });
  const ride = query.data;

  useEffect(() => subscribeRideEvents({
    corrida_solicitada: (event) => { if (event.corrida_id === rideId) void queryClient.invalidateQueries({ queryKey: ['ride-active', rideId] }); },
    corrida_aceita: (event) => { if (event.id === rideId) queryClient.setQueryData(['ride-active', rideId], event); },
    corrida_iniciada: (event) => { if (event.id === rideId) queryClient.setQueryData(['ride-active', rideId], event); },
    corrida_finalizada: (event) => { if (event.corrida.id === rideId) queryClient.setQueryData(['ride-active', rideId], event.corrida); },
    corrida_cancelada: (event) => { if (event.corrida_id === rideId) queryClient.setQueryData(['ride-active', rideId], event.corrida); },
    motorista_em_movimento: (event) => { if (event.corrida_id === rideId) setDriverLocation({ lat: event.lat, lng: event.lng }); },
  }), [rideId]);

  async function onCancel() {
    try { await cancelRide(rideId); await query.refetch(); }
    catch (error) { Alert.alert('Não foi possível cancelar', error instanceof Error ? error.message : 'Tente novamente.'); }
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
  const origin: Coordinates = { lat: Number(ride.origem_lat), lng: Number(ride.origem_lng) };
  const destination: Coordinates = { lat: Number(ride.destino_lat), lng: Number(ride.destino_lng) };

  return <Screen title="Sua corrida" scroll={terminal ? true : false}>
    {!terminal ? <MapViewCard center={driverLocation ?? origin} origin={origin} destination={destination} driver={driverLocation} height={360} /> : null}
    <Card>
      <Text style={styles.status}>{copy.title}</Text>
      <Text style={styles.subtitle}>{copy.description}</Text>
      {driverLocation ? <Text style={styles.live}>● Motorista em movimento</Text> : null}
      <Text style={styles.value}>{brl(ride.valor)}</Text>
      <Text style={styles.meta}>{km(ride.distancia_km)} • {minutes(ride.tempo_minutos)} • {ride.categoria === 'moto' ? 'Moto' : 'Carro'}</Text>
      <Text style={styles.meta}>Pagamento: {ride.forma_pagamento}</Text>
      <Text style={styles.meta}>Origem: {ride.origem}</Text>
      <Text style={styles.meta}>Destino: {ride.destino}</Text>
      {ride.status === 'aceita' && ride.motorista ? <><Text style={styles.driverTitle}>Seu motorista</Text><Text style={styles.meta}>{ride.motorista.nome} {ride.motorista.sobrenome ?? ''} • {ride.motorista.categoria === 'moto' ? 'Moto' : 'Carro'}{ride.motorista.nota_media ? ` • ★ ${Number(ride.motorista.nota_media).toFixed(1)}` : ''}</Text>{ride.motorista.modelo || ride.motorista.cor ? <Text style={styles.meta}>Veículo: {[ride.motorista.marca, ride.motorista.modelo, ride.motorista.cor].filter(Boolean).join(' ')}</Text> : null}{ride.motorista.placa ? <Text style={styles.plate}>{ride.motorista.placa}</Text> : null}</> : null}
    </Card>
    {ride.status === 'aceita' && ride.codigo_embarque ? <Card><Text style={styles.driverTitle}>Código seguro de embarque</Text><Text style={styles.code}>{ride.codigo_embarque}</Text><Text style={styles.codeHint}>Mostre este código ao motorista quando ele chegar. Ele precisa validá-lo para iniciar a corrida.</Text></Card> : null}
    {canCancelRide(ride.status) ? <Button title="Cancelar corrida" variant="danger" onPress={() => void onCancel()} /> : null}
    {ride.status === 'aceita' || ride.status === 'em_andamento' ? <><Button title={sharing ? 'Gerando link seguro…' : 'Compartilhar minha viagem'} variant="secondary" disabled={sharing} onPress={() => void onShareRide()} /><Button title="Revogar link compartilhado" variant="secondary" onPress={() => void revokeRideShare(ride.id).then(() => Alert.alert('Link revogado', 'O link não mostrará mais os dados da viagem.')).catch((error) => Alert.alert('Não foi possível revogar', error instanceof Error ? error.message : 'Tente novamente.'))} /></> : null}
    {ride.status === 'concluida' ? <><Button title="Avaliar motorista" onPress={() => router.push({ pathname: '/(app)/conta/avaliar', params: { id: String(ride.id), motoristaId: String(ride.motorista_id ?? '') } })} /><Button title="Relatar um problema" variant="secondary" onPress={() => router.push({ pathname: '/(app)/conta/denunciar', params: { id: String(ride.id), motoristaId: String(ride.motorista_id ?? '') } })} /></> : null}
    {terminal ? <Button title="Voltar para início" onPress={returnToHome} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({ status: { fontSize: 24, fontWeight: '900', color: colors.text }, subtitle: { color: colors.muted, lineHeight: 20, marginTop: 6 }, live: { color: colors.success, marginTop: 10, fontWeight: '700' }, value: { fontSize: 32, fontWeight: '900', color: colors.text, marginTop: 18 }, meta: { color: colors.muted, marginTop: 8 }, driverTitle: { color: colors.text, fontWeight: '900', marginTop: 16, fontSize: 16 }, plate: { color: colors.text, fontWeight: '900', fontSize: 21, letterSpacing: 2, marginTop: 10 }, code: { color: colors.text, fontWeight: '900', fontSize: 30, letterSpacing: 8, textAlign: 'center', marginVertical: 10 }, codeHint: { color: colors.muted, lineHeight: 19, textAlign: 'center', fontSize: 13 } });
