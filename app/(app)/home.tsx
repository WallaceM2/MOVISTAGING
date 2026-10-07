import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { MapViewCard } from '@/components/MapViewCard';
import { Screen } from '@/components/Screen';
import { getCurrentCoordinates } from '@/location/location';
import { getExtrato } from '@/features/perfil/profileService';
import { useAuthStore } from '@/store/authStore';
import { colors } from '@/theme/colors';

export default function HomeScreen() {
  const passenger = useAuthStore((s) => s.passenger); const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null); const extrato = useQuery({ queryKey: ['extrato'], queryFn: () => getExtrato(20, 0), staleTime: 30000 });
  useEffect(() => { void getCurrentCoordinates().then(setCenter).catch(() => undefined); }, []);
  useEffect(() => { const active = extrato.data?.historico.find((ride) => ['solicitada', 'aceita', 'em_andamento'].includes(ride.status)); if (active) router.replace({ pathname: '/(app)/corrida/status', params: { id: String(active.id) } }); }, [extrato.data?.historico]);
  return <Screen scroll={false}><View style={styles.header}><View><Text style={styles.greeting}>Olá, {passenger?.nome ?? 'passageiro'}</Text><Text style={styles.sub}>Para onde vamos?</Text></View><Text style={styles.logo}>MOVI</Text></View><MapViewCard center={center} height={410} /><Card><Text style={styles.cardTitle}>Solicite uma corrida</Text><Text style={styles.cardText}>Digite seu destino para consultar rota, distância, duração e tarifa oficial.</Text><Button title="Escolher destino" onPress={() => router.push('/(app)/corrida/estimar')} /></Card><View style={styles.actions}><Button title="Minhas viagens" variant="secondary" compact onPress={() => router.push('/(app)/conta/historico')} /><Button title="Minha conta" variant="secondary" compact onPress={() => router.push('/(app)/conta/perfil')} /></View><Text style={styles.note}>O preço oficial e o estado da corrida são definidos pelo backend MOVI V3.</Text></Screen>;
}
const styles = StyleSheet.create({ header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, greeting: { color: colors.muted, fontSize: 14 }, sub: { fontSize: 26, fontWeight: '900', color: colors.text, marginTop: 3 }, logo: { fontSize: 22, fontWeight: '900' }, cardTitle: { fontSize: 18, fontWeight: '900', color: colors.text }, cardText: { color: colors.muted, lineHeight: 20 }, actions: { flexDirection: 'row', gap: 10 }, note: { textAlign: 'center', color: colors.muted, fontSize: 12, paddingHorizontal: 10 } });
