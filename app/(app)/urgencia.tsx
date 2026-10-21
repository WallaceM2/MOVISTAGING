import React, { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useMoviTheme, useThemeStyles } from '@/theme/ThemeProvider';

const SERVICES = [
  { name: 'Polícia Militar', number: '190', icon: 'shield-alert' },
  { name: 'SAMU', number: '192', icon: 'ambulance' },
  { name: 'Bombeiros', number: '193', icon: 'fire-truck' },
] as const;

export default function UrgencyScreen() {
  const styles = useThemeStyles(createStyles);
  const [calling, setCalling] = useState<string | null>(null);
  async function call(number: string) {
    if (calling) return;
    setCalling(number);
    try {
      const url = `tel:${number}`;
      if (!(await Linking.canOpenURL(url))) throw new Error('Este aparelho não permite iniciar uma ligação telefônica.');
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Não foi possível ligar', error instanceof Error ? error.message : 'Ligue para o serviço de emergência pelo telefone do aparelho.');
    } finally { setCalling(null); }
  }
  return <Screen title="Urgência" subtitle="Se estiver em risco imediato, ligue para o serviço adequado.">
    {SERVICES.map((service) => <Pressable key={service.number} accessibilityRole="button" accessibilityLabel={`Ligar para ${service.name}, ${service.number}`} onPress={() => void call(service.number)}>
      <Card style={styles.service}><View style={styles.icon}><Text style={styles.serviceGlyph}>{service.icon === 'shield-alert' ? '190' : service.icon === 'ambulance' ? '192' : '193'}</Text></View><View style={styles.copy}><Text style={styles.name}>{service.name}</Text><Text style={styles.number}>{service.number}</Text></View><Text style={styles.phone} accessibilityLabel="Ligar">☎</Text></Card>
    </Pressable>)}
    <Button title="Voltar" variant="secondary" onPress={() => router.back()} />
  </Screen>;
}

function createStyles(colors: ReturnType<typeof useMoviTheme>['colors']) { return StyleSheet.create({ service: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 82 }, icon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }, serviceGlyph: { color: '#D92332', fontSize: 12, fontWeight: '900' }, copy: { flex: 1, gap: 3 }, name: { color: colors.text, fontWeight: '800', fontSize: 16 }, number: { color: colors.muted, fontSize: 14 }, phone: { fontSize: 24, color: colors.success, padding: 5 } }); }
