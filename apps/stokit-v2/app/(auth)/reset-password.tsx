import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fonts, spacing } from '../../theme';
import { useAuthStore } from '../../store/auth-store';
import {
  AuthScreen,
  BrandHeader,
  AuthHeading,
  AuthField,
  AuthButton,
  AuthMessage,
  AuthLink,
} from '../../components/auth/AuthKit';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();

  const verifyResetCode = useAuthStore((s) => s.verifyResetCode);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const loading = useAuthStore((s) => s.loading);

  const [email] = useState((params.email ?? '').trim());
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);

  const submit = async () => {
    if (code.trim().length < 8) {
      setError('Enter the 8-digit code from your email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const result = await verifyResetCode(email, code, password);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // Success: verifyResetCode leaves the user signed in; _layout routes them in.
  };

  const resend = async () => {
    const result = await resetPassword(email);
    if (result.ok) {
      setResent(true);
      setError('');
    } else {
      setError(result.message);
    }
  };

  return (
    <AuthScreen>
      <BrandHeader />
      <AuthHeading title="Enter your code" subtitle={`We sent an 8-digit code to ${email || 'your email'}.`} />
      <View style={{ gap: spacing.md }}>
        <AuthMessage text={error} />
        <AuthField
          icon="keypad-outline"
          value={code}
          onChangeText={(v) => { setCode(v.replace(/[^0-9]/g, '').slice(0, 8)); setError(''); }}
          placeholder="8-digit code"
          keyboardType="number-pad"
          maxLength={8}
          style={{ fontFamily: fonts.mono, fontSize: 20, letterSpacing: 6 }}
        />
        <AuthField
          icon="lock-closed-outline"
          secure
          value={password}
          onChangeText={(v) => { setPassword(v); setError(''); }}
          placeholder="New password (8+ characters)"
          autoComplete="new-password"
        />
        <AuthField
          icon="lock-closed-outline"
          secure
          value={confirmPassword}
          onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
          placeholder="Confirm new password"
          autoComplete="new-password"
        />
        <AuthButton label="Reset password" onPress={() => void submit()} loading={loading} />
        {resent ? (
          <AuthMessage text="New code sent — check your inbox." tone="success" />
        ) : (
          <AuthButton label="Resend code" variant="outline" onPress={() => void resend()} disabled={loading} />
        )}
      </View>
      <AuthLink action="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
    </AuthScreen>
  );
}
