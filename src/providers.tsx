import React, { useEffect, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function AppProviders({ children }: React.PropsWithChildren) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 20000, retry: 1, refetchOnWindowFocus: true }, mutations: { retry: false } } }));
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => onlineManager.setOnline(Boolean(state.isConnected)));
    return unsubscribe;
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));
    return () => subscription.remove();
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
