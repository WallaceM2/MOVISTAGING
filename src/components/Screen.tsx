import React, { PropsWithChildren } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/colors';

export function Screen({ children, scroll = true, title, subtitle, loading = false }: PropsWithChildren<{ scroll?: boolean; title?: string; subtitle?: string; loading?: boolean }>) {
  const content = (
    <View style={styles.content}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {loading ? <ActivityIndicator size="large" color={colors.primary} style={styles.loader} /> : children}
    </View>
  );
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>{scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}</SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg }, scroll: { paddingBottom: spacing.xxl }, content: { flex: 1, padding: spacing.md, gap: spacing.md }, title: { fontSize: 28, fontWeight: '900', color: colors.text }, subtitle: { color: colors.muted, fontSize: 15, lineHeight: 21 }, loader: { marginTop: 70 }, });
