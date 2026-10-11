import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { getProfile } from '@/features/perfil/profileService';
import { brl } from '@/utils/format';
import { colors } from '@/theme/colors';

export default function DebtScreen() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const debt = Number(profile.data?.passageiro.debito_pendente ?? 0);
  if (profile.isLoading) return <Screen title="Extrato e débito" loading />;
  return <Screen title="Extrato e débito" subtitle="Resumo financeiro da sua conta de passageiro."><Card><Text style={styles.label}>Débito pendente</Text><Text style={styles.value}>{brl(debt)}</Text>{debt >= 10 ? <Text style={styles.debtNotice}>Novas corridas estão bloqueadas até a quitação do débito.</Text> : debt > 0 ? <Text style={styles.note}>Ao atingir R$ 10,00 em aberto, novas solicitações serão bloqueadas até a quitação.</Text> : <Text style={styles.ok}>Não há débito pendente.</Text>}</Card>{debt > 0 ? <Card><Text style={styles.note}>A quitação pelo app ainda não está disponível. O saldo só será baixado após a confirmação de um pagamento.</Text></Card> : null}</Screen>;
}
const styles = StyleSheet.create({ label: { color: colors.muted }, value: { fontSize: 34, fontWeight: '900', color: colors.text, marginVertical: 12 }, ok: { color: colors.success, fontWeight: '800' }, note: { color: colors.muted, lineHeight: 20 }, debtNotice: { color: colors.danger, fontWeight: '800', lineHeight: 20 } });
