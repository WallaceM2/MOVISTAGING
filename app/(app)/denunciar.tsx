import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AppButton, Field, Page, Surface } from "@/components/ui";
import { reportPassenger } from "@/features/corrida/corridaService";
import { palette } from "@/theme";

const reasons = [
  ["direcao_perigosa", "Direção perigosa"],
  ["assedio", "Assédio"],
  ["agressao", "Agressão"],
  ["roubo", "Roubo"],
  ["fraude", "Fraude"],
  ["outro", "Outro problema"],
] as const;

export default function DriverReportScreen() {
  const params = useLocalSearchParams<{ corridaId?: string; passageiroId?: string }>();
  const rideId = Number(params.corridaId);
  const passengerId = Number(params.passageiroId);
  const [reason, setReason] = useState<(typeof reasons)[number][0] | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!Number.isSafeInteger(rideId) || rideId < 1 || !Number.isSafeInteger(passengerId) || passengerId < 1) {
      Alert.alert("Corrida inválida", "Volte para a corrida e abra o relato novamente.");
      return;
    }
    if (!reason) {
      Alert.alert("Selecione um motivo", "Escolha a categoria que melhor descreve o ocorrido.");
      return;
    }
    setBusy(true);
    try {
      const result = await reportPassenger({ rideId, passengerId, motivo: reason, descricao: description.slice(0, 2000) });
      Alert.alert("Relato enviado", result.mensagem, [{ text: "Concluir", onPress: () => router.replace("/(app)/home") }]);
    } catch (error) {
      Alert.alert("Não foi possível enviar", error instanceof Error ? error.message : "Tente novamente quando a conexão estiver disponível.");
    } finally {
      setBusy(false);
    }
  }

  return <Page>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>SEGURANÇA MOVI</Text>
      <Text style={styles.title}>Relatar problema</Text>
      <Text style={styles.subtitle}>Este relato fica associado à corrida e é enviado para análise. Em situação de perigo imediato, procure os serviços de emergência locais.</Text>
      <Surface style={styles.form}>
        <Text style={styles.label}>O que aconteceu?</Text>
        <View style={styles.options}>
          {reasons.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: reason === value }} onPress={() => setReason(value)} style={[styles.option, reason === value && styles.optionSelected]}><Text style={[styles.optionText, reason === value && styles.optionTextSelected]}>{label}</Text></Pressable>)}
        </View>
        <Field label="Detalhes (opcional)" value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="Descreva o que aconteceu. Não inclua dados de cartão ou senhas." />
        <Text style={styles.counter}>{description.length}/2000</Text>
        <AppButton title="Enviar relato para análise" onPress={() => void submit()} loading={busy} disabled={!reason} />
        <AppButton title="Voltar" onPress={() => router.back()} secondary disabled={busy} />
      </Surface>
    </ScrollView>
  </Page>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 22, paddingBottom: 40, gap: 10 },
  eyebrow: { color: palette.forest, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: palette.ink, fontSize: 27, fontWeight: "900" },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 20, marginBottom: 6 },
  form: { gap: 14 },
  label: { color: palette.ink, fontSize: 13, fontWeight: "900" },
  options: { gap: 8 },
  option: { minHeight: 46, justifyContent: "center", paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
  optionSelected: { borderColor: palette.forest, backgroundColor: palette.mint },
  optionText: { color: palette.ink, fontSize: 13, fontWeight: "700" },
  optionTextSelected: { color: palette.forest, fontWeight: "900" },
  counter: { color: palette.muted, fontSize: 10, textAlign: "right", marginTop: -10 },
});
