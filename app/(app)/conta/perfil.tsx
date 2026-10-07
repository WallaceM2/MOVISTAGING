import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { getProfile } from '@/features/perfil/profileService';
import { logout } from '@/features/auth/authService';
import { colors } from '@/theme/colors';
import { brl } from '@/utils/format';
import { enableRideNotifications, disableRideNotifications } from '@/notifications/notifications';

export default function ProfileScreen() {
  const query = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const passenger = query.data?.passageiro;

  async function onLogout() {
    Alert.alert('Sair do MOVI', 'Sua sessão será encerrada neste aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void logout().then(() => router.replace('/(public)/login')) },
    ]);
  }

  if (query.isLoading) return <Screen title="Minha conta" loading />;
  if (query.isError || !passenger) return <Screen title="Minha conta"><Text>Não foi possível carregar seu perfil.</Text><Button title="Tentar novamente" onPress={() => void query.refetch()} /></Screen>;

  return <Screen title="Minha conta" subtitle="Dados e recursos da sua conta MOVI.">
    <Card>
      <Text style={styles.name}>{passenger.nome} {passenger.sobrenome}</Text>
      <Text style={styles.meta}>{passenger.email}</Text>
      <Text style={styles.meta}>{passenger.telefone ?? 'Telefone não informado'}</Text>
      <Text style={styles.status}>Conta: {passenger.status_conta}</Text>
      {passenger.debito_pendente && Number(passenger.debito_pendente) > 0 ? <Text style={styles.debt}>Débito pendente: {brl(passenger.debito_pendente)}</Text> : null}
    </Card>
    <Card><Text style={styles.sectionTitle}>Avisos da viagem</Text><Text style={styles.meta}>Receba atualizações da corrida quando o app estiver em segundo plano.</Text><Button title="Ativar notificações" variant="secondary" onPress={() => void enableRideNotifications().then(() => Alert.alert('Notificações ativadas', 'Este aparelho foi registrado para receber avisos do MOVI.')).catch((error) => Alert.alert('Notificações', error instanceof Error ? error.message : 'Não foi possível ativar notificações.'))} /><Button title="Desativar neste aparelho" variant="secondary" onPress={() => void disableRideNotifications().then(() => Alert.alert('Notificações desativadas', 'Este aparelho não receberá novos avisos do MOVI.')).catch((error) => Alert.alert('Notificações', error instanceof Error ? error.message : 'Não foi possível atualizar esta configuração.'))} /></Card>
    <View style={styles.grid}>
      <Button title="Histórico" variant="secondary" compact onPress={() => router.push('/(app)/conta/historico')} />
      <Button title="Documentos" variant="secondary" compact onPress={() => router.push('/(app)/conta/documentos')} />
      <Button title="Extrato / débito" variant="secondary" compact onPress={() => router.push('/(app)/conta/debito')} />
      <Button title="Alterar senha" variant="secondary" compact onPress={() => router.push('/(app)/conta/senha')} />
    </View>
    <Button title="Termos e privacidade" variant="secondary" onPress={() => router.push('/(public)/legal/passageiro')} />
    <Button title="Sair" variant="danger" onPress={onLogout} />
  </Screen>;
}

const styles = StyleSheet.create({
  name: { fontSize: 23, fontWeight: '900', color: colors.text },
  meta: { marginTop: 6, color: colors.muted },
  status: { marginTop: 14, color: colors.text, fontWeight: '800' },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  debt: { marginTop: 8, color: colors.danger, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
