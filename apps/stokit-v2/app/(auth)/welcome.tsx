/**
 * Welcome landing — the hub shown after onboarding and to signed-out returning
 * users. Purely presentational: it routes to Create Account, Sign In, or Join.
 * No auth logic lives here.
 */
import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { fonts, spacing } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { AuthScreen, BrandHeader, AuthHeading, AuthButton, AuthDivider } from '../../components/auth/AuthKit';

export default function WelcomeScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const goCreate = useCallback(() => { try { router.push('/(auth)/sign-up'); } catch {} }, [router]);
  const goSignIn = useCallback(() => { try { router.push('/(auth)/sign-in'); } catch {} }, [router]);
  const goJoin = useCallback(() => { try { router.push('/(auth)/join'); } catch {} }, [router]);

  return (
    <AuthScreen>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <BrandHeader align="center" />
      <AuthHeading
        align="center"
        title="Welcome to Stokit"
        subtitle="Create an account or sign in to keep your pantry and shopping in sync."
      />
      <View style={{ gap: spacing.md }}>
        <AuthButton label="Create account" variant="primary" onPress={goCreate} />
        <AuthButton label="Sign in" variant="outline" onPress={goSignIn} />
        <AuthDivider />
        <AuthButton label="Join with invite code" variant="outline" icon="person-add-outline" onPress={goJoin} />
      </View>
      <Text style={styles.version}>v1.0.0</Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  version: { fontFamily: fonts.sans, fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: spacing.xl },
});
