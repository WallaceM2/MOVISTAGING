import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { MapViewCard } from '@/components/MapViewCard';
import { Screen } from '@/components/Screen';
import { getCurrentCoordinates } from '@/location/location';
import { estimateRide } from '@/features/corrida/corridaService';
import { searchPlaces, PlaceSuggestion } from '@/features/maps/geocodingService';
import type { Estimate, PaymentMethod, RideCategory } from '@/types/api';
import { brl, km, minutes } from '@/utils/format';
import { colors } from '@/theme/colors';

export default function EstimarScreen() {
  const [destinationText, setDestinationText] = useState(''); const [destination, setDestination] = useState<PlaceSuggestion | null>(null); const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]); const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null); const [categoria, setCategoria] = useState<RideCategory>('moto'); const [pagamento, setPagamento] = useState<PaymentMethod>('dinheiro'); const [loading, setLoading] = useState(false); const [searching, setSearching] = useState(false); const [searchError, setSearchError] = useState<string | null>(null); const [estimate, setEstimate] = useState<Estimate | null>(null);
  useEffect(() => { void getCurrentCoordinates().then(setOrigin).catch(() => undefined); }, []);
  useEffect(() => {
    const query = destinationText.trim();
    if (destination || query.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true); setSearchError(null);
      void searchPlaces(query).then((places) => { if (active) { setSuggestions(places); setSearchError(places.length ? null : 'Nenhum endereço encontrado. Confira o texto e tente novamente.'); } }).catch((error: unknown) => { if (active) { setSuggestions([]); setSearchError(error instanceof Error ? error.message : 'Não foi possível buscar endereços. Tente novamente.'); } }).finally(() => { if (active) setSearching(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [destinationText, destination]);
  async function onEstimate() { if (!origin) return Alert.alert('Localização', 'Permita o acesso à localização para continuar.'); if (!destination) return Alert.alert('Destino', 'Escolha um endereço da lista.'); setLoading(true); try { const result = await estimateRide({ origem: 'Minha localização', destino: destination.label, origem_lat: origin.lat, origem_lng: origin.lng, destino_lat: destination.lat, destino_lng: destination.lng, categoria, forma_pagamento: pagamento }); setEstimate(result); } catch (error) { Alert.alert('Não foi possível estimar', error instanceof Error ? error.message : 'Tente novamente.'); } finally { setLoading(false); } }
  function continueRide() { if (!estimate || !origin || !destination) return; router.push({ pathname: '/(app)/corrida/confirmar', params: { payload: encodeURIComponent(JSON.stringify({ origem: 'Minha localização', destino: destination.label, origem_lat: origin.lat, origem_lng: origin.lng, destino_lat: destination.lat, destino_lng: destination.lng, categoria, forma_pagamento: pagamento, estimate })) } }); }
  return <Screen title="Para onde vamos?" subtitle="A rota e a tarifa são calculadas no MOVI V3."><Input label="Origem" value="Minha localização" editable={false} /><Input label="Destino" value={destinationText} onChangeText={(text) => { setDestinationText(text); setDestination(null); setSuggestions([]); setSearchError(null); setSearching(false); setEstimate(null); }} placeholder="Digite um endereço" />{searching ? <ActivityIndicator /> : suggestions.map((place) => <Pressable key={place.id} onPress={() => { setDestination(place); setDestinationText(place.label); setSuggestions([]); setSearchError(null); setSearching(false); }} style={styles.suggestion}><Text style={styles.suggestionTitle}>{place.label}</Text><Text style={styles.suggestionMeta}>Selecionar</Text></Pressable>)}{searchError && !searching ? <Text style={styles.searchFeedback}>{searchError}</Text> : null}<View style={styles.row}><Button title={categoria === 'moto' ? '✓ Moto' : 'Moto'} variant={categoria === 'moto' ? 'primary' : 'secondary'} compact onPress={() => setCategoria('moto')} /><Button title={categoria === 'carro' ? '✓ Carro' : 'Carro'} variant={categoria === 'carro' ? 'primary' : 'secondary'} compact onPress={() => setCategoria('carro')} /></View><View style={styles.row}><Button title="✓ Dinheiro" compact onPress={() => setPagamento('dinheiro')} /><Button title="Cartão" variant="secondary" compact disabled onPress={() => setPagamento('cartao')} /><Button title="PIX" variant="secondary" compact disabled onPress={() => setPagamento('pix')} /></View><Text style={styles.paymentNote}>Neste ambiente o backend V3 está com PAYMENT_PROVIDER=none; dinheiro é a forma habilitada.</Text><MapViewCard center={origin} origin={origin} destination={destination ? { lat: destination.lat, lng: destination.lng } : null} route={estimate?.geometria ?? null} height={310} /><Button title="Calcular estimativa" onPress={() => void onEstimate()} loading={loading} />{estimate ? <Card><Text style={styles.big}>{brl(estimate.valorPassageiro)}</Text><Text style={styles.meta}>{km(estimate.distanciaKm)} • {minutes(estimate.tempoMin)} • dinâmica {estimate.dinamicaAplicada}</Text><Text style={styles.small}>O aplicativo não calcula nem altera o preço. Ele apenas exibe o valor oficial retornado pelo backend.</Text><Button title="Continuar" onPress={continueRide} /></Card> : null}</Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 }, suggestion: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 13, backgroundColor: colors.surface }, suggestionTitle: { fontWeight: '800', color: colors.text }, suggestionMeta: { color: colors.muted, fontSize: 12, marginTop: 3 }, searchFeedback: { color: colors.muted, fontSize: 13 }, paymentNote: { fontSize: 12, color: colors.muted }, big: { fontSize: 34, fontWeight: '900', color: colors.text }, meta: { color: colors.muted, marginBottom: 10 }, small: { color: colors.muted, marginBottom: 12, fontSize: 13 } });
