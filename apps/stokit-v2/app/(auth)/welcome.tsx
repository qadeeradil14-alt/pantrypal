/**
 * Welcome landing — the hub shown after onboarding and to signed-out returning
 * users. Purely presentational: it routes to Create Account, Sign In, or Join.
 * No auth logic lives here.
 */
import React, { useCallback } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { authBackgroundLight, fonts, spacing } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { OTA_SEQ } from '../../constants/version';
import { AuthScreen, AuthButton, AuthHeading, AuthLink, BrandHeader } from '../../components/auth/AuthKit';

const pantryArtwork = {
  light: require('../../assets/onboarding/onboarding-pantry.png'),
  dark: require('../../assets/onboarding/onboarding-pantry-dark.png'),
};
const DARK_WELCOME_BACKGROUND = '#0F1117';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const goCreate = useCallback(() => { try { router.push('/(auth)/sign-up'); } catch {} }, [router]);
  const goSignIn = useCallback(() => { try { router.push('/(auth)/sign-in'); } catch {} }, [router]);
  const goJoin = useCallback(() => { try { router.push('/(auth)/join'); } catch {} }, [router]);

  return (
    <AuthScreen backgroundColor={isDark ? DARK_WELCOME_BACKGROUND : authBackgroundLight}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.content}>
        <BrandHeader align="center" />
        <Image
          source={isDark ? pantryArtwork.dark : pantryArtwork.light}
          style={styles.artwork}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <AuthHeading
          align="center"
          title="Everything you need, ready when you are."
          subtitle="Create an account to sync your pantry, lists, receipts, and household."
        />
        <View style={styles.actions}>
          <AuthButton label="Create account" variant="primary" onPress={goCreate} />
          <AuthLink prefix="Already have an account?" action="Sign in" onPress={goSignIn} compact />
          <Pressable onPress={goJoin} accessibilityRole="link" accessibilityLabel="Use invite code" hitSlop={12}>
            <Text style={[styles.invite, { color: colors.primary }]}>Use invite code</Text>
          </Pressable>
        </View>
        <Text style={styles.version}>v1.0.0 · OTA {OTA_SEQ}</Text>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', width: '100%' },
  artwork: { width: '100%', height: 268, marginTop: -spacing.lg, marginBottom: spacing.md },
  actions: { width: '100%', gap: spacing.md },
  invite: { fontFamily: fonts.sansSemibold, fontSize: 15, textAlign: 'center', marginTop: spacing.sm, textDecorationLine: 'underline' },
  version: { fontFamily: fonts.sans, fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: spacing.xl },
});
