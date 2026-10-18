import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMoviTheme } from "@/theme/ThemeProvider";
import { Surface } from "@/components/ui";

export default function AppSettingsScreen() {
  const { mode, colors, setMode } = useMoviTheme();
  return <ScrollView style={[styles.page, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
    <Text style={[styles.eyebrow, { color: colors.primary }]}>PREFERÊNCIAS</Text><Text style={[styles.title, { color: colors.text }]}>Opções do app</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Personalize a aparência do MOVI Drive neste aparelho.</Text>
    <Surface style={styles.group}><Text style={[styles.section, { color: colors.text }]}>Tema</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Escolha a aparência das telas do aplicativo.</Text>
      {([{ id: "dark", title: "Escuro", detail: "Tema escuro MOVI, com fundo azul-petróleo e destaques neon.", icon: "weather-night" }, { id: "light", title: "Claro", detail: "Superfícies claras com os mesmos componentes e organização.", icon: "white-balance-sunny" }] as const).map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: mode === item.id }} onPress={() => void setMode(item.id)} style={[styles.choice, { borderColor: mode === item.id ? colors.primary : colors.border, backgroundColor: colors.bg }]}><View style={[styles.choiceIcon, { backgroundColor: colors.surface }]}><MaterialCommunityIcons name={item.icon} size={21} color={colors.primary} /></View><View style={styles.choiceCopy}><Text style={[styles.choiceTitle, { color: colors.text }]}>{item.title}</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{item.detail}</Text></View><MaterialCommunityIcons name={mode === item.id ? "radiobox-marked" : "radiobox-blank"} size={22} color={mode === item.id ? colors.primary : colors.muted} /></Pressable>)}
    </Surface>
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { flex: 1 }, content: { padding: 20, paddingTop: 26, gap: 12 }, eyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.4 }, title: { fontSize: 26, fontWeight: "900", marginTop: -8 }, subtitle: { fontSize: 12, lineHeight: 18 }, group: { gap: 12, marginTop: 8 }, section: { fontSize: 15, fontWeight: "900" }, choice: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 11, padding: 12, borderWidth: 1, borderRadius: 16 }, choiceIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, choiceCopy: { flex: 1, gap: 3 }, choiceTitle: { fontSize: 13, fontWeight: "900" } });
