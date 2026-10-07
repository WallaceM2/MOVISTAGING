module.exports = ({ config }) => ({
  ...config,
  name: 'MOVI Motorista',
  slug: 'movi-motorista',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'movi-motorista',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  ios: {
    ...(config.ios || {}),
    supportsTablet: false,
    bundleIdentifier: 'br.com.movi.motorista',
    infoPlist: {
      ...(config.ios?.infoPlist || {}),
      NSLocationWhenInUseUsageDescription: 'O MOVI usa sua localização enquanto você está online ou durante uma corrida ativa.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'Quando você fica online ou está em uma corrida, o MOVI compartilha sua localização para manter ofertas e acompanhamento funcionando com a tela bloqueada.',
    },
  },
  android: {
    ...(config.android || {}),
    package: 'br.com.movi.motorista',
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'POST_NOTIFICATIONS'],
  },
  plugins: [
    'expo-router',
    ['expo-secure-store', { configureAndroidBackup: true }],
    ['expo-location', { locationWhenInUsePermission: 'O MOVI usa sua localização enquanto você está online ou durante uma corrida ativa.', locationAlwaysAndWhenInUsePermission: 'Quando você fica online ou está em uma corrida, o MOVI compartilha sua localização para manter ofertas e acompanhamento funcionando com a tela bloqueada.', isIosBackgroundLocationEnabled: true, isAndroidBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: true }],
    ['expo-notifications', { defaultChannel: 'rides' }],
    ['expo-image-picker', { photosPermission: 'O MOVI precisa de acesso às suas fotos para enviar documentos de cadastro.' }],
    '@rnmapbox/maps',
  ],
  extra: {
    ...(config.extra || {}),
    router: { origin: false },
    eas: { ...(config.extra?.eas || {}), projectId: 'de72d7d0-e5c1-4bb2-a519-3b89b2fa5c06' },
  },
});
