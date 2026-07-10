import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing } from '../../theme';
import { isEmailVerified, useAuthStore } from '../../store/auth-store';
import {
  AuthScreen,
  BrandHeader,
  AuthHeading,
  AuthButton,
  AuthMessage,
} from '../../components/auth/AuthKit';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const resend = useAuthStore((s) => s.resendVerificationEmail);
  const signOut = useAuthStore((s) => s.signOut);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'error' | 'success'>('error');
  // Prefer live user email; fall back to pendingEmail set during sign-up.
  const email = user?.email ?? pendingEmail ?? '';

  const checkVerification = async () => {
    const result = await refreshUser();
    const refreshed = useAuthStore.getState().user;
    if (result.ok && isEmailVerified(refreshed)) {
      router.replace('/(tabs)');
      return;
    }
    setTone('error');
    setMessage('Your email is not verified yet. Open the link we sent, then try again.');
  };

  const resendEmail = async () => {
    if (!email) {
      setTone('error');
      setMessage('Log in again to resend your verification email.');
      return;
    }
    const result = await resend(email);
    setTone(result.ok ? 'success' : 'error');
    setMessage(result.ok ? 'Verification email sent.' : result.message);
  };

  const useDifferentEmail = async () => {
    await signOut();
    router.replace('/(auth)/sign-up');
  };

  return (
    <AuthScreen>
      <BrandHeader />
      <AuthHeading
        title="Verify your email"
        subtitle={`We sent a verification link to ${email || 'your email'}. Please verify it before using Stokit.`}
      />
      <View style={{ gap: spacing.md }}>
        {message ? <AuthMessage text={message} tone={tone} /> : null}
        <AuthButton label="I verified my email" onPress={() => void checkVerification()} />
        <AuthButton label="Resend email" variant="outline" onPress={() => void resendEmail()} />
        <AuthButton label="Use a different email" variant="ghost" onPress={() => void useDifferentEmail()} />
      </View>
    </AuthScreen>
  );
}
