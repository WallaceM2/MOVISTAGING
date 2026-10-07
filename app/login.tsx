import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { AppButton, Field } from "@/components/ui";
import { login } from "@/features/auth/authService";
import { palette } from "@/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password) return Alert.alert("Acesso", "Informe seu e-mail e sua senha.");
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/(app)/home");
    } catch (error) {
      Alert.alert("Não foi possível entrar", error instanceof Error ? error.message : "Confira seus dados e tente novamente.");
    } finally { setLoading(false); }
  }

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.brand}><View style={styles.mark}><Text style={styles.markText}>M</Text></View><Text style={styles.wordmark}>MOVI<Text style={styles.wordmarkDot}>.</Text></Text><Text style={styles.partner}>MOTORISTA PARCEIRO</Text></View>
      <View style={styles.intro}><Text style={styles.eyebrow}>SEU TRABALHO, NO SEU RITMO</Text><Text style={styles.title}>Bom ter você{`\n`}de volta.</Text><Text style={styles.description}>Acesse sua área segura para dirigir, acompanhar corridas e organizar seus ganhos.</Text></View>
      <View style={styles.form}><Field label="E-MAIL" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" /><Field label="SENHA" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" returnKeyType="done" onSubmitEditing={() => void submit()} /><AppButton title="Entrar com segurança" loading={loading} onPress={() => void submit()} /></View>
      <View style={styles.bottom}><Text style={styles.note}>Ainda não é parceiro?</Text><Link href="/cadastro" style={styles.link}>Quero dirigir com o MOVI</Link></View>
      <Text style={styles.legal}>Seus dados são protegidos. O MOVI nunca pede sua senha por telefone ou mensagem.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ flex: { flex: 1, backgroundColor: palette.paper }, scroll: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 58, paddingBottom: 32, justifyContent: "center", gap: 35 }, brand: { alignItems: "center", gap: 4 }, mark: { width: 48, height: 48, borderRadius: 17, backgroundColor: palette.forest, alignItems: "center", justifyContent: "center", marginBottom: 7 }, markText: { fontSize: 28, fontWeight: "900", color: palette.lime }, wordmark: { fontSize: 30, fontWeight: "900", letterSpacing: -1.5, color: palette.ink }, wordmarkDot: { color: palette.forest }, partner: { fontSize: 9, fontWeight: "900", color: palette.muted, letterSpacing: 2.1 }, intro: { gap: 11 }, eyebrow: { color: palette.forest, fontSize: 10, letterSpacing: 1.6, fontWeight: "900" }, title: { fontSize: 38, lineHeight: 42, color: palette.ink, fontWeight: "900", letterSpacing: -1 }, description: { color: palette.muted, fontSize: 15, lineHeight: 23, maxWidth: 320 }, form: { gap: 16 }, bottom: { flexDirection: "row", justifyContent: "center", gap: 6, flexWrap: "wrap" }, note: { color: palette.muted, fontSize: 14 }, link: { color: palette.forest, fontSize: 14, fontWeight: "900" }, legal: { color: palette.muted, fontSize: 11, textAlign: "center", lineHeight: 17, paddingHorizontal: 12 } });
