export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000').replace(/\/$/, '');
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
export const REQUEST_TIMEOUT_MS = 15000;
