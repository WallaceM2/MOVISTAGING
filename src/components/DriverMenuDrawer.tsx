import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { logout } from "@/features/auth/authService";
import { stopBackgroundLocation } from "@/location/backgroundLocation";
import { disconnectSocket } from "@/realtime/socket";
import { useAuthStore, type Driver } from "@/store/authStore";
import { useMoviTheme } from "@/theme/ThemeProvider";
import { getDriverProfile } from "@/features/motorista/motoristaService";

type Props = {
  visible: boolean;
  driver: Driver | null;
  onClose: () => void;
};

const colors = {
  panel: "#06151B",
  panelRaised: "#0A2027",
  border: "#123640",
  green: "#00E5A0",
  cyan: "#12B8C7",
  text: "#F1FAFB",
  muted: "#9AB0B6",
  overlay: "rgba(0, 8, 12, 0.68)",
};

export function DriverMenuDrawer({ visible, driver, onClose }: Props) {
  const theme = useMoviTheme().colors;
  const profileQuery = useQuery({ queryKey: ["driver-profile"], queryFn: getDriverProfile, enabled: visible, staleTime: 60000 });
  const profile = profileQuery.data ?? driver;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerWidth = Math.min(width * 0.84, 350);
  const translateX = useRef(new Animated.Value(-drawerWidth)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [photoFailed, setPhotoFailed] = useState(false);
  const closeCallback = useRef<(() => void) | undefined>(undefined);

  useEffect(() => setPhotoFailed(false), [profile?.foto_perfil_url]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateX.setValue(-drawerWidth);
      overlayOpacity.setValue(0);
      requestAnimationFrame(() => Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 230, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start());
    }
  }, [visible, drawerWidth, overlayOpacity, translateX]);

  const close = (afterClose?: () => void) => {
    if (!mounted) return;
    closeCallback.current = afterClose;
    Animated.parallel([
      Animated.timing(translateX, { toValue: -drawerWidth, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setMounted(false);
      onClose();
      const callback = closeCallback.current;
      closeCallback.current = undefined;
      callback?.();
    });
  };

  const name = [profile?.nome, profile?.sobrenome].filter(Boolean).join(" ").trim();
  const initials = useMemo(() => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""), [name]);
  const rating = Number(profile?.nota_media);
  const acceptanceRate = profile?.desempenho?.taxa_aceitacao_pct;
  const completionRate = profile?.desempenho?.taxa_finalizacao_pct;
  const formatRate = (value: number | string | null | undefined) => value == null || !Number.isFinite(Number(value)) ? "—" : `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  const navigate = (path: "/(app)/home" | "/(app)/corridas" | "/(app)/historico" | "/(app)/conta" | "/(app)/meus-ganhos" | "/(app)/perfil-parceiro" | "/(app)/suporte" | "/(app)/configuracoes") => {
    close(() => router.navigate(path));
  };

  const confirmLogout = () => {
    Alert.alert("Sair do MOVI Drive", "Sua sessão será encerrada neste aparelho.", [
      { text: "Continuar conectado", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: () => close(() => {
          disconnectSocket();
          void stopBackgroundLocation().catch(() => undefined);
          void logout().catch(() => undefined).finally(() => {
            useAuthStore.getState().clearSession();
            router.replace("/login");
          });
        }),
      },
    ]);
  };

  return <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
    <SafeAreaView style={styles.modal} edges={[]}>
      <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: overlayOpacity, backgroundColor: colors.overlay }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar menu"
        onPress={() => close()}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        accessibilityViewIsModal
        importantForAccessibility="yes"
        style={[styles.drawer, { width: drawerWidth, backgroundColor: theme.surface, borderRightColor: theme.border, paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 12), transform: [{ translateX }] }]}
      >
        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            <Image source={require("../../assets/movi-logo-oficial.png")} style={styles.brandIcon} resizeMode="contain" accessibilityLabel="Símbolo MOVI" />
            <Text style={[styles.brand, { color: theme.text }]}>MOVI</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar menu" onPress={() => close()} hitSlop={8} style={[styles.closeButton, { backgroundColor: theme.bg }]}>
            <MaterialCommunityIcons name="close" size={23} color={theme.text} />
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil parceiro" onPress={() => navigate("/(app)/perfil-parceiro")} style={({ pressed }) => [styles.profileCard, { backgroundColor: theme.bg, borderColor: theme.border }, pressed && styles.pressed]}>
          {profile?.foto_perfil_url && !photoFailed
            ? <Image source={{ uri: profile.foto_perfil_url }} onError={() => setPhotoFailed(true)} style={styles.avatar} accessibilityLabel={name ? `Foto de ${name}` : "Foto do motorista"} />
            : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarInitials}>{initials || "M"}</Text></View>}
          <View style={styles.profileCopy}>
            <Text style={[styles.driverName, { color: theme.text }]} numberOfLines={1}>{name || "Motorista MOVI"}</Text>
            <View style={styles.ratingLine}><MaterialCommunityIcons name="star" size={14} color="#FFB454" /><Text style={[styles.ratingText, { color: theme.text }]}>{Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : "Sem avaliações"}</Text></View>
            <View style={styles.ratesRow}>
              <View style={styles.rateItem}><Text style={[styles.rateValue, { color: theme.primary }]}>{formatRate(acceptanceRate)}</Text><Text style={[styles.rateLabel, { color: theme.muted }]}>Taxa de aceitação</Text></View>
              <View style={[styles.rateDivider, { backgroundColor: theme.border }]} />
              <View style={styles.rateItem}><Text style={[styles.rateValue, { color: completionRate != null && Number(completionRate) < 60 ? "#FF4D57" : theme.primary }]}>{formatRate(completionRate)}</Text><Text style={[styles.rateLabel, { color: theme.muted }]}>Taxa de finalização</Text></View>
            </View>
            <Text style={[styles.performanceHint, { color: theme.muted }]}>Com base nas últimas 100 ofertas e corridas elegíveis</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={23} color={colors.text} />
        </Pressable>

        <ScrollView contentContainerStyle={styles.items} showsVerticalScrollIndicator={false}>
          <MenuItem icon="home-outline" label="Início / Mapa" active theme={theme} onPress={() => navigate("/(app)/home")} />
          <MenuItem icon="car-outline" label="Minhas corridas" theme={theme} onPress={() => navigate("/(app)/corridas")} />
          <MenuItem icon="wallet-outline" label="Meus ganhos" theme={theme} onPress={() => navigate("/(app)/meus-ganhos")} />
          <MenuItem icon="star-circle-outline" label="Perfil parceiro" theme={theme} onPress={() => navigate("/(app)/perfil-parceiro")} />
          <MenuItem icon="account-circle-outline" label="Meu perfil e veículo" theme={theme} onPress={() => navigate("/(app)/conta")} />
          <MenuItem icon="lifebuoy" label="Ajuda e suporte" theme={theme} onPress={() => navigate("/(app)/suporte")} />
          <MenuItem icon="tune-variant" label="Opções do app" theme={theme} onPress={() => navigate("/(app)/configuracoes")} />
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerRule} />
          <Pressable accessibilityRole="button" accessibilityLabel="Sair da conta" onPress={confirmLogout} style={({ pressed }) => [styles.logout, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="logout" size={21} color="#FF8585" />
            <Text style={styles.logoutText}>Sair da conta</Text>
          </Pressable>
        </View>
      </Animated.View>
    </SafeAreaView>
  </Modal>;
}

function MenuItem({ icon, label, active = false, theme, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; active?: boolean; theme: { text: string; primary: string; muted: string; surface: string; border: string; bg: string }; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && styles.pressed]}>
    <MaterialCommunityIcons name={icon} size={21} color={active ? theme.primary : theme.text} />
    <Text style={[styles.itemText, { color: active ? theme.primary : theme.text }]}>{label}</Text>
    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.muted} />
  </Pressable>;
}

const styles = StyleSheet.create({
  modal: { flex: 1, flexDirection: "row", backgroundColor: "transparent" },
  backdrop: { ...StyleSheet.absoluteFill },
  drawer: { height: "100%", backgroundColor: colors.panel, borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 18, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 18, elevation: 20 },
  topRow: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  brandRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  brandIcon: { width: 31, height: 31 },
  brand: { color: colors.text, fontSize: 17, letterSpacing: 1.6, fontWeight: "900" },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.panelRaised },
  profileCard: { minHeight: 164, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 16, marginBottom: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
  avatar: { width: 54, height: 54, borderRadius: 19, backgroundColor: "#10323A" },
  avatarFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#1D6570" },
  avatarInitials: { color: colors.green, fontSize: 20, fontWeight: "900" },
  profileCopy: { flex: 1, gap: 6 },
  driverName: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: "800" },
  ratingLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 13, lineHeight: 17, fontWeight: "800" },
  ratesRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 5 },
  rateItem: { flex: 1, gap: 3 },
  rateValue: { fontSize: 15, lineHeight: 19, fontWeight: "900" },
  rateLabel: { fontSize: 10, lineHeight: 14, fontWeight: "700" },
  performanceHint: { fontSize: 9, lineHeight: 13, marginTop: 4 },
  rateDivider: { width: 1, height: 25 },
  items: { gap: 5, paddingBottom: 14 },
  item: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 12, borderRadius: 14 },
  itemActive: { backgroundColor: "#075A50", borderLeftWidth: 3, borderLeftColor: colors.green },
  itemText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "700" },
  pressed: { backgroundColor: "#103139", opacity: 0.86 },
  footer: { marginTop: "auto" },
  footerRule: { height: 1, backgroundColor: colors.border, marginBottom: 10 },
  logout: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 12, borderRadius: 14 },
  logoutText: { color: "#FF8585", fontSize: 13, fontWeight: "800" },
});
