import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { createEvaluation } from '@/features/avaliacao/avaliacaoService';
import type { DriverCompliment } from '@/types/api';
import { useMoviTheme, useThemeStyles } from '@/theme/ThemeProvider';

const compliments: { id: DriverCompliment; label: string; icon: string }[] = [
  { id: 'atencioso', label: 'Bom motorista', icon: 'account-heart-outline' },
  { id: 'veiculo_limpo', label: 'Veículo limpo e confortável', icon: 'car-wash' },
  { id: 'boa_rota', label: 'Boa rota', icon: 'map-marker-path' },
  { id: 'atendimento_excelente', label: 'Ótimo atendimento', icon: 'hand-heart-outline' },
  { id: 'viagem_confortavel', label: 'Viagem confortável', icon: 'seat-recline-normal' },
  { id: 'direcao_segura', label: 'Direção segura', icon: 'shield-check-outline' },
];

export default function EvaluateScreen() {
  const styles = useThemeStyles(createStyles);
  const { id, motoristaId } = useLocalSearchParams<{ id: string; motoristaId?: string }>();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [selectedCompliments, setSelectedCompliments] = useState<DriverCompliment[]>([]);
  const [loading, setLoading] = useState(false);
  async function submit() {
    const rideId = Number(id); const driverId = Number(motoristaId);
    if (!Number.isInteger(rideId) || !Number.isInteger(driverId) || driverId <= 0) return Alert.alert('Avaliação indisponível', 'O motorista desta corrida não está identificado.');
    setLoading(true);
    try {
      const comentario = comment.trim();
      await createEvaluation({corrida_id: rideId,avaliado_tipo: 'motorista',avaliado_id: driverId,nota: rating,...(selectedCompliments.length ? { tags: selectedCompliments } : {}),...(comentario ? { comentario } : {}),});
      Alert.alert('Obrigado', 'Sua avaliação foi registrada.', [{ text: 'Concluir', onPress: () => router.replace('/(app)/home') }]);
    } catch (error) { Alert.alert('Não foi possível avaliar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setLoading(false); }
  }
  return <Screen title="Avaliar motorista" subtitle="Sua avaliação ajuda a melhorar a experiência no MOVI.">
    <View style={styles.stars}>{[1,2,3,4,5].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${value} estrelas`} accessibilityState={{ selected: rating === value }} onPress={() => { setRating(value); if (value !== 5) setSelectedCompliments([]); }}><Text style={[styles.star, value <= rating && styles.starActive]}>★</Text></Pressable>)}</View>
    <Text style={styles.selected}>{rating} de 5</Text>
    {rating === 5 ? <View style={styles.complimentSection}>
      <Text style={styles.complimentTitle}>O que você gostaria de elogiar?</Text>
      <Text style={styles.complimentHint}>Escolha os elogios que combinam com sua viagem. Esta etapa é opcional.</Text>
      <View style={styles.compliments}>{compliments.map((item) => {
        const selected = selectedCompliments.includes(item.id);
        return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setSelectedCompliments((current) => selected ? current.filter((tag) => tag !== item.id) : [...current, item.id])} style={[styles.compliment, selected && styles.complimentSelected]}>
          <Text style={[styles.complimentIcon, selected && styles.complimentTextSelected]}>{item.icon === 'car-wash' ? '◇' : item.icon === 'map-marker-path' ? '⌖' : item.icon === 'shield-check-outline' ? '✓' : '♡'}</Text>
          <Text style={[styles.complimentText, selected && styles.complimentTextSelected]}>{item.label}</Text>
        </Pressable>;
      })}</View>
    </View> : null}
    <Input label="Comentário (opcional)" value={comment} onChangeText={setComment} multiline maxLength={1000} style={styles.comment} />
    <Button title="Enviar avaliação" onPress={() => void submit()} loading={loading} />
  </Screen>;
}
function createStyles(colors: ReturnType<typeof useMoviTheme>['colors']) { return StyleSheet.create({ stars: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 14 }, star: { fontSize: 42, color: '#A8B4B8' }, starActive: { color: colors.primary }, selected: { textAlign: 'center', color: colors.muted, fontWeight: '800' }, complimentSection: { gap: 8, marginTop: 10 }, complimentTitle: { color: colors.text, fontSize: 15, fontWeight: '900' }, complimentHint: { color: colors.muted, fontSize: 11, lineHeight: 17 }, compliments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }, compliment: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 99, backgroundColor: colors.surface, paddingHorizontal: 11, paddingVertical: 9 }, complimentSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, complimentIcon: { color: colors.primary, fontSize: 15, fontWeight: '900' }, complimentText: { color: colors.text, fontSize: 11, fontWeight: '700' }, complimentTextSelected: { color: colors.primary }, comment: { minHeight: 120, textAlignVertical: 'top', paddingTop: 14 } }); }
