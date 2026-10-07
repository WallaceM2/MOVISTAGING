import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { getProfile } from '@/features/perfil/profileService';
import { getPassengerDocumentUrl, uploadPassengerDocuments, type PassengerDocumentType } from '@/features/documentos/documentosService';
import { colors } from '@/theme/colors';

export default function DocumentsScreen() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const [loading, setLoading] = useState<PassengerDocumentType | null>(null);
  const [viewerLoading, setViewerLoading] = useState<PassengerDocumentType | null>(null);
  const passenger = profile.data?.passageiro;

  async function pick(document: PassengerDocumentType) {
    setLoading(document);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82, allowsEditing: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const name = asset.fileName ?? `${document}-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      await uploadPassengerDocuments({ [document]: { uri: asset.uri, name, mimeType } });
      await profile.refetch();
      Alert.alert('Enviado', 'O arquivo foi recebido pelo MOVI.');
    } catch (error) { Alert.alert('Não foi possível enviar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setLoading(null); }
  }

  async function view(document: PassengerDocumentType) {
    if (!passenger) return;
    setViewerLoading(document);
    try {
      const result = await getPassengerDocumentUrl(passenger.id, document);
      Alert.alert('Documento privado', `URL temporária gerada com validade aproximada de ${result.expires_in} segundos.`, [{ text: 'Fechar' }]);
    } catch (error) { Alert.alert('Não foi possível abrir', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setViewerLoading(null); }
  }

  if (profile.isLoading) return <Screen title="Documentos" loading />;
  return <Screen title="Meus documentos" subtitle="Os arquivos são enviados ao armazenamento privado do MOVI.">
    <DocumentRow label="RG" present={Boolean(passenger?.rg)} document="rg" loading={loading} viewerLoading={viewerLoading} onUpload={pick} onView={view} />
    <DocumentRow label="CNH" present={Boolean(passenger?.cnh)} document="cnh" loading={loading} viewerLoading={viewerLoading} onUpload={pick} onView={view} />
    <DocumentRow label="Foto de perfil" present={Boolean(passenger?.foto_perfil_url)} document="foto_perfil" loading={loading} viewerLoading={viewerLoading} onUpload={pick} onView={view} />
    <Card><Text style={styles.note}>O backend V3 aceita RG, CNH e foto de perfil para passageiro. O app nunca armazena uma chave privada do Supabase.</Text></Card>
  </Screen>;
}

function DocumentRow({ label, present, document, loading, viewerLoading, onUpload, onView }: { label: string; present: boolean; document: PassengerDocumentType; loading: PassengerDocumentType | null; viewerLoading: PassengerDocumentType | null; onUpload: (document: PassengerDocumentType) => void; onView: (document: PassengerDocumentType) => void }) {
  return <Card><View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.title}>{label}</Text><Text style={styles.status}>{present ? 'Documento cadastrado' : 'Ainda não enviado'}</Text></View><Button title={present ? 'Atualizar' : 'Enviar'} compact onPress={() => onUpload(document)} loading={loading === document} /></View>{present ? <Button title="Gerar acesso temporário" variant="secondary" compact onPress={() => onView(document)} loading={viewerLoading === document} /> : null}</Card>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 12, alignItems: 'center' }, title: { fontSize: 17, fontWeight: '900', color: colors.text }, status: { color: colors.muted, marginTop: 5 }, note: { color: colors.muted, lineHeight: 19, fontSize: 13 } });
