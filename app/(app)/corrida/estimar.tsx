import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { MapViewCard } from '@/components/MapViewCard';
import { Screen } from '@/components/Screen';
import { getCurrentCoordinates } from '@/location/location';
import { estimateRide } from '@/features/corrida/corridaService';
import { searchPlaces, type PlaceSuggestion } from '@/features/maps/geocodingService';
import type { Estimate, PaymentMethod, RideCategory } from '@/types/api';
import { brl, km, minutes } from '@/utils/format';
import { useMoviTheme, useThemeStyles } from '@/theme/ThemeProvider';

type Coordinates = { lat: number; lng: number };
type LocationMode = 'gps' | 'manual';

export default function EstimarScreen() {
  const params = useLocalSearchParams<{ categoria?: string; origemModo?: string }>();
  const colors = useMoviTheme().colors;
  const styles = useThemeStyles(createStyles);
  const [destinationText, setDestinationText] = useState('');
  const [destination, setDestination] = useState<PlaceSuggestion | null>(null);
  const [destinationSuggestions, setDestinationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [originMode, setOriginMode] = useState<LocationMode>(params.origemModo === 'manual' ? 'manual' : 'gps');
  const [originText, setOriginText] = useState(params.origemModo === 'manual' ? '' : 'Minha localização');
  const [originPlace, setOriginPlace] = useState<PlaceSuggestion | null>(null);
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<PlaceSuggestion[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<RideCategory>(params.categoria === 'carro' ? 'carro' : 'moto');
  const [pagamento, setPagamento] = useState<PaymentMethod>('dinheiro');
  const [loading, setLoading] = useState(false);
  const [searchingDestination, setSearchingDestination] = useState(false);
  const [searchingOrigin, setSearchingOrigin] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<Partial<Record<RideCategory, Estimate>>>({});
  const estimate = estimates[categoria] ?? null;

  useEffect(() => {
    let active = true;
    void getCurrentCoordinates().then((coordinates) => {
      if (active && originMode === 'gps') { setOrigin(coordinates); setOriginText('Minha localização'); setLocationError(null); }
    }).catch((error: unknown) => {
      if (active && originMode === 'gps') setLocationError(error instanceof Error ? error.message : 'Não foi possível obter a localização.');
    });
    return () => { active = false; };
  }, [originMode]);

  useEffect(() => {
    const query = destinationText.trim();
    if (destination || query.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearchingDestination(true); setSearchError(null);
      void searchPlaces(query).then((places) => { if (active) { setDestinationSuggestions(places); setSearchError(places.length ? null : 'Nenhum endereço encontrado. Confira o texto e tente novamente.'); } })
        .catch((error: unknown) => { if (active) { setDestinationSuggestions([]); setSearchError(error instanceof Error ? error.message : 'Não foi possível buscar endereços. Tente novamente.'); } })
        .finally(() => { if (active) setSearchingDestination(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [destinationText, destination]);

  useEffect(() => {
    const query = originText.trim();
    if (originMode !== 'manual' || originPlace || query.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearchingOrigin(true);
      void searchPlaces(query).then((places) => { if (active) setOriginSuggestions(places); })
        .catch(() => { if (active) setOriginSuggestions([]); })
        .finally(() => { if (active) setSearchingOrigin(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [originMode, originText, originPlace]);

  function chooseMode(mode: LocationMode) {
    setOriginMode(mode); setEstimates({}); setOriginSuggestions([]); setLocationError(null);
    if (mode === 'manual') { setOrigin(null); setOriginPlace(null); setOriginText(''); }
    else { setOrigin(null); setOriginPlace(null); setOriginText('Minha localização'); }
  }

  async function onEstimate() {
    if (!destination) return Alert.alert('Destino', 'Escolha um endereço da lista.');
    if (originMode === 'manual' && !originPlace) return Alert.alert('Embarque', 'Informe o endereço e escolha uma sugestão da lista.');
    let currentOrigin = origin;
    if (originMode === 'gps' && !currentOrigin) {
      try { currentOrigin = await getCurrentCoordinates(); setOrigin(currentOrigin); setLocationError(null); }
      catch (error) { const message = error instanceof Error ? error.message : 'Não foi possível obter a localização.'; setLocationError(message); return Alert.alert('Localização', message); }
    }
    if (!currentOrigin) return Alert.alert('Embarque', 'Não foi possível confirmar as coordenadas do embarque.');
    setLoading(true);
    try {
      const common = { origem: originMode === 'gps' ? 'Minha localização' : originPlace!.label, destino: destination.label, origem_lat: currentOrigin.lat, origem_lng: currentOrigin.lng, destino_lat: destination.lat, destino_lng: destination.lng, forma_pagamento: pagamento };
      const [moto, carro] = await Promise.all([
        estimateRide({ ...common, categoria: 'moto' }),
        estimateRide({ ...common, categoria: 'carro' }),
      ]);
      setEstimates({ moto, carro });
    } catch (error) { Alert.alert('Não foi possível estimar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setLoading(false); }
  }

  function continueRide() {
    if (!estimate || !origin || !destination) return;
    router.push({ pathname: '/(app)/corrida/confirmar', params: { payload: encodeURIComponent(JSON.stringify({ origem: originMode === 'gps' ? 'Minha localização' : originPlace?.label, destino: destination.label, origem_lat: origin.lat, origem_lng: origin.lng, destino_lat: destination.lat, destino_lng: destination.lng, categoria, forma_pagamento: pagamento, estimate })) } });
  }

  return <Screen title="Solicitar corrida" subtitle="Escolha o embarque, o destino e a categoria.">
    <MapViewCard center={origin} origin={origin} destination={destination ? { lat: destination.lat, lng: destination.lng } : null} route={estimate?.geometria ?? null} height={280} />
    <Card style={styles.routeCard}>
    <View style={styles.modeRow}>
      <Button title={originMode === 'gps' ? '✓ Minha localização' : 'Minha localização'} compact variant={originMode === 'gps' ? 'primary' : 'secondary'} onPress={() => chooseMode('gps')} />
      <Button title={originMode === 'manual' ? '✓ Informar endereço' : 'Informar endereço'} compact variant={originMode === 'manual' ? 'primary' : 'secondary'} onPress={() => chooseMode('manual')} />
    </View>
    {originMode === 'gps' ? <><Input label="Embarque" value="Minha localização" editable={false} />{locationError ? <Text style={styles.feedback}>{locationError} Tente informar o endereço manualmente.</Text> : null}</> : <>
      <Input label="Embarque" value={originText} onChangeText={(text) => { setOriginText(text); setOrigin(null); setOriginPlace(null); setEstimates({}); }} placeholder="Digite o endereço de embarque" />
      {searchingOrigin ? <ActivityIndicator color={colors.primary} /> : originSuggestions.map((place) => <Pressable key={place.id} onPress={() => { setOriginPlace(place); setOrigin(place); setOriginText(place.label); setOriginSuggestions([]); }} style={styles.suggestion}><Text style={styles.suggestionTitle}>{place.label}</Text><Text style={styles.suggestionMeta}>Selecionar embarque</Text></Pressable>)}
    </>}
    <Input label="Desembarque" value={destinationText} onChangeText={(text) => { setDestinationText(text); setDestination(null); setDestinationSuggestions([]); setSearchError(null); setEstimates({}); }} placeholder="Digite o endereço de desembarque" />
    {searchingDestination ? <ActivityIndicator color={colors.primary} /> : destinationSuggestions.map((place) => <Pressable key={place.id} onPress={() => { setDestination(place); setDestinationText(place.label); setDestinationSuggestions([]); setSearchError(null); }} style={styles.suggestion}><Text style={styles.suggestionTitle}>{place.label}</Text><Text style={styles.suggestionMeta}>Selecionar destino</Text></Pressable>)}
    {searchError && !searchingDestination ? <Text style={styles.feedback}>{searchError}</Text> : null}
    </Card>
    <Text style={styles.sectionTitle}>Escolha uma categoria</Text>
    <View style={styles.categoryRow}>{(['moto', 'carro'] as const).map((item) => { const quote = estimates[item]; const selected = categoria === item; return <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setCategoria(item)} style={[styles.categoryCard, { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.surface }]}><MaterialCommunityIcons name={item === 'moto' ? 'motorbike' : 'car-side'} size={25} color={colors.primary} style={styles.categoryIcon} /><View style={styles.categoryCopy}><Text style={[styles.categoryTitle, { color: colors.text }]}>{item === 'moto' ? 'Moto' : 'Carro'}</Text><Text style={[styles.categoryHint, { color: colors.muted }]}>{item === 'moto' ? 'Mais rápido' : 'Mais espaço'}</Text></View><View style={styles.priceCopy}>{quote ? <Text style={[styles.categoryPrice, { color: colors.text }]}>{brl(quote.totalPassageiro ?? quote.valorPassageiro)}</Text> : <Text style={[styles.categoryPricePending, { color: colors.muted }]}>—</Text>}{selected ? <Text style={[styles.selectedLabel, { color: colors.primary }]}>Selecionado</Text> : null}</View></Pressable>; })}</View>
    <View style={styles.row}><Button title="✓ Dinheiro" compact onPress={() => { setPagamento('dinheiro'); setEstimates({}); }} /><Button title="Cartão" variant="secondary" compact disabled onPress={() => { setPagamento('cartao'); setEstimates({}); }} /><Button title="PIX" variant="secondary" disabled compact onPress={() => { setPagamento('pix'); setEstimates({}); }} /></View>
    <Text style={styles.paymentNote}>Neste ambiente o backend V3 está com PAYMENT_PROVIDER=none; dinheiro é a forma habilitada.</Text>
    {estimate ? <Card>{Number(estimate.debitoTaxaCancelamento ?? 0) > 0 ? <><Text style={styles.meta}>Tarifa da corrida</Text><Text style={styles.value}>{brl(estimate.valorPassageiro)}</Text><Text style={styles.meta}>Débito anterior de cancelamento</Text><Text style={styles.value}>{brl(estimate.debitoTaxaCancelamento)}</Text></> : null}<Text style={styles.estimatedLabel}>Estimativa {categoria === 'moto' ? 'Moto' : 'Carro'}</Text><Text style={styles.big}>{brl(estimate.totalPassageiro ?? estimate.valorPassageiro)}</Text><Text style={styles.meta}>{km(estimate.distanciaKm)} • {minutes(estimate.tempoMin)} • dinâmica {estimate.dinamicaAplicada}</Text><Text style={styles.small}>Valores oficiais retornados pelo MOVI V3. A tarifa fica confirmada ao solicitar.</Text></Card> : null}
    <Button title={loading ? 'Consultando valores…' : estimate ? 'Solicitar corrida' : 'Ver valores de Moto e Carro'} onPress={() => estimate ? continueRide() : void onEstimate()} loading={loading} />
  </Screen>;
}

function createStyles(colors: ReturnType<typeof useMoviTheme>['colors']) { return StyleSheet.create({ modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, row: { flexDirection: 'row', gap: 8 }, routeCard: { padding: 14, gap: 10 }, sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginBottom: -3 }, categoryRow: { flexDirection: 'row', gap: 9 }, categoryCard: { flex: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9, borderWidth: 1.3, borderRadius: 15 }, categoryIcon: { width: 29, textAlign: 'center' }, categoryCopy: { flex: 1, gap: 3 }, categoryTitle: { fontSize: 13, fontWeight: '900' }, categoryHint: { fontSize: 9 }, priceCopy: { alignItems: 'flex-end', gap: 2 }, categoryPrice: { fontSize: 13, fontWeight: '900' }, categoryPricePending: { fontSize: 14, fontWeight: '800' }, selectedLabel: { fontSize: 8, fontWeight: '800' }, selected: { fontSize: 15 }, suggestion: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 13, backgroundColor: colors.surface }, suggestionTitle: { fontWeight: '800', color: colors.text }, suggestionMeta: { color: colors.muted, fontSize: 12, marginTop: 3 }, feedback: { color: colors.muted, fontSize: 13 }, paymentNote: { fontSize: 12, color: colors.muted }, big: { fontSize: 34, fontWeight: '900', color: colors.text }, estimatedLabel: { color: colors.muted, fontSize: 12 }, value: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 7 }, meta: { color: colors.muted, marginBottom: 10 }, small: { color: colors.muted, marginBottom: 12, fontSize: 13 } }); }

