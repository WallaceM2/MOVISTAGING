import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { colors, radius } from '@/theme/colors';
import { useMoviTheme } from '@/theme/ThemeProvider';

export function Card({ style, ...props }: ViewProps) {
  const theme = useMoviTheme().colors;
  return <View {...props} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]} />;
}

const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 14, elevation: 4 } });
