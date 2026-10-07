import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { AppButton, Field, Surface } from "@/components/ui";
import { changePassword } from "@/features/motorista/motoristaService";
import { logout } from "@/features/auth/authService";
import { disconnectSocket } from "@/realtime/socket";
import { palette } from "@/theme";

export default function ChangePasswordScreen() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit() {
    if (!current || next.length < 8) return Alert.alert("Senha inválida", "Informe sua senha atual e uma nova senha com pelo menos 8 caracteres.");
    if (next !== confirmation) return Alert.alert("Confirmação diferente", "A nova senha e a confirmação precisam ser iguais.");
    if (next === current) return Alert.alert("Escolha outra senha", "A nova senha precisa ser diferente da atual.");
    setLoading(true);
    try {
      const result = await changePassword(current, next);
      await logout().catch(() => undefined);
      disconnectSocket();
      Alert.alert("Senha alterada", result.mensagem, [{ text: "Entrar novamente", onPress: () => router.replace("/login") }]);
    } catch (error) {
      Alert.alert("Não foi possível alterar", error instanceof Error ? error.message : "Confira a senha atual e tente novamente.");
    } finally { setLoading(false); }
  }
  return <ScrollView style={styles.flex} contentContainerStyle={styles.content}><Text style={styles.title}>Alterar senha</Text><Text style={styles.subtitle}>Use uma senha exclusiva para sua conta MOVI. Nunca compartilhe esse código com ninguém.</Text><Surface style={styles.card}><Field label="SENHA ATUAL" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" textContentType="password" /><Field label="NOVA SENHA" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" textContentType="newPassword" /><Field label="CONFIRMAR NOVA SENHA" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" textContentType="newPassword" /></Surface><AppButton title="Salvar nova senha" onPress={() => void submit()} loading={loading} /><Text style={styles.notice}>Após a alteração, o backend encerra sessões anteriores. Você entrará novamente com a nova senha.</Text></ScrollView>;
}
const styles = StyleSheet.create({ flex: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, paddingTop: 35, paddingBottom: 45, gap: 14 }, title: { fontSize: 27, fontWeight: "900", color: palette.ink }, subtitle: { color: palette.muted, fontSize: 13, lineHeight: 20 }, card: { gap: 15 }, notice: { color: palette.muted, fontSize: 11, textAlign: "center", lineHeight: 17, paddingHorizontal: 12 } });
