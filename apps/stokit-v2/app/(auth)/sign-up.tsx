import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Button, Card } from '../../components/shared/ui';
import { Logo } from '../../components/shared/Logo';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/auth-store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignUpScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
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
      router.push({ pathname: '/(auth)/reset-password', params: { email: email.trim() } });
    }
  };

  // Screen: account already exists for this email
  if (emailExists) {
    return (
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={{ marginBottom: spacing.md }}>
            <Logo size={64} color={colors.ink} accent={colors.primary} />
          </View>
          <Text style={styles.eyebrow}>ACCOUNT EXISTS</Text>
          <Text style={styles.title}>Already registered</Text>
          <Text style={styles.body}>An account for {email} already exists. Sign in or reset your password.</Text>
          <Card style={styles.card}>
            <Button label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
            {resetSent ? (
              <Text style={styles.successMsg}>Reset email sent — check your inbox.</Text>
            ) : (
              <Button label={loading ? 'Sending…' : 'Forgot password? Send reset email'} onPress={() => void sendReset()} disabled={loading} variant="subtle" />
            )}
          </Card>
          <Text style={styles.link} onPress={() => { setEmailExists(false); setEmail(''); setPassword(''); setConfirmPassword(''); }}>
            Use a different email
          </Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Screen: verification email sent
  if (nextStep) {
    const requiresVerification = nextStep === 'VERIFY_EMAIL';
    return (
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={{ marginBottom: spacing.md }}>
            <Logo size={64} color={colors.ink} accent={colors.primary} />
          </View>
          <Text style={styles.eyebrow}>{requiresVerification ? 'CHECK YOUR INBOX' : 'ACCOUNT CREATED'}</Text>
          <Text style={styles.title}>{requiresVerification ? 'Verify your email' : 'Ready to sign in'}</Text>
          <Text style={styles.body}>
            {requiresVerification ? `We sent a verification link to\n${email}` : `Your account was created for\n${email}`}
          </Text>
          <Text style={styles.bodyMuted}>
            {requiresVerification ? 'Open the link then come back to sign in.' : 'Sign in to continue with this account.'}
          </Text>
          <Card style={styles.card}>
            <Button label="Go to Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
          </Card>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Default: sign-up form
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={{ marginBottom: spacing.md }}>
          <Logo size={64} color={colors.ink} accent={colors.primary} />
        </View>
        <Text style={styles.eyebrow}>NEW ACCOUNT</Text>
        <Text style={styles.title}>Create your Stokit</Text>
        <Text style={styles.body}>Create an account to keep your pantry connected.</Text>
        <Card style={styles.card}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput value={email} onChangeText={(value) => { setEmail(value); setError(''); }} placeholder="Email" placeholderTextColor={colors.faintText} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={styles.input} />
          <TextInput value={password} onChangeText={(value) => { setPassword(value); setError(''); }} placeholder="Password (8+ characters)" placeholderTextColor={colors.faintText} secureTextEntry autoComplete="new-password" style={styles.input} />
          <TextInput value={confirmPassword} onChangeText={(value) => { setConfirmPassword(value); setError(''); }} placeholder="Confirm password" placeholderTextColor={colors.faintText} secureTextEntry autoComplete="new-password" style={styles.input} />
          <Button label={loading ? 'Creating account…' : 'Create account'} onPress={() => void submit()} disabled={loading} />
        </Card>
        <Link href="/(auth)/sign-in" style={styles.link}>Already have an account? Sign in</Link>
      </View>
    </KeyboardAvoidingView>
  );
}


function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, justifyContent: 'center', padding: spacing.xl },
    eyebrow: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1.5, color: colors.muted, marginBottom: spacing.sm },
    title: { fontFamily: fonts.serifItalic, fontSize: 40, lineHeight: 46, color: colors.ink, marginBottom: spacing.sm },
    body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.muted, marginBottom: spacing.xl },
    card: { gap: spacing.md },
    input: { height: 50, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, color: colors.ink, fontFamily: fonts.sans },
    error: { fontFamily: fonts.sansMedium, color: colors.danger, lineHeight: 20 },
    bodyMuted: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.xl },
    successMsg: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.success, textAlign: 'center' },
    link: { marginTop: spacing.xl, textAlign: 'center', color: colors.primary, fontFamily: fonts.sansSemibold },
  });
}
