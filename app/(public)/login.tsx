import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { login } from '@/features/auth/authService';
import { spacing } from '@/theme/colors';
import { useMoviTheme, useThemeStyles, type MoviColors } from '@/theme/ThemeProvider';

export default function LoginScreen() {
  const theme = useMoviTheme().colors;
  const styles = useThemeStyles(createStyles);
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState(''); const [loading, setLoading] = useState(false);
  async function onLogin() { if (!email.trim() || !senha) return Alert.alert('Preencha os dados', 'Informe email e senha.'); setLoading(true); try { await login(email, senha); router.replace('/(app)/home'); } catch (error) { Alert.alert('Não foi possível entrar', error instanceof Error ? error.message : 'Verifique seus dados.'); } finally { setLoading(false); } }
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Screen scroll={false}><View style={styles.brand}><Image source={require('../../assets/movi-logo-oficial.png')} style={styles.mark} resizeMode="contain" /><Text style={[styles.wordmark, { color: theme.text }]}>MOVI</Text></View><Text style={[styles.heading, { color: theme.text }]}>Bem-vindo de volta!</Text><Text style={[styles.subheading, { color: theme.muted }]}>Entre na sua conta para continuar.</Text><View style={styles.form}><Input label="E-mail ou telefone" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} /><Input label="Senha" value={senha} onChangeText={setSenha} secureTextEntry /><Link href="/(public)/recuperar-senha" style={[styles.forgot, { color: theme.primary }]}>Esqueceu sua senha?</Link><Button title="Entrar" onPress={() => void onLogin()} loading={loading} /><Link href="/(public)/cadastro" style={[styles.link, { color: theme.primary }]}>Não tem uma conta? Cadastre-se</Link></View><Text style={[styles.footer, { color: theme.muted }]}>MOVI · mobilidade com tecnologia</Text></Screen></KeyboardAvoidingView>;
}
function createStyles(colors: MoviColors | ReturnType<typeof useMoviTheme>['colors']) { return StyleSheet.create({ brand: { alignItems: 'center', gap: 3, marginTop: 24 }, mark: { width: 66, height: 56 }, wordmark: { color: colors.text, fontSize: 27, fontWeight: '900', letterSpacing: 2 }, heading: { color: colors.text, fontSize: 23, fontWeight: '900', textAlign: 'center', marginTop: 34 }, subheading: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: -7 }, form: { marginTop: spacing.xl, gap: spacing.md }, link: { color: colors.primary, fontWeight: '800', textAlign: 'center', padding: 10 }, forgot: { color: colors.primary, fontWeight: '800', textAlign: 'right', paddingVertical: 6 }, footer: { marginTop: 'auto', textAlign: 'center', color: colors.muted, padding: 20 } }); }
