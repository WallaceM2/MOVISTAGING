import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette } from "@/theme";
import { useMoviTheme } from "@/theme/ThemeProvider";

export function Page({ children, ...props }: ViewProps) {
  const { colors } = useMoviTheme();
  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}><View style={styles.page} {...props}>{children}</View></SafeAreaView>;
}

export function Surface({ children, style }: ViewProps) {
  const { colors } = useMoviTheme();
  return <View style={[styles.surface, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function AppButton({ title, onPress, loading, disabled, secondary, danger }: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean; secondary?: boolean; danger?: boolean }) {
  const { colors } = useMoviTheme();
  const backgroundColor = danger ? palette.red : secondary ? colors.surface : colors.primary;
  return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor, borderColor: secondary ? palette.line : backgroundColor, opacity: disabled ? 0.55 : pressed ? 0.85 : 1 }]}>
    {loading ? <ActivityIndicator color={secondary ? colors.text : "#04120F"} /> : <Text style={[styles.buttonText, { color: secondary ? colors.text : "#04120F" }]}>{title}</Text>}
  </Pressable>;
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const { colors } = useMoviTheme();
  return <View style={styles.fieldWrap}><Text style={[styles.label, { color: colors.muted }]}>{label}</Text><TextInput placeholderTextColor={colors.muted} selectionColor={colors.primary} {...props} style={[styles.field, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }, props.multiline && styles.multiline, props.style]} />{error ? <Text style={styles.error}>{error}</Text> : null}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  const { colors } = useMoviTheme();
  return <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>{action}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas },
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 12, gap: 16 },
  surface: { backgroundColor: palette.paper, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: palette.line },
  button: { minHeight: 54, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  buttonText: { color: palette.paper, fontSize: 15, fontWeight: "800" },
  fieldWrap: { gap: 7 },
  label: { fontSize: 12, fontWeight: "800", color: palette.inkSoft, letterSpacing: 0.3 },
  field: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 14, color: palette.ink, backgroundColor: "#07141B", fontSize: 15 },
  multiline: { minHeight: 120, textAlignVertical: "top", paddingTop: 14 },
  error: { color: palette.red, fontSize: 12 },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 17, fontWeight: "900", color: palette.ink },
});
