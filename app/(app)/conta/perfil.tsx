import React from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { getProfile } from '@/features/perfil/profileService';
import { logout } from '@/features/auth/authService';
import { useMoviTheme, useThemeStyles } from '@/theme/ThemeProvider';
import { brl } from '@/utils/format';
import { enableRideNotifications, disableRideNotifications } from '@/notifications/notifications';

const menuItems = [
  { icon: 'history', title: 'Atividade', detail: 'Corridas e viagens', route: '/(app)/conta/historico' },
  { icon: 'lifebuoy', title: 'Ajuda', detail: 'Suporte MOVI', route: '/(app)/suporte' },
  { icon: 'credit-card-outline', title: 'Pagamentos', detail: 'Pagamentos e débitos', route: '/(app)/conta/debito' },
  { icon: 'file-document-outline', title: 'Documentos', detail: 'Documentos enviados', route: '/(app)/conta/documentos' },
  { icon: 'cog-outline', title: 'Configurações', detail: 'Tema e preferências', route: '/(app)/conta/configuracoes' },
  { icon: 'shield-check-outline', title: 'Termos', detail: 'Uso e privacidade', route: '/(public)/legal/passageiro' },
] as const;

export default function ProfileScreen() {
  const theme = useMoviTheme().colors;
  const styles = useThemeStyles(createStyles);
  const query = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const passenger = query.data?.passageiro;

  async function onLogout() {
    Alert.alert('Sair do MOVI', 'Sua sessão será encerrada neste aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void logout().then(() => router.replace('/(public)/login')) },
    ]);
  }

  if (query.isLoading) return <Screen title="Minha conta" loading />;
  if (query.isError || !passenger) return <Screen title="Minha conta"><Text style={styles.muted}>Não foi possível carregar seu perfil.</Text><Button title="Tentar novamente" onPress={() => void query.refetch()} /></Screen>;
  const initials = [passenger.nome?.[0] ?? '', passenger.sobrenome?.[0] ?? ''].join('').toUpperCase();
  const rating = Number(passenger.nota_media);

  return <Screen title="Minha conta">
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir detalhes do perfil" onPress={() => router.push('/(app)/conta/detalhes')}>
      <Card style={styles.profileCard}>
        <View style={styles.profileRow}>
          {passenger.foto_perfil_url
            ? <Image source={{ uri: passenger.foto_perfil_url }} style={styles.avatar} accessibilityLabel="Foto do passageiro" />
            : <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}><Text style={[styles.avatarText, { color: theme.primary }]}>{initials || 'M'}</Text></View>}
          <View style={styles.profileCopy}>
            <View style={styles.nameRow}><Text style={styles.name} numberOfLines={1}>{passenger.nome} {passenger.sobrenome}</Text>{passenger.conta_verificada ? <MaterialCommunityIcons name="check-decagram" size={19} color={theme.cyan} accessibilityLabel="Conta verificada" /> : null}</View>
            <View style={styles.ratingRow}><MaterialCommunityIcons name="star" size={16} color={theme.primary} /><Text style={styles.rating}>{rating > 0 ? rating.toFixed(2).replace('.', ',') : 'Sem avaliações'}</Text></View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={25} color={theme.muted} />
        </View>
      </Card>
    </Pressable>
    {passenger.debito_pendente && Number(passenger.debito_pendente) > 0 ? <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/conta/debito')}><Card style={styles.debtCard}><MaterialCommunityIcons name="alert-circle-outline" size={22} color={theme.danger} /><View style={styles.debtCopy}><Text style={styles.debtTitle}>Débito pendente</Text><Text style={styles.debtAmount}>{brl(passenger.debito_pendente)}</Text></View><MaterialCommunityIcons name="chevron-right" size={23} color={theme.muted} /></Card></Pressable> : null}
    <View style={styles.menuGrid}>
      {menuItems.map((item) => <Pressable key={item.title} accessibilityRole="button" accessibilityLabel={item.title + ': ' + item.detail} onPress={() => router.push(item.route)} style={({ pressed }) => [styles.menuItem, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.72 : 1 }]}>
        <View style={[styles.menuIconWrap, { backgroundColor: theme.primarySoft }]}><MaterialCommunityIcons name={item.icon as never} size={25} color={theme.primary} /></View>
        <Text style={styles.menuTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.menuDetail} numberOfLines={2}>{item.detail}</Text>
      </Pressable>)}
    </View>
    <Text style={styles.sectionTitle}>Outros recursos</Text>
    <Card style={styles.resources}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/conta/senha')} style={styles.resourceRow}><MaterialCommunityIcons name="lock-reset" size={22} color={theme.text} /><Text style={styles.resourceText}>Alterar senha</Text><MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} /></Pressable>
      <View style={[styles.resourceDivider, { backgroundColor: theme.border }]} />
      <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/conta/configuracoes')} style={styles.resourceRow}><MaterialCommunityIcons name="bell-outline" size={22} color={theme.text} /><Text style={styles.resourceText}>Avisos da viagem</Text><MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} /></Pressable>
    </Card>
    <Card style={styles.notifications}><Text style={styles.sectionTitle}>Notificações</Text><Text style={styles.muted}>Controle os avisos de corrida neste aparelho.</Text><Button title="Ativar notificações" variant="secondary" onPress={() => void enableRideNotifications().then(() => Alert.alert('Notificações ativadas', 'Este aparelho foi registrado para receber avisos do MOVI.')).catch((error) => Alert.alert('Notificações', error instanceof Error ? error.message : 'Não foi possível ativar notificações.'))} /><Button title="Desativar neste aparelho" variant="secondary" onPress={() => void disableRideNotifications().then(() => Alert.alert('Notificações desativadas', 'Este aparelho não receberá novos avisos do MOVI.')).catch((error) => Alert.alert('Notificações', error instanceof Error ? error.message : 'Não foi possível atualizar esta configuração.'))} /></Card>
    <Button title="Sair da conta" variant="danger" onPress={onLogout} />
  </Screen>;
}

function createStyles(colors: ReturnType<typeof useMoviTheme>['colors']) { return StyleSheet.create({
  profileCard: { padding: 15 }, profileRow: { flexDirection: 'row', alignItems: 'center', gap: 13 }, avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, resizeMode: 'cover' }, avatarFallback: { alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 19, fontWeight: '900' }, profileCopy: { flex: 1, gap: 8 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, name: { flexShrink: 1, fontSize: 16, fontWeight: '900', color: colors.text }, ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, rating: { color: colors.text, fontSize: 13, fontWeight: '700' },
  debtCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 }, debtCopy: { flex: 1, gap: 3 }, debtTitle: { color: colors.text, fontSize: 12, fontWeight: '800' }, debtAmount: { color: colors.danger, fontSize: 14, fontWeight: '900' },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }, menuItem: { width: '31.8%', minHeight: 112, borderWidth: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, paddingVertical: 11, gap: 7 }, menuIconWrap: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, menuTitle: { color: colors.text, fontSize: 11, fontWeight: '800', textAlign: 'center' }, menuDetail: { color: colors.muted, fontSize: 9, lineHeight: 12, textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.text }, resources: { paddingVertical: 0, paddingHorizontal: 14 }, resourceRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 }, resourceText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' }, resourceDivider: { height: StyleSheet.hairlineWidth }, notifications: { gap: 10 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
}); }
