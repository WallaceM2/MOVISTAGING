import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { colors, radius } from '@/theme/colors';

export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, style]} />;
}

const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 } });
