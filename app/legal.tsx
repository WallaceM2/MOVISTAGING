import React, { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { AppButton, Surface } from "@/components/ui";
import { acceptLegal, getPublicDriverLegal } from "@/features/legal/legalService";
import { palette } from "@/theme";
import { useAuthStore } from "@/store/authStore";

export default function LegalScreen() {
  const query = useQuery({ queryKey: ["public-legal", "motorista"], queryFn: getPublicDriverLegal });
  const [saving, setSaving] = useState(false);
  const authenticated = useAuthStore((state) => Boolean(state.accessToken));
  async function accept() {
    if (!query.data?.documentos.length) return;
    setSaving(true);
    try {
      await acceptLegal(query.data.documentos.map((doc) => ({ documento_tipo: doc.documentoTipo, versao: doc.versao })));
      Alert.alert("Aceite registrado", "Os documentos vigentes foram associados à sua conta.");
    } catch (error) {
      Alert.alert("Não foi possível registrar", error instanceof Error ? error.message : "Tente novamente.");
    } finally { setSaving(false); }
  }
  return <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Documentos MOVI</Text><Text style={styles.subtitle}>Leia os documentos oficiais vigentes para motoristas parceiros.</Text>
    {query.isLoading ? <ActivityIndicator color={palette.forest} /> : null}
    {query.isError ? <Text style={styles.error}>Não foi possível carregar os documentos. Verifique a conexão e tente novamente.</Text> : null}
    {query.data?.documentos.map((document) => <Surface key={`${document.documentoTipo}-${document.versao}`} style={styles.card}><Text style={styles.cardTitle}>{document.titulo}</Text><Text style={styles.version}>Versão {document.versao}</Text><Text selectable style={styles.document}>{document.conteudo}</Text></Surface>)}
    {authenticated && query.data?.documentos.length ? <AppButton title="Li e aceito os documentos vigentes" loading={saving} onPress={() => void accept()} /> : null}
    <View style={styles.notice}><Text style={styles.noticeText}>O conteúdo é retornado pelo Backend MOVI V3 e o aceite é registrado junto à versão e ao resumo criptográfico do documento.</Text></View>
  </ScrollView>;
}

const styles = StyleSheet.create({ flex: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, paddingTop: 35, paddingBottom: 45, gap: 14 }, title: { fontSize: 27, color: palette.ink, fontWeight: "900" }, subtitle: { color: palette.muted, lineHeight: 21 }, card: { gap: 8 }, cardTitle: { fontSize: 17, fontWeight: "900", color: palette.ink }, version: { fontSize: 11, color: palette.muted, fontWeight: "700" }, document: { fontSize: 12, lineHeight: 19, color: palette.inkSoft }, error: { color: palette.red }, notice: { padding: 10 }, noticeText: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "center" } });
