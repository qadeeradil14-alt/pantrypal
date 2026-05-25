import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function CreateOrJoinScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.emoji}>🏠</Text>
        <Text style={styles.title}>Set up your household</Text>
        <Text style={styles.subtitle}>
          Create a new household or join one{'\n'}your partner already set up.
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/(setup)/create-household')}>
          <Text style={styles.primaryBtnText}>Create a household</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/(setup)/join-household')}>
          <Text style={styles.secondaryBtnText}>Join with an invite code</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 28 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emoji: { fontSize: 72 },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  subtitle: { fontSize: 17, color: '#666', textAlign: 'center', lineHeight: 26 },
  actions: { paddingBottom: 48, gap: 12 },
  primaryBtn: {
    backgroundColor: '#2D9CDB', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { color: '#2D9CDB', fontSize: 16 },
});
