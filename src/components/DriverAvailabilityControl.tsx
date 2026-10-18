import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { DriverPalette } from "@/theme";
import { useMoviTheme, useThemeStyles } from "@/theme/ThemeProvider";

type Props = {
  online: boolean;
  disabled?: boolean;
  onGoOnline: () => void;
  onGoOffline: () => void;
};

export function DriverAvailabilityControl({ online, disabled = false, onGoOnline, onGoOffline }: Props) {
  const COLORS = useMoviTheme().colors;
  const styles = useThemeStyles(createStyles);
  const [visible, setVisible] = useState(false);
  const [confirmOffline, setConfirmOffline] = useState(false);
  const close = () => { setVisible(false); setConfirmOffline(false); };

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Status ${online ? "online" : "offline"}. Abrir opções de disponibilidade`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => setVisible(true)}
      style={({ pressed }) => [styles.statusButton, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <View style={[styles.statusDot, online ? styles.onlineDot : styles.offlineDot]} />
      <Text style={styles.statusText}>{online ? "Online" : "Offline"}</Text>
      <MaterialCommunityIcons name="chevron-right" size={19} color={COLORS.text} />
    </Pressable>

    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar opções de disponibilidade" onPress={close} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View><Text style={styles.eyebrow}>DISPONIBILIDADE</Text><Text style={styles.title}>{confirmOffline ? "Ficar offline" : "Seu status"}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={close} style={styles.close}>
              <MaterialCommunityIcons name="close" size={21} color={COLORS.text} />
            </Pressable>
          </View>

          {!confirmOffline ? <>
            <Text style={styles.subtitle}>Status atual: <Text style={styles.statusEmphasis}>{online ? "Online" : "Offline"}</Text></Text>
            {online
              ? <Option icon="power-standby" label="Ficar offline" detail="Parar de receber novas corridas" colors={COLORS} styles={styles} onPress={() => setConfirmOffline(true)} />
              : <Option icon="power-standby" label="Ficar online" detail="Voltar a receber novas corridas" colors={COLORS} styles={styles} onPress={() => { close(); onGoOnline(); }} />}
          </> : <>
            <Text style={styles.subtitle}>Você ficará indisponível para novas corridas. Poderá voltar ao online manualmente.</Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => setConfirmOffline(false)} style={styles.secondary}><Text style={styles.secondaryText}>Voltar</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => { close(); onGoOffline(); }} style={styles.primary}><Text style={styles.primaryText}>Confirmar offline</Text></Pressable>
            </View>
          </>}
        </View>
      </View>
    </Modal>
  </>;
}

function Option({ icon, label, detail, colors, styles, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; detail: string; colors: DriverPalette; styles: ReturnType<typeof createStyles>; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
    <View style={styles.optionIcon}><MaterialCommunityIcons name={icon} size={20} color={colors.forest} /></View>
    <View style={styles.optionCopy}><Text style={styles.optionTitle}>{label}</Text><Text style={styles.optionDetail}>{detail}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
  </Pressable>;
}

function createStyles(COLORS: DriverPalette) { return StyleSheet.create({
  statusButton: { minHeight: 48, minWidth: 132, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, borderRadius: 99, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: "#28515C" },
  statusDot: { width: 10, height: 10, borderRadius: 5 }, onlineDot: { backgroundColor: COLORS.forest }, offlineDot: { backgroundColor: COLORS.muted },
  statusText: { color: COLORS.text, fontSize: 13, fontWeight: "800", flex: 1 }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.8, backgroundColor: "#12313A" },
  modalRoot: { flex: 1, justifyContent: "flex-end", padding: 14, backgroundColor: "rgba(0, 5, 8, 0.64)" },
  sheet: { width: "100%", maxWidth: 460, alignSelf: "center", gap: 14, padding: 19, paddingBottom: 22, borderRadius: 24, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface, elevation: 20 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, eyebrow: { color: COLORS.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: "900", marginTop: 3 }, close: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 20 }, statusEmphasis: { color: COLORS.forest, fontWeight: "900" },
  option: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 11, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.bg },
  optionIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#0D302D" }, optionCopy: { flex: 1, gap: 3 },
  optionTitle: { color: COLORS.text, fontSize: 13, fontWeight: "800" }, optionDetail: { color: COLORS.muted, fontSize: 10 }, actions: { flexDirection: "row", gap: 10, marginTop: 2 },
  secondary: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.bg }, secondaryText: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  primary: { flex: 1.25, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: COLORS.forest }, primaryText: { color: COLORS.bg, fontSize: 12, fontWeight: "900" },
}); }
