import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { RecoveryMethod, requestPasswordRecovery, resetPasswordWithRecovery, verifyPasswordRecoveryCode } from '@/features/auth/passwordRecoveryService';
import { colors } from '@/theme/colors';

type Step = 'contact' | 'code' | 'password';
export default function PasswordRecoveryScreen() {
  const [step, setStep] = useState<Step>('contact');
  const [method, setMethod] = useState<RecoveryMethod>('email');
  const [destination, setDestination] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [recoveryToken, setRecoveryToken] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendCode() {
    if (!destination.trim()) return Alert.alert('Informe seus dados', method === 'email' ? 'Digite o e-mail cadastrado.' : 'Digite o número de celular cadastrado com DDD.');
    setLoading(true);
    try { const result = await requestPasswordRecovery(method, destination); setChallengeId(result.challengeId); setStep('code'); }
    catch (error) { Alert.alert('Não foi possível enviar o código', error instanceof Error ? error.message : 'Tente novamente mais tarde.'); }
    finally { setLoading(false); }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(code)) return Alert.alert('Código inválido', 'Digite os 6 números recebidos.');
    setLoading(true);
    try { const result = await verifyPasswordRecoveryCode(challengeId, code); setRecoveryToken(result.token_recuperacao); setStep('password'); }
    catch (error) { Alert.alert('Não foi possível validar', error instanceof Error ? error.message : 'Confira o código e tente novamente.'); }
    finally { setLoading(false); }
  }

  async function savePassword() {
    if (password.length < 8 || password !== repeatPassword) return Alert.alert('Confira a nova senha', 'Use pelo menos 8 caracteres e repita a mesma senha nos dois campos.');
    setLoading(true);
    try { await resetPasswordWithRecovery(challengeId, recoveryToken, password); Alert.alert('Senha atualizada', 'Agora entre com sua nova senha.', [{ text: 'Ir para o login', onPress: () => router.replace('/(public)/login') }]); }
    catch (error) { Alert.alert('Não foi possível atualizar a senha', error instanceof Error ? error.message : 'Solicite um novo código e tente novamente.'); }
    finally { setLoading(false); }
  }

  return <Screen title="Recuperar senha" subtitle={step === 'contact' ? 'Escolha onde receber o código de verificação.' : step === 'code' ? 'Digite o código de 6 números enviado para você.' : 'Crie uma nova senha para sua conta.'}>
    {step === 'contact' ? <>
      <View style={styles.methods}><Button title={method === 'email' ? '✓ E-mail' : 'E-mail'} compact variant={method === 'email' ? 'primary' : 'secondary'} onPress={() => setMethod('email')} /><Button title={method === 'sms' ? '✓ SMS' : 'SMS'} compact variant={method === 'sms' ? 'primary' : 'secondary'} onPress={() => setMethod('sms')} /></View>
      <Input label={method === 'email' ? 'E-mail cadastrado' : 'Celular cadastrado'} value={destination} onChangeText={setDestination} autoCapitalize="none" keyboardType={method === 'email' ? 'email-address' : 'phone-pad'} autoComplete={method === 'email' ? 'email' : 'tel'} placeholder={method === 'email' ? 'voce@exemplo.com' : '(00) 00000-0000'} />
      <Button title="Enviar código" onPress={() => void sendCode()} loading={loading} />
    </> : null}
    {step === 'code' ? <><Input label="Código de verificação" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" /><Text style={styles.note}>O código expira em 10 minutos. Você pode voltar e escolher outro canal.</Text><Button title="Confirmar código" onPress={() => void verifyCode()} loading={loading} /><Button title="Voltar" variant="secondary" onPress={() => setStep('contact')} /></> : null}
    {step === 'password' ? <><Input label="Nova senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" /><Input label="Repita a nova senha" value={repeatPassword} onChangeText={setRepeatPassword} secureTextEntry autoComplete="new-password" /><Button title="Salvar nova senha" onPress={() => void savePassword()} loading={loading} /></> : null}
  </Screen>;
}

const styles = StyleSheet.create({ methods: { flexDirection: 'row', gap: 10 }, note: { color: colors.muted, lineHeight: 19, fontSize: 13 } });
