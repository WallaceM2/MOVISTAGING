import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'movi.passageiro.refresh_token.v1';

export const tokenStore = {
  async getRefreshToken() { return SecureStore.getItemAsync(REFRESH_TOKEN_KEY); },
  async setRefreshToken(token: string) { await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }); },
  async clear() { await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY); },
};
