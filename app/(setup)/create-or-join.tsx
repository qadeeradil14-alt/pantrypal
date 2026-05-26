import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import type { AppColors } from '../../constants/theme';

export default function CreateOrJoinScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons name="home-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.kicker}>Almost ready</Text>
        <Text style={styles.title}>Set up your household</Text>
        <Text style={styles.subtitle}>
          Create a new household or join one{'\n'}your partner already set up.
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          testID="setup-create-household"
          style={styles.primaryBtn}
          onPress={() => router.push('/(setup)/create-household')}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>Create a household</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/(setup)/join-household')} activeOpacity={0.7}>
          <Text style={styles.secondaryBtnText}>Join with an invite code</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 28 },
    hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
    iconWrap: {
      width: 80, height: 80, borderRadius: 28,
      backgroundColor: colors.primarySoft,
      borderWidth: 1, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    },
    kicker: { fontSize: 12, color: colors.primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    title: { fontSize: 32, fontWeight: '800', color: colors.ink, textAlign: 'center', letterSpacing: -0.4 },
    subtitle: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 24, fontWeight: '500' },
    actions: { paddingBottom: 48, gap: 12 },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: 'center',
      flexDirection: 'row', justifyContent: 'center', gap: 8,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
    secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
    secondaryBtnText: { color: colors.muted, fontSize: 16, fontWeight: '600' },
  });
}
