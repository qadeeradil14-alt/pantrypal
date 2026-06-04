import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { fonts } from '../../constants/theme';
import type { AppColors } from '../../constants/theme';
import ScalePressable from '../../components/ScalePressable';

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
          Join your family's shared pantry with an invite code, or create a new household.
        </Text>
      </View>

      <View style={styles.actions}>
        <ScalePressable
          testID="setup-join-household"
          style={styles.primaryBtn}
          onPress={() => router.push('/(setup)/join-household')}
        >
          <Ionicons name="key-outline" size={20} color={colors.onPrimary} />
          <Text style={styles.primaryBtnText}>Join existing household</Text>
        </ScalePressable>
        <ScalePressable
          testID="setup-create-household"
          style={styles.secondaryBtn}
          onPress={() => router.push('/(setup)/create-household')}
          profile="chip"
        >
          <Text style={styles.secondaryBtnText}>Create a new household</Text>
        </ScalePressable>
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
      alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    },
    kicker: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodySemiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
    title: { fontSize: 32, fontFamily: fonts.displayExtraBold, color: colors.ink, textAlign: 'center', letterSpacing: 0 },
    subtitle: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 24, fontFamily: fonts.body },
    actions: { paddingBottom: 48, gap: 12 },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: 'center',
      flexDirection: 'row', justifyContent: 'center', gap: 8,
    },
    primaryBtnText: { color: colors.onPrimary, fontSize: 17, fontFamily: fonts.bodySemiBold },
    secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
    secondaryBtnText: { color: colors.muted, fontSize: 16, fontFamily: fonts.bodyMedium },
  });
}
