import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { fonts, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { isEmailVerified, useAuthStore } from '../../store/auth-store';
import {
  AuthScreen,
  BrandHeader,
  AuthHeading,
  AuthField,
  AuthButton,
  AuthMessage,
  AuthLink,
} from '../../components/auth/AuthKit';

export default function SignInScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const params = useLocalSearchParams<{ message?: string }>();
  const signIn = useAuthStore((s) => s.signIn);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const loading = useAuthStore((s) => s.loading);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const successMessage = typeof params.message === 'string' ? params.message : '';
  const [error, setError] = useState('');

  // Verification may have completed on another device while this screen sat
  // in the background — re-check on focus so a stale cached user doesn't
  // wrongly block sign-in.
  useFocusEffect(
    useCallback(() => {
      const user = useAuthStore.getState().user;
      if (user && !isEmailVerified(user)) void refreshUser();
    }, [refreshUser]),
  );

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    const result = await signIn(email, password);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // Re-check current auth state right away — signIn() alone can carry a
    // just-stale email_confirmed_at claim if verification completed on
    // another device moments earlier.
    await refreshUser();
    // Let _layout.tsx handle the routing based on auth state change
  };

  const sendReset = async () => {
    if (!email.trim()) {
      setError('Enter your email to reset your password.');
      return;
    }
    const result = await resetPassword(email);
    if (result.ok) {
      setError('');
      router.push({ pathname: '/(auth)/reset-password', params: { email: email.trim() } });
    } else {
      setError(result.message);
    }
  };

  return (
    <AuthScreen>
      <BrandHeader />
      <AuthHeading title="Welcome back" subtitle="Sign in to get back to your pantry." />

      <View style={styles.form}>
        {successMessage ? <AuthMessage text={successMessage} tone="success" /> : null}
        <AuthMessage text={error} />
        <AuthField
          icon="mail-outline"
          value={email}
          onChangeText={(v) => { setEmail(v); setError(''); }}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <AuthField
          icon="lock-closed-outline"
          secure
          value={password}
          onChangeText={(v) => { setPassword(v); setError(''); }}
          placeholder="Password"
          autoComplete="current-password"
        />
        <Pressable onPress={() => void sendReset()} disabled={loading} hitSlop={8} style={styles.forgotWrap}>
          <Text style={styles.forgot}>Forgot password?</Text>
        </Pressable>
        <AuthButton label="Sign in" onPress={() => void submit()} loading={loading} />
      </View>

      <View style={styles.footerLinks}>
        <AuthLink prefix="Don't have an account?" action="Create one" onPress={() => router.replace('/(auth)/sign-up')} compact />
        <AuthLink action="Use invite code" onPress={() => router.push('/(auth)/join')} compact />
      </View>
    </AuthScreen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    form: { gap: spacing.md },
    forgotWrap: { alignSelf: 'flex-end', marginTop: -spacing.xs, marginBottom: spacing.xs },
    forgot: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.primary },
    footerLinks: { alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  });
}
