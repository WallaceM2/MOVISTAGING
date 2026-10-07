import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { login } from '@/features/auth/authService';
import { colors, spacing } from '@/theme/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState(''); const [loading, setLoading] = useState(false);
  async function onLogin() { if (!email.trim() || !senha) return Alert.alert('Preencha os dados', 'Informe email e senha.'); setLoading(true); try { await login(email, senha); router.replace('/(app)/home'); } catch (error) { Alert.alert('Não foi possível entrar', error instanceof Error ? error.message : 'Verifique seus dados.'); } finally { setLoading(false); } }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Screen title="Entrar no MOVI" subtitle="Acesse sua conta de passageiro." scroll={false}><View style={styles.form}><Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} /><Input label="Senha" value={senha} onChangeText={setSenha} secureTextEntry /><Button title="Entrar" onPress={() => void onLogin()} loading={loading} /><Link href="/(public)/cadastro" style={styles.link}>Ainda não tenho conta</Link></View><Text style={styles.footer}>MOVI • mobilidade com tecnologia e confiança</Text></Screen></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ form: { marginTop: spacing.xl, gap: spacing.md }, link: { color: colors.text, fontWeight: '800', textAlign: 'center', padding: 10 }, footer: { marginTop: 'auto', textAlign: 'center', color: colors.muted, padding: 20 } });
