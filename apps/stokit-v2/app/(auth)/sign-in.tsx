import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fonts, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/auth-store';
import {
  AuthScreen,
  BrandHeader,
  AuthHeading,
  AuthField,
  AuthButton,
  AuthDivider,
  AuthMessage,
  AuthLink,
} from '../../components/auth/AuthKit';

export default function SignInScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const params = useLocalSearchParams<{ message?: string }>();
  const signIn = useAuthStore((s) => s.signIn);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const loading = useAuthStore((s) => s.loading);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const successMessage = typeof params.message === 'string' ? params.message : '';
  const [error, setError] = useState('');

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
        <AuthDivider />
        <AuthButton label="Join with invite code" variant="outline" icon="person-add-outline" onPress={() => router.push('/(auth)/join')} />
      </View>

      <AuthLink prefix="Don't have an account?" action="Create one" onPress={() => router.replace('/(auth)/sign-up')} />
    </AuthScreen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    form: { gap: spacing.md },
    forgotWrap: { alignSelf: 'flex-end', marginTop: -spacing.xs, marginBottom: spacing.xs },
    forgot: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.primary },
  });
}
