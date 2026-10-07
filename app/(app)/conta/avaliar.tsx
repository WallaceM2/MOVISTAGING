import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { createEvaluation } from '@/features/avaliacao/avaliacaoService';
import { colors } from '@/theme/colors';

export default function EvaluateScreen() {
  const { id, motoristaId } = useLocalSearchParams<{ id: string; motoristaId?: string }>();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit() {
    const rideId = Number(id); const driverId = Number(motoristaId);
    if (!Number.isInteger(rideId) || !Number.isInteger(driverId) || driverId <= 0) return Alert.alert('Avaliação indisponível', 'O motorista desta corrida não está identificado.');
    setLoading(true);
    try {
      const comentario = comment.trim();
      await createEvaluation({corrida_id: rideId,avaliado_tipo: 'motorista',avaliado_id: driverId,nota: rating,...(comentario ? { comentario } : {}),});
      Alert.alert('Obrigado', 'Sua avaliação foi registrada.', [{ text: 'Concluir', onPress: () => router.replace('/(app)/home') }]);
    } catch (error) { Alert.alert('Não foi possível avaliar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setLoading(false); }
  }
  return <Screen title="Avaliar motorista" subtitle="Sua avaliação ajuda a melhorar a experiência no MOVI.">
    <View style={styles.stars}>{[1,2,3,4,5].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${value} estrelas`} onPress={() => setRating(value)}><Text style={[styles.star, value <= rating && styles.starActive]}>★</Text></Pressable>)}</View>
    <Text style={styles.selected}>{rating} de 5</Text>
    <Input label="Comentário (opcional)" value={comment} onChangeText={setComment} multiline maxLength={1000} style={styles.comment} />
    <Button title="Enviar avaliação" onPress={() => void submit()} loading={loading} />
  </Screen>;
}
const styles = StyleSheet.create({ stars: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 14 }, star: { fontSize: 42, color: '#D1D5DB' }, starActive: { color: '#111827' }, selected: { textAlign: 'center', color: colors.muted, fontWeight: '800' }, comment: { minHeight: 120, textAlignVertical: 'top', paddingTop: 14 } });
