import React, { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Redirect, Tabs, usePathname } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuthStore, type Driver } from "@/store/authStore";
import { DriverMenuDrawer } from "@/components/DriverMenuDrawer";
import { useMoviTheme } from "@/theme/ThemeProvider";
import { useDriverAvailabilityStore } from "@/store/availabilityStore";
import { useQuery } from "@tanstack/react-query";
import { getRadarRides } from "@/features/corrida/corridaService";

const tabs = ["home", "radar", "historico", "conta"] as const;

export default function DriverLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.accessToken);
  const driver = useAuthStore((state): Driver | null => state.motorista);
  const driverOnline = useDriverAvailabilityStore((state) => state.online);
  const radarQuery = useQuery({
    queryKey: ["driver-ride-radar"],
    queryFn: getRadarRides,
    enabled: Boolean(token) && driverOnline,
    refetchInterval: token && driverOnline ? 12000 : false,
    refetchIntervalInBackground: false,
  });
  const pathname = usePathname();
  const { colors } = useMoviTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const showMenuBack = !pathname.endsWith("/home") && !pathname.endsWith("/corrida");
  if (hydrated && !token) return <Redirect href="/login" />;
  return <View style={{ flex: 1, backgroundColor: colors.bg }}><Tabs screenOptions={{
    headerShown: showMenuBack,
    headerTitle: "MOVI Drive",
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.text,
    headerTitleStyle: { color: colors.text, fontWeight: "800" },
    headerShadowVisible: false,
    headerLeft: showMenuBack ? () => <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao menu" hitSlop={10} onPress={openMenu} style={{ width: 44, height: 44, alignItems: "flex-start", justifyContent: "center" }}><MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} /></Pressable> : undefined,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { display: pathname.endsWith("/corrida") ? "none" : "flex", backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 7, paddingBottom: 7 },
    tabBarLabelStyle: { fontSize: 10, fontWeight: "800" },
  }}>
    {tabs.map((name) => {
      const item = name === "home"
        ? { title: driverOnline ? "Procurando…" : "Início", icon: driverOnline ? "radar" : "home-outline" }
        : name === "radar" ? { title: "Radar", icon: "radar" }
          : name === "historico" ? { title: "Ganhos", icon: "wallet-outline" }
            : { title: "Menu", icon: "menu" };
      // While connected, keep the map as the primary screen but leave Radar
      // reachable so its live pending-ride badge can be acted on immediately.
      const hiddenWhileSearching = driverOnline && name !== "home" && name !== "radar" && name !== "conta";
      const radarCount = name === "radar" && !radarQuery.isError ? radarQuery.data?.length ?? 0 : 0;
      const radarBadge = radarCount > 99 ? "99+" : radarCount > 0 ? String(radarCount) : undefined;
      return <Tabs.Screen key={name} name={name} options={{
        title: item.title,
        ...(hiddenWhileSearching ? { href: null } : {}),
        ...(radarBadge ? { tabBarBadge: radarBadge, tabBarBadgeStyle: { backgroundColor: "#E53945", color: "#FFFFFF", fontSize: 10, fontWeight: "900", minWidth: 19, height: 19, lineHeight: 19, borderRadius: 10, top: -3 } } : {}),
        tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={item.icon as never} size={size} color={color} />,
      }} listeners={name === "conta" ? { tabPress: (event) => { event.preventDefault(); openMenu(); } } : undefined} />;
    })}
    <Tabs.Screen name="corrida" options={{ href: null }} />
    <Tabs.Screen name="corridas" options={{ href: null }} />
    <Tabs.Screen name="configuracoes" options={{ href: null }} />
    <Tabs.Screen name="chat" options={{ href: null }} />
    <Tabs.Screen name="denunciar" options={{ href: null }} />
    <Tabs.Screen name="documentos" options={{ href: null }} />
    <Tabs.Screen name="alterar-senha" options={{ href: null }} />
    <Tabs.Screen name="suporte" options={{ href: null }} />
    <Tabs.Screen name="perfil-parceiro" options={{ href: null, title: "Perfil parceiro" }} />
    <Tabs.Screen name="meus-ganhos" options={{ href: null, title: "Meus ganhos" }} />
    <Tabs.Screen name="urgencia" options={{ href: null }} />
  </Tabs><DriverMenuDrawer visible={menuOpen} driver={driver} onClose={() => setMenuOpen(false)} /></View>;
}
