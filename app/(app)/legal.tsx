import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { getPublicLegal, acceptLegal } from '@/features/legal/legalService';
import { useAuthStore } from '@/store/authStore';
import { colors } from '@/theme/colors';

export default function LegalAcceptanceScreen() {
  const query = useQuery({ queryKey: ['public-legal', 'passageiro'], queryFn: getPublicLegal });
  const [loading, setLoading] = useState(false);
  async function submit() {
    if (!query.data?.documentos.length) return;
    setLoading(true);
    try {
      await acceptLegal(query.data.documentos.map((doc) => ({ documento_tipo: doc.documentoTipo, versao: doc.versao })));
      useAuthStore.getState().setRequiresLegalConsent(false);
      await query.refetch();
      router.replace('/(app)/home');
    } catch (error) { Alert.alert('Não foi possível registrar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setLoading(false); }
  }
  return <Screen title="Atualização dos documentos legais" subtitle="Para continuar usando recursos da conta, confirme os documentos vigentes.">
    {query.isLoading ? <Text>Carregando documentos…</Text> : null}
    {query.isError ? <Button title="Tentar novamente" onPress={() => void query.refetch()} /> : null}
    {query.data?.documentos.map((doc) => <Card key={`${doc.documentoTipo}-${doc.versao}`}><Text style={styles.title}>{doc.titulo ?? doc.documentoTipo}</Text><Text style={styles.version}>Versão {doc.versao}</Text><Text style={styles.content}>{doc.conteudo}</Text></Card>)}
    <Button title="Li e aceito os documentos vigentes" onPress={() => void submit()} loading={loading} disabled={!query.data?.documentos.length} />
  </Screen>;
}

const styles = StyleSheet.create({ title: { fontSize: 18, fontWeight: '900', color: colors.text }, version: { color: colors.muted, marginTop: 4 }, content: { color: colors.text, lineHeight: 21, marginTop: 12, fontSize: 13 } });
