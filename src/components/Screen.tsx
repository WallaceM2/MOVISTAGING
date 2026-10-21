import React, { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, usePathname, useSegments } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/colors';
import { useMoviTheme } from '@/theme/ThemeProvider';

export function Screen({ children, scroll = true, title, subtitle, loading = false }: PropsWithChildren<{ scroll?: boolean; title?: string; subtitle?: string; loading?: boolean }>) {
  const theme = useMoviTheme().colors;
  const pathname = usePathname();
  const segments = useSegments();
  const isMainTab = ['/home', '/conta/historico', '/conta/perfil'].some((route) => pathname.endsWith(route));
  const showBack = segments[0] === '(app)' && !isMainTab;
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/home');
  }
  const content = (
    <View style={styles.content}>
      {title ? <View style={styles.titleRow}>{showBack ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={8} onPress={goBack} style={[styles.backButton, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.backGlyph, { color: theme.text }]}>‹</Text></Pressable> : null}<Text style={[styles.title, { color: theme.text }]}>{title}</Text></View> : null}
      {subtitle ? <Text style={[styles.subtitle, { color: theme.muted }]}>{subtitle}</Text> : null}
      {loading ? <ActivityIndicator size="large" color={colors.primary} style={styles.loader} /> : children}
    </View>
  );
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: theme.bg }]}>{scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}</SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg }, scroll: { paddingBottom: spacing.xxl }, content: { flex: 1, padding: spacing.md, gap: spacing.md }, titleRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10 }, backButton: { width: 42, height: 42, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }, backGlyph: { fontSize: 34, lineHeight: 37, marginTop: -4 }, title: { flex: 1, fontSize: 25, fontWeight: '900', color: colors.text }, subtitle: { color: colors.muted, fontSize: 15, lineHeight: 21 }, loader: { marginTop: 70 }, });
