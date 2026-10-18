import React, { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppButton, SectionTitle, Surface } from "@/components/ui";
import { palette } from "@/theme";

const SERVICES = [
  { name: "Polícia Militar", number: "190", icon: "shield-alert" },
  { name: "SAMU", number: "192", icon: "ambulance" },
  { name: "Bombeiros", number: "193", icon: "fire-truck" },
] as const;

export default function UrgencyScreen() {
  const [calling, setCalling] = useState<string | null>(null);
  async function call(number: string) {
    if (calling) return;
    setCalling(number);
    try {
      const url = `tel:${number}`;
      if (!(await Linking.canOpenURL(url))) throw new Error("Este aparelho não permite iniciar uma ligação telefônica.");
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert("Não foi possível ligar", error instanceof Error ? error.message : "Ligue para o serviço de emergência pelo telefone do aparelho.");
    } finally { setCalling(null); }
  }
  return <View style={styles.page}><SectionTitle title="Urgência" /><Text style={styles.subtitle}>Se estiver em risco imediato, ligue para o serviço adequado.</Text>
    {SERVICES.map((service) => <Pressable key={service.number} accessibilityRole="button" accessibilityLabel={`Ligar para ${service.name}, ${service.number}`} onPress={() => void call(service.number)}>
      <Surface style={styles.service}><View style={styles.icon}><MaterialCommunityIcons name={service.icon} size={25} color="#D92332" /></View><View style={styles.copy}><Text style={styles.name}>{service.name}</Text><Text style={styles.number}>{service.number}</Text></View><MaterialCommunityIcons name="phone" size={24} color={palette.forest} /></Surface>
    </Pressable>)}
    <AppButton title="Voltar" secondary onPress={() => router.back()} />
  </View>;
}

const styles = StyleSheet.create({ page: { flex: 1, padding: 18, paddingTop: 36, gap: 14, backgroundColor: palette.canvas }, subtitle: { marginTop: -8, marginBottom: 4, color: palette.muted, lineHeight: 20 }, service: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 14 }, icon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }, copy: { flex: 1, gap: 3 }, name: { color: palette.ink, fontWeight: "800", fontSize: 16 }, number: { color: palette.muted, fontSize: 14 } });
