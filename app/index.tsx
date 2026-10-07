import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import { palette } from "@/theme";

export default function Index() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.accessToken);
  if (!hydrated) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.canvas }}><ActivityIndicator color={palette.forest} /></View>;
  return <Redirect href={token ? "/(app)/home" : "/login"} />;
}
