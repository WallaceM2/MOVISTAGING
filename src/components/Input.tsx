import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius } from '@/theme/colors';
import { useMoviTheme } from '@/theme/ThemeProvider';

type Props = TextInputProps & { label: string; error?: string };

export function Input({ label, error, ...props }: Props) {
  const theme = useMoviTheme().colors;
  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TextInput {...props} placeholderTextColor={theme.muted} selectionColor={theme.primary} style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }, error && styles.error]} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 7 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 15, color: colors.text, fontSize: 16 },
  error: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12 },
});
