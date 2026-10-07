import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '@/theme/colors';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  compact?: boolean;
};

export function Button({ title, onPress, disabled = false, loading = false, variant = 'primary', compact = false }: Props) {
  const backgroundColor = variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.primarySoft : colors.primary;
  const textColor = variant === 'secondary' ? colors.text : colors.white;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor, opacity: isDisabled ? 0.5 : pressed ? 0.82 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[styles.text, { color: textColor }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 54, flex: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  compact: { minHeight: 44 },
  text: { fontSize: 16, fontWeight: '800' },
});
