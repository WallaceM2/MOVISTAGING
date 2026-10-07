import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { getProfile } from '@/features/perfil/profileService';
import { settleDebt } from '@/features/perfil/debtService';
import { brl } from '@/utils/format';
import { colors } from '@/theme/colors';

export default function DebtScreen() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const [loading, setLoading] = useState(false);
  const debt = Number(profile.data?.passageiro.debito_pendente ?? 0);
  async function settle() {
    setLoading(true);
    try {
      await settleDebt();
      await profile.refetch();
      Alert.alert('Quitação', 'O backend informou o resultado da operação.');
    } catch (error) { Alert.alert('Quitação indisponível', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setLoading(false); }
  }
  if (profile.isLoading) return <Screen title="Extrato e débito" loading />;
  return <Screen title="Extrato e débito" subtitle="Resumo financeiro da sua conta de passageiro."><Card><Text style={styles.label}>Débito pendente</Text><Text style={styles.value}>{brl(debt)}</Text>{debt > 0 ? <Button title="Tentar quitar débito" onPress={() => void settle()} loading={loading} /> : <Text style={styles.ok}>Não há débito pendente.</Text>}</Card><Card><Text style={styles.note}>Neste V3, a quitação automática ainda depende de integração real com o provedor de pagamentos. O app não informa uma quitação como concluída sem confirmação do backend.</Text></Card></Screen>;
}
const styles = StyleSheet.create({ label: { color: colors.muted }, value: { fontSize: 34, fontWeight: '900', color: colors.text, marginVertical: 12 }, ok: { color: colors.success, fontWeight: '800' }, note: { color: colors.muted, lineHeight: 20 } });
