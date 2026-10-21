import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export type ThemeMode = 'dark' | 'light';
const dark = { bg: '#050B10', surface: '#0A1820', text: '#F1FAFB', muted: '#9AB0B6', border: '#123640', primary: '#00E5A0', primarySoft: '#0D2830', cyan: '#12B8C7', success: '#00E5A0', danger: '#FF4D57', white: '#FFFFFF' } as const;
const light = { bg: '#F4F8F9', surface: '#FFFFFF', text: '#10242B', muted: '#617780', border: '#D4E2E6', primary: '#008F69', primarySoft: '#E0F4EE', cyan: '#087F8C', success: '#008F69', danger: '#C93640', white: '#FFFFFF' } as const;
export type MoviColors = typeof dark;
type ThemeContextValue = { mode: ThemeMode; colors: MoviColors | typeof light; ready: boolean; setMode: (mode: ThemeMode) => Promise<void> };
const ThemeContext = createContext<ThemeContextValue>({ mode: 'dark', colors: dark, ready: true, setMode: async () => undefined });

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [ready, setReady] = useState(false);
  useEffect(() => { void SecureStore.getItemAsync('movi-app-theme').then((saved) => { if (saved === 'light' || saved === 'dark') setModeState(saved); }).catch(() => undefined).finally(() => setReady(true)); }, []);
  const setMode = async (next: ThemeMode) => { await SecureStore.setItemAsync('movi-app-theme', next); setModeState(next); };
  const value = useMemo(() => ({ mode, colors: mode === 'dark' ? dark : light, ready, setMode }), [mode, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useMoviTheme() { return useContext(ThemeContext); }
export function useThemeStyles<T>(factory: (colors: ThemeContextValue['colors']) => T): T { const { colors } = useMoviTheme(); return React.useMemo(() => factory(colors), [colors, factory]); }
