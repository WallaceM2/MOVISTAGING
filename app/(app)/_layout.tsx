import React from "react";
import { Redirect, Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuthStore } from "@/store/authStore";
import { palette } from "@/theme";

const tabs = [
  { name: "home", title: "Início", icon: "view-dashboard-outline" },
  { name: "historico", title: "Ganhos", icon: "wallet-outline" },
  { name: "conta", title: "Conta", icon: "account-circle-outline" },
];

export default function DriverLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.accessToken);
  if (hydrated && !token) return <Redirect href="/login" />;
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: palette.forest,
    tabBarInactiveTintColor: palette.muted,
    tabBarStyle: { backgroundColor: palette.paper, borderTopColor: palette.line, height: 66, paddingTop: 8, paddingBottom: 8 },
    tabBarLabelStyle: { fontSize: 10, fontWeight: "800" },
  }}>
    {tabs.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title, tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={tab.icon as never} size={size} color={color} /> }} />)}
    <Tabs.Screen name="corrida" options={{ href: null }} />
    <Tabs.Screen name="denunciar" options={{ href: null }} />
    <Tabs.Screen name="documentos" options={{ href: null }} />
    <Tabs.Screen name="alterar-senha" options={{ href: null }} />
  </Tabs>;
}
