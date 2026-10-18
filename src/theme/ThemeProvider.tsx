import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import type { DriverPalette } from "@/theme";

export type ThemeMode = "dark" | "light";
const dark: DriverPalette = { ...paletteBase("dark") };
const light: DriverPalette = { ...paletteBase("light") };
function paletteBase(mode: ThemeMode): DriverPalette { return mode === "dark" ? { ink: "#F1FAFB", inkSoft: "#A5B6BE", forest: "#00E5A0", forestDark: "#0B302C", mint: "#10312F", lime: "#12B8C7", canvas: "#050B10", paper: "#0A1820", line: "#17323D", muted: "#91A6AE", red: "#FF4D57", amber: "#FFB454", amberBg: "#2B2112", shadow: "#000000", bg: "#050B10", surface: "#0A1820", text: "#F1FAFB", primary: "#00E5A0", cyan: "#12B8C7", border: "#17323D" } : { ink: "#10242B", inkSoft: "#435C65", forest: "#008F69", forestDark: "#E3F3EE", mint: "#E2F3EE", lime: "#087F8C", canvas: "#F4F8F9", paper: "#FFFFFF", line: "#D4E2E6", muted: "#617780", red: "#C93640", amber: "#946015", amberBg: "#FFF3DC", shadow: "#7B969F", bg: "#F4F8F9", surface: "#FFFFFF", text: "#10242B", primary: "#008F69", cyan: "#087F8C", border: "#D4E2E6" }; }
const paletteDefault = paletteBase("dark");
type ThemeContextValue = { mode: ThemeMode; colors: DriverPalette; ready: boolean; setMode: (mode: ThemeMode) => Promise<void> };
const ThemeContext = createContext<ThemeContextValue>({ mode: "dark", colors: paletteDefault, ready: true, setMode: async () => undefined });

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [ready, setReady] = useState(false);
  useEffect(() => { void SecureStore.getItemAsync("movi-app-theme").then((saved) => { if (saved === "light" || saved === "dark") setModeState(saved); }).catch(() => undefined).finally(() => setReady(true)); }, []);
  const setMode = async (next: ThemeMode) => { await SecureStore.setItemAsync("movi-app-theme", next); setModeState(next); };
  const value = useMemo(() => ({ mode, colors: mode === "dark" ? dark : light, ready, setMode }), [mode, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useMoviTheme() {
  return useContext(ThemeContext);
}

export function useThemeStyles<T>(factory: (colors: DriverPalette) => T): T {
  const { colors } = useMoviTheme();
  return React.useMemo(() => factory(colors), [colors, factory]);
}
