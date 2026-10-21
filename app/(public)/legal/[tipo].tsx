import React from 'react';
import { Stack } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useQuery } from '@tanstack/react-query';
import { getPublicLegal } from '@/features/legal/legalService';
import { Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';

function formatLegalContent(content: string) { return content.replace(/^#{1,6}\s*/gm, '').replace(/\*\*(.*?)\*\*/g, (match, inner) => inner).replace(/^\s*[-*]\s+/gm, '• ').replace(/\n{3,}/g, '\n\n').trim(); }
export default function LegalScreen() {
  const query = useQuery({ queryKey: ['public-legal', 'passageiro'], queryFn: getPublicLegal });
  return <><Stack.Screen options={{ headerShown: true, title: 'Documentos legais' }} /><Screen title="Documentos legais" subtitle="Versões vigentes publicadas pelo MOVI." loading={query.isLoading}>{query.data?.documentos.map((doc) => <Text key={`${doc.documentoTipo}-${doc.versao}`} style={styles.body}>{doc.titulo ?? doc.documentoTipo}\n\n{formatLegalContent(doc.conteudo ?? '')}</Text>)}</Screen></>;
}
const styles = StyleSheet.create({ body: { color: colors.text, lineHeight: 23, fontSize: 14 } });



