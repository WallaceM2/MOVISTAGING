import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { MapViewCard } from '@/components/MapViewCard';
import { Screen } from '@/components/Screen';
import { requestRide } from '@/features/corrida/corridaService';
import type { RideRequest } from '@/features/corrida/corridaService';
import type { Estimate } from '@/types/api';
import { brl, km, minutes } from '@/utils/format';
import { colors } from '@/theme/colors';

export default function ConfirmarScreen() { const { payload } = useLocalSearchParams<{ payload?: string }>(); const parsed = useMemo(() => { try { return JSON.parse(decodeURIComponent(payload ?? '')) as RideRequest & { estimate?: Estimate }; } catch { return null; } }, [payload]); const [loading, setLoading] = useState(false);
  async function confirm() {
  if (!parsed) {
    return Alert.alert(
      'Dados inválidos',
      'Volte e faça uma nova estimativa.',
    );
  }

  const cotacaoToken = parsed.estimate?.cotacao_token;
  if (!cotacaoToken) {
    return Alert.alert(
      'Cotação indisponível',
      'Volte e atualize a estimativa antes de solicitar a corrida.',
    );
  }

  setLoading(true);

  try {
    const result = await requestRide({
      origem: parsed.origem,
      destino: parsed.destino,
      origem_lat: parsed.origem_lat,
      origem_lng: parsed.origem_lng,
      destino_lat: parsed.destino_lat,
      destino_lng: parsed.destino_lng,
      categoria: parsed.categoria,
      forma_pagamento: parsed.forma_pagamento,
      cotacao_token: cotacaoToken,
    });

    router.replace({
      pathname: '/(app)/corrida/status',
      params: { id: String(result.corrida.id) },
    });
  } catch (error) {
    Alert.alert(
      'Não foi possível solicitar',
      error instanceof Error ? error.message : 'Tente novamente.',
    );
  } finally {
    setLoading(false);
  }
}
  return <Screen title="Confirmar corrida" subtitle="Confira os dados antes de solicitar.">{parsed ? <><MapViewCard center={{ lat: parsed.origem_lat, lng: parsed.origem_lng }} origin={{ lat: parsed.origem_lat, lng: parsed.origem_lng }} destination={{ lat: parsed.destino_lat, lng: parsed.destino_lng }} route={parsed.estimate?.geometria ?? null} height={290} /><Card><Text style={styles.label}>Origem</Text><Text style={styles.value}>{parsed.origem}</Text><Text style={styles.label}>Destino</Text><Text style={styles.value}>{parsed.destino}</Text><Text style={styles.label}>Categoria</Text><Text style={styles.value}>{parsed.categoria === 'moto' ? 'Moto' : 'Carro'}</Text><Text style={styles.label}>Pagamento</Text><Text style={styles.value}>{parsed.forma_pagamento}</Text>{parsed.estimate ? <><Text style={styles.label}>Distância / duração</Text><Text style={styles.value}>{km(parsed.estimate.distanciaKm)} • {minutes(parsed.estimate.tempoMin)}</Text>{Number(parsed.estimate.debitoTaxaCancelamento ?? 0) > 0 ? <><Text style={styles.label}>Tarifa da corrida</Text><Text style={styles.value}>{brl(parsed.estimate.valorPassageiro)}</Text><Text style={styles.label}>Débito anterior de cancelamento · MOVI</Text><Text style={styles.value}>{brl(parsed.estimate.debitoTaxaCancelamento)}</Text></> : null}<Text style={styles.price}>{brl(parsed.estimate.totalPassageiro ?? parsed.estimate.valorPassageiro)}</Text><Text style={styles.lockedQuote}>Preço final com dinâmica {parsed.estimate.dinamicaAplicada}. Este valor fica fixo ao solicitar.</Text></> : null}</Card>{parsed.forma_pagamento === 'dinheiro' ? <Card><Text style={styles.cashNoticeTitle}>Pagamento em dinheiro</Text><Text style={styles.cashNotice}>Pague ao motorista o total mostrado, incluindo eventual débito de cancelamento. Na finalização, o app registra separadamente a tarifa da viagem e a recuperação de débito destinada à MOVI. Não faça um segundo pagamento pelo app.</Text></Card> : null}<Button title="Solicitar corrida" onPress={() => void confirm()} loading={loading} /></> : <Text>Dados da corrida inválidos.</Text>}</Screen>;
}
const styles = StyleSheet.create({ label: { color: colors.muted, fontSize: 12, marginTop: 8 }, value: { color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }, price: { fontSize: 30, fontWeight: '900', color: colors.text, marginTop: 14 }, lockedQuote: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }, cashNoticeTitle: { color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: 6 }, cashNotice: { color: colors.muted, lineHeight: 20 } });
