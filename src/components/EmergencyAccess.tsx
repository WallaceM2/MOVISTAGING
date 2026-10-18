import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function EmergencyAccess({ visible }: { visible: boolean }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (!visible || pathname.endsWith("/urgencia")) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Abrir números de urgência" hitSlop={8} onPress={() => router.push("/(app)/urgencia")} style={[styles.button, { top: Math.max(insets.top + 130, 170), right: Math.max(insets.right + 10, 14) }]}>
    <MaterialCommunityIcons name="alert-octagon" size={24} color="#FFFFFF" />
  </Pressable>;
}

const styles = StyleSheet.create({ button: { position: "absolute", width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "#D92332", borderWidth: 2, borderColor: "#FF7A82", elevation: 8, shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 8 } });
