import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { getExtrato } from '@/features/perfil/profileService';
import { brl } from '@/utils/format';
import { rideStatusCopy } from '@/features/corrida/rideState';
import type { ExtratoResponse } from '@/types/api';
import { useMoviTheme, useThemeStyles } from '@/theme/ThemeProvider';

type Filter = 'todas' | 'concluidas' | 'canceladas';
const filters: { id: Filter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'concluidas', label: 'Concluídas' },
  { id: 'canceladas', label: 'Canceladas' },
];

function rideDate(ride: ExtratoResponse['historico'][number]) {
  const raw = ride.finalizada_em ?? ride.criado_em;
  if (!raw) return 'Data indisponível';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const day = date.toDateString() === today.toDateString() ? 'Hoje' : date.toDateString() === yesterday.toDateString() ? 'Ontem' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${day} · ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function HistoryScreen() {
  const theme = useMoviTheme().colors;
  const styles = useThemeStyles(createStyles);
  const [filter, setFilter] = useState<Filter>('todas');
  const query = useQuery({ queryKey: ['extrato'], queryFn: () => getExtrato(30, 0) });
  const rides = useMemo(() => (query.data?.historico ?? []).filter((ride) => {
    if (filter === 'concluidas') return ride.status === 'concluida';
    if (filter === 'canceladas') return ride.status === 'cancelada' || ride.status === 'expirada';
    return true;
  }), [query.data?.historico, filter]);

  return <Screen title="Corridas" subtitle="Acompanhe suas viagens e consulte os detalhes.">
    <View style={styles.filters} accessibilityRole="tablist">
      {filters.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: filter === item.id }} onPress={() => setFilter(item.id)} style={[styles.filter, filter === item.id && { backgroundColor: theme.primary }]}><Text style={[styles.filterText, { color: filter === item.id ? '#04120F' : theme.muted }]}>{item.label}</Text></Pressable>)}
    </View>
    {query.isLoading ? <Text style={styles.empty}>Carregando suas corridas…</Text> : null}
    {query.isError ? <Button title="Tentar novamente" onPress={() => void query.refetch()} /> : null}
    {rides.map((ride) => {
      const complete = ride.status === 'concluida';
      const cancelled = ride.status === 'cancelada' || ride.status === 'expirada';
      return <Pressable key={ride.id} accessibilityRole="button" accessibilityLabel={`Abrir corrida ${ride.id}`} onPress={() => router.push({ pathname: '/(app)/corrida/status', params: { id: String(ride.id) } })}>
        <Card style={styles.rideCard}>
          <View style={styles.rideHeading}><Text style={styles.date}>{rideDate(ride)}</Text><Text style={styles.price}>{brl(ride.valor)}</Text></View>
          <View style={styles.routeRow}><View style={styles.routeIcons}><Text style={[styles.originIcon, { color: theme.cyan }]}>●</Text><View style={[styles.routeLine, { backgroundColor: theme.border }]} /><Text style={[styles.destinationIcon, { color: theme.primary }]}>●</Text></View><View style={styles.routeCopy}><Text style={styles.destination} numberOfLines={1}>{ride.destino}</Text><Text style={styles.origin} numberOfLines={1}>{ride.origem}</Text></View></View>
          <View style={styles.rideFooter}><Text style={styles.meta}>{ride.forma_pagamento === 'dinheiro' ? 'Dinheiro' : ride.forma_pagamento.toUpperCase()}</Text><View style={[styles.statusBadge, complete && { backgroundColor: theme.primarySoft }, cancelled && { backgroundColor: theme.danger + '22' }]}><Text style={[styles.status, complete && { color: theme.primary }, cancelled && { color: theme.danger }]}>{rideStatusCopy(ride.status).title}</Text></View></View>
        </Card>
      </Pressable>;
    })}
    {!query.isLoading && !query.isError && !rides.length ? <Card><Text style={styles.empty}>{filter === 'todas' ? 'Você ainda não tem corridas neste histórico.' : 'Nenhuma corrida encontrada neste filtro.'}</Text></Card> : null}
  </Screen>;
}

function createStyles(colors: ReturnType<typeof useMoviTheme>['colors']) { return StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, paddingBottom: 2 }, filter: { minHeight: 36, paddingHorizontal: 17, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, filterText: { fontSize: 12, fontWeight: '800' },
  rideCard: { paddingVertical: 14, paddingHorizontal: 15, gap: 9 }, rideHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, date: { color: colors.muted, fontSize: 12, fontWeight: '600' }, price: { fontSize: 16, fontWeight: '900', color: colors.text }, routeRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, routeIcons: { width: 14, alignItems: 'center' }, originIcon: { fontSize: 9 }, destinationIcon: { fontSize: 10 }, routeLine: { width: 1, height: 13 }, routeCopy: { flex: 1, gap: 4 }, destination: { fontSize: 13, fontWeight: '800', color: colors.text }, origin: { color: colors.muted, fontSize: 11 }, rideFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 9 }, meta: { color: colors.muted, fontSize: 11 }, statusBadge: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 }, status: { color: colors.muted, fontSize: 10, fontWeight: '800' }, empty: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
}); }
