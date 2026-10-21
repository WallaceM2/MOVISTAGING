import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRide } from '@/features/corrida/corridaService';
import { useMoviTheme } from '@/theme/ThemeProvider';

export function EmergencyAccess() {
  const pathname = usePathname();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useMoviTheme();
  const rideId = Number(id);
  const isTrackingRide = pathname.endsWith('/corrida/status') && Number.isSafeInteger(rideId) && rideId > 0;
  const ride = useQuery({ queryKey: ['ride-active', rideId], queryFn: () => getRide(rideId), enabled: isTrackingRide, staleTime: 0 });

  if (!isTrackingRide || ride.data?.status !== 'em_andamento' || pathname.endsWith('/urgencia')) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Abrir números de urgência" hitSlop={8} onPress={() => router.push('/(app)/urgencia')} style={[styles.button, { top: Math.max(insets.top + 130, 170), right: Math.max(insets.right + 10, 14), backgroundColor: colors.danger }]}>
    <Text style={styles.glyph}>!</Text>
  </Pressable>;
}

const styles = StyleSheet.create({ button: { position: 'absolute', width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FF7A82', elevation: 8, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 8 }, glyph: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' } });
