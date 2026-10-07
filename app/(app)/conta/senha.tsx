import React, { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { changePassword } from '@/features/auth/authService';

export default function PasswordScreen() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit() {
    if (!current || next.length < 8 || next !== repeat) {
      Alert.alert('Verifique os dados', 'A nova senha deve ter pelo menos 8 caracteres e coincidir nos dois campos.');
      return;
    }
    setLoading(true);
    try {
      await changePassword(current, next);
      Alert.alert('Senha alterada', 'Sua senha foi atualizada com sucesso.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error) {
      Alert.alert('Não foi possível alterar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally { setLoading(false); }
  }
  return <Screen title="Alterar senha"><Input label="Senha atual" value={current} onChangeText={setCurrent} secureTextEntry /><Input label="Nova senha" value={next} onChangeText={setNext} secureTextEntry /><Input label="Repita a nova senha" value={repeat} onChangeText={setRepeat} secureTextEntry /><Button title="Atualizar senha" onPress={() => void submit()} loading={loading} /></Screen>;
}
