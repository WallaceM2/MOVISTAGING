import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { getProfile } from '@/features/perfil/profileService';
import { useMoviTheme, useThemeStyles } from '@/theme/ThemeProvider';

export default function PassengerDetailsScreen() {
  const theme = useMoviTheme().colors;
  const styles = useThemeStyles(createStyles);
  const query = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const passenger = query.data?.passageiro;
  if (query.isLoading) return <Screen title="Meu perfil" loading />;
  if (query.isError || !passenger) return <Screen title="Meu perfil"><Text style={styles.copy}>Não foi possível carregar seus dados.</Text></Screen>;

  const rating = Number(passenger.nota_media);
  const rows = [
    { icon: 'account-outline', label: 'Nome', value: passenger.nome },
    { icon: 'account-outline', label: 'Sobrenome', value: passenger.sobrenome },
    { icon: 'phone-outline', label: 'Telefone', value: passenger.telefone || 'Não informado' },
    { icon: 'email-outline', label: 'E-mail', value: passenger.email },
  ];

  return <Screen title="Meu perfil" subtitle="Consulte as informações da sua conta.">
    <View style={styles.hero}>
      {passenger.foto_perfil_url ? <Image source={{ uri: passenger.foto_perfil_url }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}><MaterialCommunityIcons name="account" size={42} color={theme.primary} /></View>}
      <View style={styles.ratingPill}><MaterialCommunityIcons name="star" size={17} color={theme.primary} /><Text style={styles.rating}>{rating > 0 ? rating.toFixed(2).replace('.', ',') : 'Sem avaliações'}</Text></View>
      {passenger.conta_verificada ? <View style={styles.verified}><MaterialCommunityIcons name="check-decagram" size={17} color={theme.cyan} /><Text style={styles.verifiedText}>Conta verificada</Text></View> : null}
    </View>
    <Card style={styles.fields}>
      {rows.map((row, index) => <View key={row.label} style={[styles.row, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}><MaterialCommunityIcons name={row.icon as never} size={20} color={theme.muted} /><Text style={styles.label}>{row.label}</Text><Text style={styles.value} numberOfLines={1}>{row.value}</Text></View>)}
    </Card>
  </Screen>;
}

function createStyles(colors: ReturnType<typeof useMoviTheme>['colors']) { return StyleSheet.create({
  hero: { alignItems: 'center', gap: 12, paddingTop: 5, paddingBottom: 7 }, avatar: { width: 112, height: 112, borderRadius: 56, borderWidth: 2, borderColor: colors.border }, avatarFallback: { alignItems: 'center', justifyContent: 'center' }, ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 99, backgroundColor: colors.surface }, rating: { color: colors.text, fontSize: 15, fontWeight: '800' }, verified: { flexDirection: 'row', alignItems: 'center', gap: 6 }, verifiedText: { color: colors.cyan, fontSize: 12, fontWeight: '800' },
  fields: { paddingHorizontal: 15, paddingVertical: 0 }, row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10 }, label: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' }, value: { maxWidth: '52%', color: colors.muted, fontSize: 13 }, copy: { color: colors.muted, fontSize: 13 },
}); }
