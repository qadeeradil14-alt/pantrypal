import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing } from '../../theme';
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignUpScreen() {
  const router = useRouter();
  const signUp = useAuthStore((s) => s.signUp);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const loading = useAuthStore((s) => s.loading);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [nextStep, setNextStep] = useState<'VERIFY_EMAIL' | 'SIGN_IN' | null>(null);
  const [emailExists, setEmailExists] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address.');
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
    const result = await signUp(email, password);
    if (!result.ok) {
      if (result.code === 'EMAIL_EXISTS') {
        setEmailExists(true);
        return;
      }
      setError(result.message);
      return;
    }
    setNextStep(result.next ?? 'VERIFY_EMAIL');
  };

  const sendReset = async () => {
    const result = await resetPassword(email);
    if (result.ok) {
      setResetSent(true);
      router.push({ pathname: '/(auth)/reset-password', params: { email: email.trim() } });
    }
  };

  // Screen: account already exists for this email
  if (emailExists) {
    return (
      <AuthScreen>
        <BrandHeader />
        <AuthHeading title="Already registered" subtitle={`An account for ${email} already exists. Sign in or reset your password.`} />
        <View style={{ gap: spacing.md }}>
          <AuthButton label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
          {resetSent ? (
            <AuthMessage text="Reset email sent — check your inbox." tone="success" />
          ) : (
            <AuthButton label="Forgot password? Send reset email" variant="outline" loading={loading} onPress={() => void sendReset()} />
          )}
        </View>
        <AuthLink action="Use a different email" onPress={() => { setEmailExists(false); setEmail(''); setPassword(''); setConfirmPassword(''); }} />
      </AuthScreen>
    );
  }

  // Screen: verification email sent / account created
  if (nextStep) {
    const requiresVerification = nextStep === 'VERIFY_EMAIL';
    return (
      <AuthScreen>
        <BrandHeader />
        <AuthHeading
          title={requiresVerification ? 'Verify your email' : 'Ready to sign in'}
          subtitle={
            requiresVerification
              ? `We sent a verification link to ${email}. Open it, then come back to sign in.`
              : `Your account was created for ${email}. Sign in to continue.`
          }
        />
        <AuthButton label="Go to Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
      </AuthScreen>
    );
  }

  // Default: create-account form
  return (
    <AuthScreen>
      <BrandHeader />
      <AuthHeading title="Create your Stokit account" subtitle="Create an account to keep your pantry connected across devices." />
      <View style={{ gap: spacing.md }}>
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
          placeholder="Password (8+ characters)"
          autoComplete="new-password"
        />
        <AuthField
          icon="lock-closed-outline"
          secure
          value={confirmPassword}
          onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
          placeholder="Confirm password"
          autoComplete="new-password"
        />
        <AuthButton label="Create account" onPress={() => void submit()} loading={loading} />
      </View>
      <AuthLink prefix="Already have an account?" action="Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
    </AuthScreen>
  );
}
