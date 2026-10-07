import React, { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppButton, Surface } from "@/components/ui";
import { getDriverDocumentUrl, getDriverProfile, uploadDriverDocuments, type DriverDocument } from "@/features/motorista/motoristaService";
import { palette } from "@/theme";

const rows: Array<{ key: DriverDocument; title: string; description: string; field: "rg_foto_url" | "cnh_foto_url" | "foto_perfil_url" | "documento_veiculo_url" }> = [
  { key: "cnh", title: "CNH", description: "Fotografe os dois lados com dados legíveis.", field: "cnh_foto_url" },
  { key: "documento_veiculo", title: "Documento do veículo", description: "Envie o documento solicitado pela equipe de análise.", field: "documento_veiculo_url" },
  { key: "rg", title: "RG", description: "Envie uma imagem legível do documento de identidade.", field: "rg_foto_url" },
  { key: "foto_perfil", title: "Foto de perfil", description: "Use uma foto atual, frontal e com boa iluminação.", field: "foto_perfil_url" },
];

export default function DriverDocumentsScreen() {
  const profile = useQuery({ queryKey: ["driver-profile"], queryFn: getDriverProfile });
  const [working, setWorking] = useState<DriverDocument | null>(null);

  async function upload(document: DriverDocument) {
    setWorking(document);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error("Permita o acesso às fotos para selecionar o documento.");
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.82, allowsEditing: true });
      if (result.canceled || !result.assets[0]) return;
      const file = result.assets[0];
      if (file.fileSize && file.fileSize > 5 * 1024 * 1024) throw new Error("O arquivo precisa ter até 5 MB. Escolha uma imagem mais leve.");
      if (file.mimeType && !["image/jpeg", "image/png"].includes(file.mimeType)) throw new Error("Envie a imagem em formato JPG ou PNG.");
      await uploadDriverDocuments({ [document]: { uri: file.uri, name: file.fileName ?? `${document}-${Date.now()}.jpg`, mimeType: file.mimeType ?? "image/jpeg" } });
      await profile.refetch();
      Alert.alert("Documento enviado", "O MOVI recebeu o arquivo. A aprovação ocorre após a análise documental.");
    } catch (error) {
      Alert.alert("Não foi possível enviar", error instanceof Error ? error.message : "Tente novamente.");
    } finally { setWorking(null); }
  }

  async function view(document: DriverDocument) {
    const driver = profile.data;
    if (!driver) return;
    setWorking(document);
    try {
      const result = await getDriverDocumentUrl(driver.id, document);
      await Linking.openURL(result.url);
    } catch (error) {
      Alert.alert("Não foi possível abrir", error instanceof Error ? error.message : "Tente novamente.");
    } finally { setWorking(null); }
  }

  return <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Documentos</Text><Text style={styles.subtitle}>Os arquivos ficam em armazenamento privado e só podem ser acessados por links temporários autorizados.</Text>
    {rows.map((row) => {
      const present = Boolean(profile.data?.[row.field]);
      return <Surface key={row.key} style={styles.card}><View style={styles.row}><View style={styles.icon}><MaterialCommunityIcons name={present ? "file-check-outline" : "file-upload-outline"} size={21} color={present ? palette.forest : palette.muted} /></View><View style={styles.info}><Text style={styles.cardTitle}>{row.title}</Text><Text style={styles.copy}>{row.description}</Text><Text style={[styles.status, present ? styles.received : styles.pending]}>{present ? "Arquivo recebido" : "Aguardando envio"}</Text></View></View><View style={styles.actions}><AppButton title={present ? "Atualizar arquivo" : "Enviar arquivo"} onPress={() => void upload(row.key)} loading={working === row.key} disabled={Boolean(working && working !== row.key)} /><AppButton title="Abrir temporariamente" secondary onPress={() => void view(row.key)} disabled={!present || Boolean(working)} /></View></Surface>;
    })}
    <Surface style={styles.infoCard}><Text style={styles.infoTitle}>Análise e aprovação</Text><Text style={styles.copy}>A equipe MOVI verifica identidade, CNH, veículo, categoria e requisitos locais. Um envio novo pode reiniciar a análise da CNH ou do documento veicular.</Text></Surface>
  </ScrollView>;
}

const styles = StyleSheet.create({ flex: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, paddingTop: 30, paddingBottom: 45, gap: 13 }, title: { fontSize: 28, color: palette.ink, fontWeight: "900" }, subtitle: { fontSize: 13, lineHeight: 19, color: palette.muted, marginBottom: 2 }, card: { gap: 14 }, row: { flexDirection: "row", gap: 12 }, icon: { width: 40, height: 40, borderRadius: 14, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" }, info: { flex: 1, gap: 4 }, cardTitle: { color: palette.ink, fontSize: 14, fontWeight: "900" }, copy: { color: palette.muted, fontSize: 11, lineHeight: 16 }, status: { fontSize: 10, fontWeight: "900", marginTop: 3 }, received: { color: palette.forest }, pending: { color: palette.amber }, actions: { gap: 8 }, infoCard: { backgroundColor: palette.ink, borderColor: palette.ink, gap: 7 }, infoTitle: { color: "white", fontWeight: "900", fontSize: 14 } });
