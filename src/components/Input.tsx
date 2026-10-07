import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius } from '@/theme/colors';

type Props = TextInputProps & { label: string; error?: string };

export function Input({ label, error, ...props }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} placeholderTextColor="#9CA3AF" style={[styles.input, error && styles.error]} />
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
