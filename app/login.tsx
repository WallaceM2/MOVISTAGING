import React, { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { AppButton, Field } from "@/components/ui";
import { login } from "@/features/auth/authService";
import type { DriverPalette } from "@/theme";
import { useMoviTheme, useThemeStyles } from "@/theme/ThemeProvider";

export default function LoginScreen() {
  const { colors: palette } = useMoviTheme();
  const styles = useThemeStyles(createStyles);
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
      <View style={styles.brand}><Image source={require("../assets/movi-logo-oficial.png")} style={styles.mark} resizeMode="contain" accessibilityLabel="Símbolo MOVI" /><Text style={styles.wordmark}>MOVI</Text><Text style={styles.partner}>MOTORISTA PARCEIRO</Text></View>
      <View style={styles.intro}><Text style={styles.eyebrow}>SEU TRABALHO, NO SEU RITMO</Text><Text style={styles.title}>Bom ter você{`\n`}de volta.</Text><Text style={styles.description}>Acesse sua área segura para dirigir, acompanhar corridas e organizar seus ganhos.</Text></View>
      <View style={styles.form}><Field label="E-MAIL" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" /><Field label="SENHA" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" returnKeyType="done" onSubmitEditing={() => void submit()} /><Link href="/recuperar-senha" style={styles.link}>Esqueci minha senha</Link><AppButton title="Entrar com segurança" loading={loading} onPress={() => void submit()} /></View>
      <View style={styles.bottom}><Text style={styles.note}>Ainda não é parceiro?</Text><Link href="/cadastro" style={styles.link}>Quero dirigir com o MOVI</Link></View>
      <Text style={styles.legal}>Seus dados são protegidos. O MOVI nunca pede sua senha por telefone ou mensagem.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function createStyles(palette: DriverPalette) { return StyleSheet.create({ flex: { flex: 1, backgroundColor: palette.canvas }, scroll: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 58, paddingBottom: 32, justifyContent: "center", gap: 35 }, brand: { alignItems: "center", gap: 4 }, mark: { width: 58, height: 48, marginBottom: 7 }, wordmark: { fontSize: 30, fontWeight: "900", letterSpacing: -1.5, color: palette.ink }, partner: { fontSize: 9, fontWeight: "900", color: palette.muted, letterSpacing: 2.1 }, intro: { gap: 11 }, eyebrow: { color: palette.forest, fontSize: 10, letterSpacing: 1.6, fontWeight: "900" }, title: { fontSize: 38, lineHeight: 42, color: palette.ink, fontWeight: "900", letterSpacing: -1 }, description: { color: palette.muted, fontSize: 15, lineHeight: 23, maxWidth: 320 }, form: { gap: 16 }, bottom: { flexDirection: "row", justifyContent: "center", gap: 6, flexWrap: "wrap" }, note: { color: palette.muted, fontSize: 14 }, link: { color: palette.forest, fontSize: 14, fontWeight: "900" }, legal: { color: palette.muted, fontSize: 11, textAlign: "center", lineHeight: 17, paddingHorizontal: 12 } }); }
