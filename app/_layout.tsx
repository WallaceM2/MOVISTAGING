import React, { useEffect } from "react";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { restoreSession } from "@/api/http";
import { useAuthStore } from "@/store/authStore";
import { AppProviders } from "@/providers";
import { disconnectSocket } from "@/realtime/socket";
import { subscribePushOpensRide } from "@/features/push/pushService";
import "@/location/backgroundLocation";

export default function RootLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.accessToken);
  const setHydrated = useAuthStore((state) => state.setHydrated);

  useEffect(() => {
    let active = true;
    void restoreSession().finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, [setHydrated]);

  useEffect(() => { if (!token) disconnectSocket(); }, [token]);
  useEffect(() => subscribePushOpensRide((rideId) => router.push({ pathname: "/(app)/corrida", params: { id: String(rideId) } })), []);

  return <SafeAreaProvider><AppProviders><Stack screenOptions={{ headerShown: false, animation: "fade" }} /></AppProviders></SafeAreaProvider>;
}
