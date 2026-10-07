import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { AppButton, Field, Surface } from "@/components/ui";
import { registerDriver, type RegistrationInput } from "@/features/auth/authService";
import { palette } from "@/theme";

const initial: RegistrationInput = { nome: "", sobrenome: "", email: "", telefone: "", senha: "", data_nascimento: "", cpf: "", rg: "", cnh: "", categoria_cnh: "", estado: "", cidade: "", categoria: "moto", placa_veiculo: "", marca_veiculo: "", modelo_veiculo: "", cor_veiculo: "", ano_modelo_veiculo: new Date().getFullYear(), aceita_termos: true };

export default function RegistrationScreen() {
  const [form, setForm] = useState(initial);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = <K extends keyof RegistrationInput>(key: K, value: RegistrationInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    if (!form.nome.trim() || !form.sobrenome.trim() || !form.email.trim() || !form.telefone.trim() || !form.senha || !form.data_nascimento.trim() || !form.cpf.trim() || !form.estado.trim()) {
      return Alert.alert("Faltam dados", "Preencha os campos obrigatórios para criar seu cadastro.");
    }
    if (form.senha.length < 8) return Alert.alert("Senha fraca", "Use uma senha com pelo menos 8 caracteres.");
    if (!form.placa_veiculo.trim() || !form.marca_veiculo.trim() || !form.modelo_veiculo.trim() || !form.cor_veiculo.trim()) return Alert.alert("Dados do veículo", "Informe placa, marca, modelo e cor do veículo.");
    if (!termsAccepted) return Alert.alert("Aceite necessário", "Leia e aceite os documentos para continuar.");
    setLoading(true);
    try {
      const payload = { ...form, estado: form.estado.trim().toUpperCase(), aceita_termos: true as const };
      const response = await registerDriver(payload);
      Alert.alert("Cadastro recebido", "Agora envie seus documentos para análise. Você poderá entrar assim que sua conta for liberada.", [{ text: "Continuar", onPress: () => router.replace("/login") }]);
      return response;
    } catch (error) {
      Alert.alert("Não foi possível cadastrar", error instanceof Error ? error.message : "Confira os dados e tente novamente.");
    } finally { setLoading(false); }
  }

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.top}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹  Voltar</Text></Pressable><Text style={styles.step}>ETAPA 1 DE 2</Text></View>
    <View style={styles.heading}><Text style={styles.title}>Vamos começar.</Text><Text style={styles.subtitle}>Crie seu perfil de motorista. A aprovação depende da conferência dos seus dados e documentos.</Text></View>
    <Surface style={styles.panel}><Text style={styles.section}>SEUS DADOS</Text><Field label="NOME" value={form.nome} onChangeText={(v) => set("nome", v)} autoComplete="given-name" textContentType="givenName" /><Field label="SOBRENOME" value={form.sobrenome} onChangeText={(v) => set("sobrenome", v)} autoComplete="family-name" textContentType="familyName" /><Field label="E-MAIL" value={form.email} onChangeText={(v) => set("email", v)} autoCapitalize="none" keyboardType="email-address" autoComplete="email" /><Field label="CELULAR COM DDD" value={form.telefone} onChangeText={(v) => set("telefone", v.replace(/[^0-9()+\-\s]/g, ""))} keyboardType="phone-pad" autoComplete="tel" /><Field label="DATA DE NASCIMENTO · DD/MM/AAAA" value={form.data_nascimento} onChangeText={(v) => set("data_nascimento", v.replace(/[^0-9/]/g, "").slice(0, 10))} placeholder="01/01/1990" keyboardType="numbers-and-punctuation" /><Field label="CPF" value={form.cpf} onChangeText={(v) => set("cpf", v.replace(/\D/g, "").slice(0, 11))} keyboardType="number-pad" /><Field label="RG · OPCIONAL" value={form.rg} onChangeText={(v) => set("rg", v)} autoCapitalize="characters" /><Field label="SENHA · MÍNIMO DE 8 CARACTERES" value={form.senha} onChangeText={(v) => set("senha", v)} secureTextEntry autoComplete="new-password" textContentType="newPassword" /></Surface>
    <Surface style={styles.panel}><Text style={styles.section}>ONDE VOCÊ VAI DIRIGIR</Text><View style={styles.choices}>{(["moto", "carro"] as const).map((category) => <Pressable key={category} onPress={() => set("categoria", category)} style={[styles.choice, form.categoria === category && styles.choiceActive]}><Text style={[styles.choiceTitle, form.categoria === category && styles.choiceTitleActive]}>{category === "moto" ? "Moto" : "Carro"}</Text><Text style={[styles.choiceSub, form.categoria === category && styles.choiceSubActive]}>{category === "moto" ? "CNH categoria A" : "CNH categoria B"}</Text></Pressable>)}</View><Field label="PLACA DO VEÍCULO" value={form.placa_veiculo} onChangeText={(v) => set("placa_veiculo", v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10))} autoCapitalize="characters" placeholder="ABC1D23" /><Field label="MARCA" value={form.marca_veiculo} onChangeText={(v) => set("marca_veiculo", v)} autoCapitalize="words" /><Field label="MODELO" value={form.modelo_veiculo} onChangeText={(v) => set("modelo_veiculo", v)} autoCapitalize="words" /><Field label="COR" value={form.cor_veiculo} onChangeText={(v) => set("cor_veiculo", v)} autoCapitalize="words" /><Field label="ANO-MODELO" value={String(form.ano_modelo_veiculo)} onChangeText={(v) => set("ano_modelo_veiculo", Number(v.replace(/\D/g, "").slice(0, 4)) || 0)} keyboardType="number-pad" /><Field label="CATEGORIA DA CNH" value={form.categoria_cnh} onChangeText={(v) => set("categoria_cnh", v.toUpperCase().slice(0, 10))} autoCapitalize="characters" placeholder={form.categoria === "moto" ? "A ou AB" : "B ou AB"} /><Field label="UF" value={form.estado} onChangeText={(v) => set("estado", v.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 2))} autoCapitalize="characters" maxLength={2} /><Field label="CIDADE" value={form.cidade} onChangeText={(v) => set("cidade", v)} autoCapitalize="words" /><Field label="REGIÃO DE ATUAÇÃO · OPCIONAL" value={form.regiao} onChangeText={(v) => set("regiao", v)} /></Surface>
    <Surface style={styles.legalPanel}><Pressable onPress={() => setTermsAccepted(!termsAccepted)} style={styles.termsRow}><View style={[styles.checkbox, termsAccepted && styles.checkboxActive]}>{termsAccepted ? <Text style={styles.check}>✓</Text> : null}</View><Text style={styles.termsText}>Li e aceito os documentos legais do MOVI.</Text></Pressable><Link href="/legal" style={styles.legalLink}>Ler termos, privacidade e segurança</Link></Surface>
    <AppButton title="Enviar cadastro" loading={loading} onPress={() => void submit()} />
    <Text style={styles.footer}>Já tem uma conta? <Link href="/login" style={styles.legalLink}>Entrar</Link></Text>
  </ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ flex: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, paddingTop: 30, paddingBottom: 46, gap: 16 }, top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, back: { color: palette.forest, fontWeight: "800", fontSize: 14 }, step: { color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 }, heading: { gap: 8, paddingVertical: 6 }, title: { fontSize: 30, color: palette.ink, fontWeight: "900", letterSpacing: -0.7 }, subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21 }, panel: { gap: 14 }, section: { fontSize: 10, letterSpacing: 1.4, fontWeight: "900", color: palette.forest }, choices: { flexDirection: "row", gap: 10 }, choice: { flex: 1, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, borderRadius: 16, padding: 14 }, choiceActive: { borderColor: palette.forest, backgroundColor: palette.mint }, choiceTitle: { fontWeight: "900", color: palette.ink, fontSize: 16 }, choiceTitleActive: { color: palette.forestDark }, choiceSub: { marginTop: 3, color: palette.muted, fontSize: 11 }, choiceSubActive: { color: palette.forestDark }, legalPanel: { gap: 10 }, termsRow: { flexDirection: "row", alignItems: "center", gap: 11 }, checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: palette.muted, borderRadius: 6, alignItems: "center", justifyContent: "center" }, checkboxActive: { backgroundColor: palette.forest, borderColor: palette.forest }, check: { color: "white", fontWeight: "900", fontSize: 13 }, termsText: { color: palette.ink, fontSize: 13, fontWeight: "700" }, legalLink: { color: palette.forest, fontWeight: "900", fontSize: 12 }, footer: { textAlign: "center", color: palette.muted, fontSize: 13 } });
