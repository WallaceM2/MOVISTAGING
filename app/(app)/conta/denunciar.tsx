import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { createReport } from '@/features/denuncia/denunciaService';
import type { ReportInput } from '@/types/api';
import { colors } from '@/theme/colors';

const reasons: Array<{ value: ReportInput['motivo']; label: string }> = [
  { value: 'direcao_perigosa', label: 'Direção perigosa' },
  { value: 'assedio', label: 'Assédio' },
  { value: 'agressao', label: 'Agressão' },
  { value: 'roubo', label: 'Roubo' },
  { value: 'fraude', label: 'Fraude' },
  { value: 'outro', label: 'Outro' },
];

export default function ReportScreen() {
  const { id, motoristaId } = useLocalSearchParams<{ id: string; motoristaId?: string }>();
  const [reason, setReason] = useState<ReportInput['motivo']>('outro');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit() {
    const rideId = Number(id); const driverId = Number(motoristaId);
    if (!Number.isInteger(rideId) || !Number.isInteger(driverId) || driverId <= 0) return Alert.alert('Denúncia indisponível', 'Não foi possível identificar o motorista desta corrida.');
    setLoading(true);
    try {
      const descricao = description.trim();await createReport({corrida_id: rideId,denunciado_id: driverId,motivo: reason,...(descricao ? { descricao } : {}),});
      Alert.alert('Relato enviado', 'A ocorrência foi registrada para análise.', [{ text: 'Concluir', onPress: () => router.replace('/(app)/home') }]);
    } catch (error) { Alert.alert('Não foi possível enviar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setLoading(false); }
  }
  return <Screen title="Relatar um problema" subtitle="Informe apenas o que aconteceu. Seu relato fica associado à corrida.">
    {reasons.map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ selected: reason === item.value }} onPress={() => setReason(item.value)} style={[styles.option, reason === item.value && styles.selected]}><Text style={styles.optionText}>{reason === item.value ? '● ' : '○ '}{item.label}</Text></Pressable>)}
    <Input label="Descrição (opcional)" value={description} onChangeText={setDescription} multiline maxLength={2000} style={styles.description} />
    <Button title="Enviar relato" onPress={() => void submit()} loading={loading} />
    <Text style={styles.note}>Em casos graves, procure também os serviços públicos de emergência adequados à situação.</Text>
  </Screen>;
}
const styles = StyleSheet.create({ option: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, backgroundColor: colors.surface }, selected: { borderColor: colors.text, backgroundColor: colors.primarySoft }, optionText: { color: colors.text, fontWeight: '700' }, description: { minHeight: 140, textAlignVertical: 'top', paddingTop: 14 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' } });
