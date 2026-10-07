import * as SecureStore from "expo-secure-store";

const REFRESH_TOKEN_KEY = "movi.motorista.refresh_token.v1";

export const tokenStore = {
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  setRefreshToken: (token: string) => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  }),
  clear: () => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
};
