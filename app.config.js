module.exports = ({ config }) => ({
  ...config,
  name: 'MOVI Passageiro',
  slug: 'movi-passageiro',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'movi',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  ios: {
    ...(config.ios || {}),
    supportsTablet: false,
    bundleIdentifier: 'br.com.movi.passageiro',
    infoPlist: {
      ...(config.ios?.infoPlist || {}),
      NSLocationWhenInUseUsageDescription: 'O MOVI usa sua localização para mostrar sua posição e calcular sua corrida.',
    },
  },
  android: {
    ...(config.android || {}),
    package: 'br.com.movi.passageiro',
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
  },
  plugins: [
    'expo-router',
    ['expo-secure-store', { configureAndroidBackup: true }],
    ['expo-location', { locationWhenInUsePermission: 'O MOVI usa sua localização para mostrar sua posição e calcular sua corrida.' }],
    ['expo-image-picker', { photosPermission: 'O MOVI precisa de acesso às suas fotos para enviar documentos e foto de perfil.' }],
    ['expo-notifications', { defaultChannel: 'rides' }],
    ...(process.env.MAPBOX_DOWNLOAD_TOKEN ? [['@rnmapbox/maps', { RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN }]] : ['@rnmapbox/maps']),
  ],
  extra: {
    router: { origin: false },
    eas: { projectId: '23fb6bb8-348a-4434-b158-ae4559c92f51' },
  },
});
