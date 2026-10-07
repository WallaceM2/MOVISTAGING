const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
if (!configuredApiUrl) throw new Error('Configure EXPO_PUBLIC_API_URL no arquivo .env antes de iniciar o MOVI Motorista.');
let parsedApiUrl: URL;
try { parsedApiUrl = new URL(configuredApiUrl); } catch { throw new Error('EXPO_PUBLIC_API_URL precisa ser uma URL válida.'); }
if (!['http:', 'https:'].includes(parsedApiUrl.protocol) || parsedApiUrl.username || parsedApiUrl.password || parsedApiUrl.search || parsedApiUrl.hash) {
  throw new Error('EXPO_PUBLIC_API_URL precisa usar HTTP(S) e não pode incluir credenciais, query ou fragmento.');
}
if (parsedApiUrl.protocol === 'http:' && !__DEV__) {
  throw new Error('Use HTTPS em builds de produção. HTTP só pode ser usado durante o desenvolvimento.');
}
export const API_URL = configuredApiUrl.replace(/\/$/, '');
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim() ?? '';
export const REQUEST_TIMEOUT_MS = 15000;
