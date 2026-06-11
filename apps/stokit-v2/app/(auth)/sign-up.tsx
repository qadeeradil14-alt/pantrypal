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
  const loading = useAuthStore((s) => s.loading);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

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
      setError(result.message);
      return;
    }
    // _layout.tsx will automatically redirect unverified users to /verify-email
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={{ marginBottom: spacing.md }}>
          <Logo size={64} color={colors.ink} accent={colors.primary} />
        </View>
        <Text style={styles.eyebrow}>NEW ACCOUNT</Text>
        <Text style={styles.title}>Create your Stokit</Text>
        <Text style={styles.body}>You’ll verify your email before entering the app.</Text>
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
    link: { marginTop: spacing.xl, textAlign: 'center', color: colors.primary, fontFamily: fonts.sansSemibold },
  });
}
