import React from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { getExtrato } from '@/features/perfil/profileService';
import { brl } from '@/utils/format';
import { rideStatusCopy } from '@/features/corrida/rideState';
import { colors } from '@/theme/colors';

export default function HistoryScreen() {
  const query = useQuery({ queryKey: ['extrato'], queryFn: () => getExtrato(30, 0) });
  return <Screen title="Minhas viagens" subtitle="Histórico retornado diretamente pelo MOVI V3.">
    {query.isLoading ? <Text>Carregando…</Text> : null}
    {query.isError ? <Button title="Tentar novamente" onPress={() => void query.refetch()} /> : null}
    {query.data?.historico.map((ride) => <Card key={ride.id}>
      <View style={styles.row}><Text style={styles.route} numberOfLines={1}>{ride.destino}</Text><Text style={styles.price}>{brl(ride.valor)}</Text></View>
      <Text style={styles.meta}>{ride.origem}</Text>
      <Text style={styles.status}>{rideStatusCopy(ride.status).title} • {ride.forma_pagamento}</Text>
      <Button title="Ver corrida" variant="secondary" compact onPress={() => router.push({ pathname: '/(app)/corrida/status', params: { id: String(ride.id) } })} />
    </Card>)}
    {!query.isLoading && !query.data?.historico.length ? <Text style={styles.empty}>Você ainda não possui viagens neste ambiente.</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  route: { flex: 1, fontSize: 16, fontWeight: '900', color: colors.text },
  price: { fontSize: 17, fontWeight: '900', color: colors.text },
  meta: { color: colors.muted, marginTop: 6 },
  status: { color: colors.muted, marginTop: 8 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 30 },
});
