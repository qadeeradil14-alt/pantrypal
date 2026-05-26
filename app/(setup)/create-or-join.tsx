import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadow } from '../../constants/theme';

export default function CreateOrJoinScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons name="home-outline" size={34} color={colors.accent} />
        </View>
        <Text style={styles.kicker}>Almost ready</Text>
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
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 28 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  iconWrap: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: colors.surfaceDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: { fontSize: 13, color: colors.primary, fontWeight: '900', textTransform: 'uppercase' },
  title: { fontSize: 34, fontWeight: '900', color: colors.ink, textAlign: 'center' },
  subtitle: { fontSize: 17, color: colors.muted, textAlign: 'center', lineHeight: 26, fontWeight: '700' },
  actions: { paddingBottom: 48, gap: 12 },
  primaryBtn: {
    backgroundColor: colors.surfaceDeep, borderRadius: radii.md,
    paddingVertical: 16, alignItems: 'center',
    ...shadow,
  },
  primaryBtnText: { color: colors.surface, fontSize: 17, fontWeight: '900' },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
});
