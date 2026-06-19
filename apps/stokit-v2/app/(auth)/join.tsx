import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Card } from '../../components/shared/ui';
import { Logo } from '../../components/shared/Logo';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/auth-store';
import { normalizeInviteCode } from '../../core/services/household';

export const PENDING_JOIN_KEY = 'stokit:v2:pending-join';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function JoinScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
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

  // Pre-fill from deep link: pantrypal://join?invite=CODE
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
      await AsyncStorage.removeItem(PENDING_JOIN_KEY);
      if (result.code === 'EMAIL_EXISTS') {
        setEmailExists(true);
        return;
      }
      setError(result.message);
      return;
    }
    setNextStep(result.next ?? 'VERIFY_EMAIL');
  };

  // Account already exists for this email
  if (emailExists) {
    return (
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.scroll}>
          <View style={{ marginBottom: spacing.md }}>
            <Logo size={64} color={colors.ink} />
          </View>
          <Text style={styles.eyebrow}>ACCOUNT EXISTS</Text>
          <Text style={styles.title}>Already registered</Text>
          <Text style={styles.body}>
            An account for {email} already exists. Sign in — you'll be joined to the household automatically.
          </Text>
          <Card style={styles.card}>
            <Button label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
          </Card>
          <Text style={styles.link} onPress={() => { setEmailExists(false); setEmail(''); setPassword(''); setConfirmPassword(''); }}>
            Use a different email
          </Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Success: account created, waiting on email verify or sign-in
  if (nextStep) {
    const requiresVerification = nextStep === 'VERIFY_EMAIL';
    return (
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.scroll}>
          <View style={{ marginBottom: spacing.md }}>
            <Logo size={64} color={colors.ink} />
          </View>
          <Text style={styles.eyebrow}>{requiresVerification ? 'CHECK YOUR INBOX' : 'ACCOUNT CREATED'}</Text>
          <Text style={styles.title}>{requiresVerification ? 'Verify your email' : 'Ready to sign in'}</Text>
          <Text style={styles.body}>
            {requiresVerification
              ? `We sent a verification link to\n${email}\n\nOpen the link, then sign in — you'll be joined to the household automatically.`
              : `Your account is ready.\nSign in to complete joining the household.`}
          </Text>
          <Card style={styles.card}>
            <Button label="Go to Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
          </Card>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Default: join form
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: spacing.md }}>
          <Logo size={64} color={colors.ink} />
        </View>
        <Text style={styles.eyebrow}>JOIN HOUSEHOLD</Text>
        <Text style={styles.title}>Join with invite code</Text>
        <Text style={styles.body}>Enter the invite code from your household, then create your account.</Text>
        <Card style={styles.card}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            value={inviteCode}
            onChangeText={(v) => { setInviteCode(v.toUpperCase()); setError(''); }}
            placeholder="Invite code (e.g. ABC123)"
            placeholderTextColor={colors.faintText}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, styles.inputCode]}
          />
          <TextInput
            value={name}
            onChangeText={(v) => { setName(v); setError(''); }}
            placeholder="Your name (shown to members)"
            placeholderTextColor={colors.faintText}
            autoCapitalize="words"
            style={styles.input}
          />
          <TextInput
            value={email}
            onChangeText={(v) => { setEmail(v); setError(''); }}
            placeholder="Email"
            placeholderTextColor={colors.faintText}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={(v) => { setPassword(v); setError(''); }}
            placeholder="Password (8+ characters)"
            placeholderTextColor={colors.faintText}
            secureTextEntry
            autoComplete="new-password"
            style={styles.input}
          />
          <TextInput
            value={confirmPassword}
            onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
            placeholder="Confirm password"
            placeholderTextColor={colors.faintText}
            secureTextEntry
            autoComplete="new-password"
            style={styles.input}
          />
          <Button
            label={loading ? 'Creating account…' : 'Join household'}
            onPress={() => void submit()}
            disabled={loading}
          />
        </Card>
        <Text style={styles.link} onPress={() => router.replace('/(auth)/sign-in')}>
          Already have an account? Sign in
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
    eyebrow: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1.5, color: colors.muted, marginBottom: spacing.sm },
    title: { fontFamily: fonts.serifItalic, fontSize: 40, lineHeight: 46, color: colors.ink, marginBottom: spacing.sm },
    body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.muted, marginBottom: spacing.xl },
    card: { gap: spacing.md },
    input: { height: 50, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, color: colors.ink, fontFamily: fonts.sans },
    inputCode: { fontFamily: fonts.monoMedium, fontSize: 18, letterSpacing: 2, textAlign: 'center' },
    error: { fontFamily: fonts.sansMedium, color: colors.danger, lineHeight: 20 },
    link: { marginTop: spacing.xl, textAlign: 'center', color: colors.primary, fontFamily: fonts.sansSemibold },
  });
}
