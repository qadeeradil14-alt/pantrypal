import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.heroTopGlow} />

      <View style={styles.hero}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Ionicons name="nutrition" size={30} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.kicker}>Shared kitchen inventory</Text>
            <Text style={styles.title}>PantryPal</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>
          A cleaner way to track what is low, plan grocery runs, and stay in sync with your household.
        </Text>

        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <View style={styles.featureIconWrap}>
              <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
            </View>
            <Text style={styles.featureText}>Beautiful, real-time pantry lists for everyone at home</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={styles.featureIconWrap}>
              <Ionicons name="navigate-outline" size={16} color={colors.primary} />
            </View>
            <Text style={styles.featureText}>Store-aware shopping mode with quick completion taps</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={styles.featureIconWrap}>
              <Ionicons name="receipt-outline" size={16} color={colors.primary} />
            </View>
            <Text style={styles.featureText}>Receipt history to understand and improve food spending</Text>
          </View>
        </View>
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
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 28 },
  heroTopGlow: {
    position: 'absolute',
    top: -120,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.primarySoft,
    opacity: 0.8,
  },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', gap: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  title: { fontSize: 40, fontWeight: '800', color: colors.ink, letterSpacing: -0.8 },
  subtitle: { fontSize: 18, color: colors.inkSoft, lineHeight: 28, fontWeight: '500' },
  featureList: {
    marginTop: 10,
    gap: 12,
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.faint,
  },
  featureItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  featureIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginTop: 1,
  },
  featureText: { flex: 1, fontSize: 15, color: colors.inkSoft, lineHeight: 22, fontWeight: '600' },
  actions: { paddingBottom: 48, gap: 12 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.surface, fontSize: 17, fontWeight: '800' },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
});
