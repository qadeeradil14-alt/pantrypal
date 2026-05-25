import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.hero}>
        <Text style={styles.emoji}>🥬</Text>
        <Text style={styles.title}>PantryPal</Text>
        <Text style={styles.subtitle}>
          Stop calling home to ask what's low.{'\n'}
          Your shared grocery list, always in sync.
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push({ pathname: '/(auth)/sign-up', params: { fromJoin: '0' } })}
        >
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/(auth)/sign-in')}>
          <Text style={styles.secondaryBtnText}>I already have an account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 28 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emoji: { fontSize: 72 },
  title: { fontSize: 36, fontWeight: '700', color: '#1a1a1a', letterSpacing: -0.5 },
  subtitle: { fontSize: 17, color: '#666', textAlign: 'center', lineHeight: 26 },
  actions: { paddingBottom: 48, gap: 12 },
  primaryBtn: {
    backgroundColor: '#2D9CDB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { color: '#2D9CDB', fontSize: 16 },
});
