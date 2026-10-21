import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { MapViewCard } from '@/components/MapViewCard';
import { Screen } from '@/components/Screen';
import { getCurrentCoordinates } from '@/location/location';
import { getExtrato } from '@/features/perfil/profileService';
import { useMoviTheme, useThemeStyles, type MoviColors } from '@/theme/ThemeProvider';
import type { RideCategory } from '@/types/api';

export default function HomeScreen() {
  const theme = useMoviTheme().colors;
  const styles = useThemeStyles(createStyles);
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [category, setCategory] = useState<RideCategory>('moto');
  const extrato = useQuery({ queryKey: ['extrato'], queryFn: () => getExtrato(20, 0), staleTime: 30000 });
  useEffect(() => { void getCurrentCoordinates().then(setCenter).catch(() => undefined); }, []);
  useEffect(() => { const active = extrato.data?.historico.find((ride) => ['solicitada', 'aceita', 'em_andamento'].includes(ride.status)); if (active) router.replace({ pathname: '/(app)/corrida/status', params: { id: String(active.id) } }); }, [extrato.data?.historico]);

  const mapHeight = Math.max(230, Math.min(510, Math.round(viewportHeight - 350), Math.round(viewportWidth * 1.28)));
  const openEstimate = (originMode: 'gps' | 'manual' = 'gps') => router.push({ pathname: '/(app)/corrida/estimar', params: { categoria: category, origemModo: originMode } });
  return <Screen scroll={false}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir minha conta" hitSlop={10} onPress={() => router.push('/(app)/conta')} style={styles.headerAction}>
        <MaterialCommunityIcons name="menu" size={25} color={theme.text} />
      </Pressable>
      <View style={styles.brand}><Image source={require('../../assets/movi-logo-oficial.png')} style={styles.logoMark} resizeMode="contain" /><Text style={[styles.logoWord, { color: theme.text }]}>MOVI</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Planejar uma corrida" hitSlop={10} onPress={() => openEstimate()} style={styles.headerAction}>
        <MaterialCommunityIcons name="magnify" size={25} color={theme.text} />
      </Pressable>
    </View>
    <View style={[styles.mapWrap, { height: mapHeight }]}>
      <MapViewCard center={center} height={mapHeight} />
      <View style={[styles.destinationCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Escolher para onde ir" onPress={() => openEstimate()} style={styles.destinationPrompt}>
          <View style={[styles.promptDot, { backgroundColor: theme.primary }]} /><Text style={[styles.promptText, { color: theme.text }]}>Para onde vamos?</Text><MaterialCommunityIcons name="chevron-right" size={21} color={theme.muted} />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <Pressable accessibilityRole="button" onPress={() => openEstimate('gps')} style={styles.routeRow}>
          <View style={[styles.originPin, { borderColor: theme.primary }]}><View style={[styles.pinCenter, { backgroundColor: theme.primary }]} /></View>
          <Text style={[styles.routeText, { color: theme.text }]} numberOfLines={1}>Minha localização</Text><MaterialCommunityIcons name="chevron-right" size={21} color={theme.muted} />
        </Pressable>
        <View style={[styles.routeConnector, { backgroundColor: theme.border }]} />
        <Pressable accessibilityRole="button" onPress={() => openEstimate('manual')} style={styles.routeRow}>
          <View style={[styles.destinationPin, { borderColor: theme.cyan }]}><View style={[styles.pinCenter, { backgroundColor: theme.cyan }]} /></View>
          <Text style={[styles.routePlaceholder, { color: theme.muted }]} numberOfLines={1}>Destino</Text><MaterialCommunityIcons name="chevron-right" size={21} color={theme.muted} />
        </Pressable>
      </View>
    </View>
    <View style={styles.modeRow}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: category === 'moto' }} onPress={() => setCategory('moto')} style={[styles.categoryCard, { backgroundColor: theme.surface, borderColor: category === 'moto' ? theme.primary : theme.border }]}><MaterialCommunityIcons name="motorbike" size={25} color={theme.primary} /><View style={styles.categoryCopy}><Text style={[styles.categoryTitle, { color: theme.text }]}>Moto</Text><Text style={[styles.categoryDetail, { color: theme.muted }]}>Mais rápido</Text></View></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: category === 'carro' }} onPress={() => setCategory('carro')} style={[styles.categoryCard, { backgroundColor: theme.surface, borderColor: category === 'carro' ? theme.primary : theme.border }]}><MaterialCommunityIcons name="car-side" size={25} color={theme.primary} /><View style={styles.categoryCopy}><Text style={[styles.categoryTitle, { color: theme.text }]}>Carro</Text><Text style={[styles.categoryDetail, { color: theme.muted }]}>Mais espaço</Text></View></Pressable>
    </View>
  </Screen>;
}

function createStyles(colors: MoviColors | ReturnType<typeof useMoviTheme>['colors']) { return StyleSheet.create({
  header: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerAction: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 5 }, logoMark: { width: 30, height: 30 }, logoWord: { fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  mapWrap: { position: 'relative' }, modeRow: { flexDirection: 'row', gap: 9, marginTop: 10 }, categoryCard: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1 }, categoryCopy: { flex: 1, gap: 2 }, categoryTitle: { fontSize: 13, fontWeight: '900' }, categoryDetail: { fontSize: 10 },
  destinationCard: { position: 'absolute', top: 12, left: 12, right: 12, borderRadius: 17, borderWidth: 1, paddingHorizontal: 13, paddingTop: 4, paddingBottom: 5, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, elevation: 7 },
  destinationPrompt: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 11 }, promptDot: { width: 9, height: 9, borderRadius: 5 }, promptText: { flex: 1, fontSize: 13, fontWeight: '800' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 20 }, routeRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 11 }, routeText: { flex: 1, fontSize: 12, fontWeight: '600' }, routePlaceholder: { flex: 1, fontSize: 12 }, originPin: { width: 12, height: 12, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, destinationPin: { width: 12, height: 12, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, pinCenter: { width: 4, height: 4, borderRadius: 2 }, routeConnector: { position: 'absolute', left: 18, top: 87, width: 1, height: 10 },
}); }


