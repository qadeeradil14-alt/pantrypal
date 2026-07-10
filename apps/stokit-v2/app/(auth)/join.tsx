import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fonts, spacing } from '../../theme';
import { useAuthStore } from '../../store/auth-store';
import { normalizeInviteCode } from '../../core/services/household';
import {
  AuthScreen,
  BrandHeader,
  AuthHeading,
  AuthField,
  AuthButton,
  AuthMessage,
  AuthLink,
} from '../../components/auth/AuthKit';

export const PENDING_JOIN_KEY = 'stokit:v2:pending-join';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function JoinScreen() {
  const router = useRouter();
  const signUp = useAuthStore((s) => s.signUp);
  const loading = useAuthStore((s) => s.loading);

  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [nextStep, setNextStep] = useState<'VERIFY_EMAIL' | 'SIGN_IN' | null>(null);
  const [emailExists, setEmailExists] = useState(false);

  // Pre-fill invite code if routed here with a code param.
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  React.useEffect(() => {
    if (invite && !inviteCode) setInviteCode(invite.toUpperCase());
  }, [invite]);

  const validCode = normalizeInviteCode(inviteCode);

  const submit = async () => {
    setError('');
    if (!validCode) {
      setError('Enter a valid invite code.');
      return;
    }
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
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

    // Store join intent so _layout.tsx can apply it after sign-in
    await AsyncStorage.setItem(
      PENDING_JOIN_KEY,
      JSON.stringify({ inviteCode: validCode, displayName: name.trim() })
    );

    const result = await signUp(email, password);
    if (!result.ok) {
      if (result.code === 'EMAIL_EXISTS') {
        // Keep PENDING_JOIN_KEY — user signs in and _layout.tsx applies it.
        setEmailExists(true);
        return;
      }
      await AsyncStorage.removeItem(PENDING_JOIN_KEY);
      setError(result.message);
      return;
    }
    setNextStep(result.next ?? 'VERIFY_EMAIL');
  };

  // Account already exists for this email
  if (emailExists) {
    return (
      <AuthScreen>
        <BrandHeader />
        <AuthHeading
          title="Already registered"
          subtitle={`An account for ${email} already exists. Sign in — you'll be joined to the household automatically.`}
        />
        <AuthButton label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
        <AuthLink action="Use a different email" onPress={() => { setEmailExists(false); setEmail(''); setPassword(''); setConfirmPassword(''); }} />
      </AuthScreen>
    );
  }

  // Success: account created, waiting on email verify or sign-in
  if (nextStep) {
    const requiresVerification = nextStep === 'VERIFY_EMAIL';
    return (
      <AuthScreen>
        <BrandHeader />
        <AuthHeading
          title={requiresVerification ? 'Verify your email' : 'Ready to sign in'}
          subtitle={
            requiresVerification
              ? `We sent a verification link to ${email}. Open it, then sign in — you'll be joined to the household automatically.`
              : `Your account is ready. Sign in to complete joining the household.`
          }
        />
        <AuthButton label="Go to Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
      </AuthScreen>
    );
  }

  // Default: join form
  return (
    <AuthScreen>
      <BrandHeader />
      <AuthHeading title="Join with invite code" subtitle="Enter the invite code from your household, then create your account." />
      <View style={{ gap: spacing.md }}>
        <AuthMessage text={error} />
        <AuthField
          icon="key-outline"
          value={inviteCode}
          onChangeText={(v) => { setInviteCode(v.toUpperCase()); setError(''); }}
          placeholder="Invite code (e.g. ABC123)"
          autoCapitalize="characters"
          autoCorrect={false}
          style={{ fontFamily: fonts.monoMedium, fontSize: 18 }}
        />
        <AuthField
          icon="person-outline"
          value={name}
          onChangeText={(v) => { setName(v); setError(''); }}
          placeholder="Your name (shown to members)"
          autoCapitalize="words"
        />
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
        <AuthButton label="Join household" onPress={() => void submit()} loading={loading} />
      </View>
      <AuthLink prefix="Already have an account?" action="Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
    </AuthScreen>
  );
}
