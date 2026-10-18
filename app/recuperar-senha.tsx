import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppButton, Field } from "@/components/ui";
import { palette } from "@/theme";
import { requestPasswordRecovery, resetPasswordWithRecovery, verifyPasswordRecoveryCode, type RecoveryMethod } from "@/features/auth/passwordRecoveryService";

type Step = "contact" | "code" | "password";
export default function PasswordRecoveryScreen() {
  const [step, setStep] = useState<Step>("contact");
  const [method, setMethod] = useState<RecoveryMethod>("email");
  const [destination, setDestination] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [loading, setLoading] = useState(false);
  async function sendCode() {
    if (!destination.trim()) return Alert.alert("Informe seus dados", method === "email" ? "Digite o e-mail cadastrado." : "Digite o número de celular cadastrado com DDD.");
    setLoading(true);
    try { const result = await requestPasswordRecovery(method, destination); setChallengeId(result.challengeId); setStep("code"); }
    catch (error) { Alert.alert("Não foi possível enviar o código", error instanceof Error ? error.message : "Tente novamente mais tarde."); }
    finally { setLoading(false); }
  }
  async function verifyCode() {
    if (!/^\d{6}$/.test(code)) return Alert.alert("Código inválido", "Digite os 6 números recebidos.");
    setLoading(true);
    try { const result = await verifyPasswordRecoveryCode(challengeId, code); setRecoveryToken(result.token_recuperacao); setStep("password"); }
    catch (error) { Alert.alert("Não foi possível validar", error instanceof Error ? error.message : "Confira o código e tente novamente."); }
    finally { setLoading(false); }
  }
  async function savePassword() {
    if (password.length < 8 || password !== repeatPassword) return Alert.alert("Confira a nova senha", "Use pelo menos 8 caracteres e repita a mesma senha nos dois campos.");
    setLoading(true);
    try { await resetPasswordWithRecovery(challengeId, recoveryToken, password); Alert.alert("Senha atualizada", "Agora entre com sua nova senha.", [{ text: "Ir para o login", onPress: () => router.replace("/login") }]); }
    catch (error) { Alert.alert("Não foi possível atualizar a senha", error instanceof Error ? error.message : "Solicite um novo código e tente novamente."); }
    finally { setLoading(false); }
  }
  return <View style={styles.page}><Text style={styles.eyebrow}>CONTA MOVI DRIVE</Text><Text style={styles.title}>Recuperar senha</Text><Text style={styles.copy}>{step === "contact" ? "Escolha onde receber o código de verificação." : step === "code" ? "Digite o código de 6 números enviado para você." : "Crie uma nova senha para sua conta."}</Text>
    {step === "contact" ? <><View style={styles.methods}><AppButton title={method === "email" ? "✓ E-mail" : "E-mail"} secondary={method !== "email"} onPress={() => setMethod("email")} /><AppButton title={method === "sms" ? "✓ SMS" : "SMS"} secondary={method !== "sms"} onPress={() => setMethod("sms")} /></View><Field label={method === "email" ? "E-MAIL CADASTRADO" : "CELULAR CADASTRADO"} value={destination} onChangeText={setDestination} autoCapitalize="none" keyboardType={method === "email" ? "email-address" : "phone-pad"} placeholder={method === "email" ? "voce@exemplo.com" : "(00) 00000-0000"} /><AppButton title="Enviar código" onPress={() => void sendCode()} loading={loading} /></> : null}
    {step === "code" ? <><Field label="CÓDIGO DE VERIFICAÇÃO" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" /><Text style={styles.note}>O código expira em 10 minutos.</Text><AppButton title="Confirmar código" onPress={() => void verifyCode()} loading={loading} /><AppButton title="Voltar" secondary onPress={() => setStep("contact")} /></> : null}
    {step === "password" ? <><Field label="NOVA SENHA" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" /><Field label="REPITA A NOVA SENHA" value={repeatPassword} onChangeText={setRepeatPassword} secureTextEntry autoComplete="new-password" /><AppButton title="Salvar nova senha" onPress={() => void savePassword()} loading={loading} /></> : null}
  </View>;
}
const styles = StyleSheet.create({ page: { flex: 1, padding: 26, paddingTop: 64, gap: 18, backgroundColor: palette.paper, justifyContent: "center" }, eyebrow: { color: palette.forest, fontSize: 10, letterSpacing: 1.8, fontWeight: "900" }, title: { color: palette.ink, fontSize: 32, fontWeight: "900" }, copy: { color: palette.muted, fontSize: 14, lineHeight: 21 }, methods: { flexDirection: "row", gap: 10 }, note: { color: palette.muted, fontSize: 13 } });
