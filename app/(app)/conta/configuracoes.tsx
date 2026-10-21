import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useMoviTheme } from '@/theme/ThemeProvider';

export default function SettingsScreen() {
  const { mode, colors, setMode } = useMoviTheme();
  return <Screen title="Opções do app" subtitle="Personalize a aparência do MOVI neste aparelho.">
    <Card style={styles.card}><Text style={[styles.section, { color: colors.text }]}>Tema</Text><Text style={[styles.copy, { color: colors.muted }]}>A estrutura das telas é a mesma nos dois modos.</Text>
      {([{ id: 'dark', name: 'Escuro', detail: 'Fundo azul-petróleo e destaques verde/ciano.' }, { id: 'light', name: 'Claro', detail: 'Superfícies claras com a identidade visual MOVI.' }] as const).map((option) => <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: mode === option.id }} onPress={() => void setMode(option.id)} style={[styles.option, { backgroundColor: colors.bg, borderColor: mode === option.id ? colors.primary : colors.border }]}><View style={styles.copyBox}><Text style={[styles.optionTitle, { color: colors.text }]}>{option.name}</Text><Text style={[styles.copy, { color: colors.muted }]}>{option.detail}</Text></View><Text style={{ color: mode === option.id ? colors.primary : colors.muted, fontSize: 22 }}>{mode === option.id ? '◉' : '○'}</Text></Pressable>)}
    </Card>
  </Screen>;
}
const styles = StyleSheet.create({ card: { gap: 12 }, section: { fontSize: 16, fontWeight: '900' }, copy: { fontSize: 12, lineHeight: 18 }, option: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 15, borderWidth: 1 }, copyBox: { flex: 1, gap: 4 }, optionTitle: { fontSize: 14, fontWeight: '800' } });
