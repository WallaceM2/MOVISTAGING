import React, { useEffect } from 'react';
import { Text, View, type ColorValue } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { EmergencyAccess } from '@/components/EmergencyAccess';
import { useMoviTheme } from '@/theme/ThemeProvider';

function AccountVectorIcon({ color }: { color: ColorValue }) {
  return <View accessibilityElementsHidden style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.8, borderColor: color, marginBottom: 2 }} />
    <View style={{ width: 16, height: 8, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderWidth: 1.8, borderBottomWidth: 0, borderColor: color }} />
  </View>;
}

export default function AppLayout() {
  const { colors } = useMoviTheme();
  const token = useAuthStore((state) => state.accessToken);
  const hydrated = useAuthStore((state) => state.hydrated);
  useEffect(() => { if (hydrated && !token) router.replace('/(public)/login'); }, [hydrated, token]);
  return <View style={{ flex: 1, backgroundColor: colors.bg }}><Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 7, paddingBottom: 7 }, tabBarLabelStyle: { fontSize: 10, fontWeight: '700', textTransform: 'none' }}}>
    <Tabs.Screen name="home" options={{ title: 'Início', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="home-outline" size={size ?? 22} color={color} /> }} />
    <Tabs.Screen name="corridas" options={{ title: 'Corridas', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="car-multiple" size={size ?? 22} color={color} /> }} />
    <Tabs.Screen name="conta" options={{ tabBarLabel: ({ color }) => <Text style={{ color, fontSize: 10, fontWeight: '700', textTransform: 'none' }}>Conta</Text>, tabBarIcon: ({ color }) => <AccountVectorIcon color={color} /> }} />
    {['conta/historico','conta/perfil','corrida/estimar','corrida/confirmar','corrida/status','conta/avaliar','conta/configuracoes','conta/debito','conta/denunciar','conta/documentos','conta/senha','conta/detalhes','legal','suporte','urgencia','chat'].map((name) => <Tabs.Screen key={name} name={name} options={{ href: null, ...(['corrida/estimar','corrida/confirmar','corrida/status','urgencia','chat'].includes(name) ? { tabBarStyle: { display: 'none' } } : {}) }} />)}
  </Tabs><EmergencyAccess /></View>;
}


