import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuthStore } from '@/store/authStore';

export default function Index() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.accessToken);
  if (!hydrated) return <View style={styles.container}><ActivityIndicator size="large" /></View>;
  return token ? <Redirect href="/(app)/home" /> : <Redirect href="/(public)/login" />;
}
const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
