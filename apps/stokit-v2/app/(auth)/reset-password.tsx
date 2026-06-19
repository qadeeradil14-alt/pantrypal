import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card } from '../../components/shared/ui';
import { Logo } from '../../components/shared/Logo';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/auth-store';

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
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
    // Success: verifyResetCode left the user signed in, so _layout routes
    // them into the app automatically. Nothing else to do here.
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
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={{ marginBottom: spacing.md }}>
          <Logo size={64} color={colors.ink} />
        </View>
        <Text style={styles.eyebrow}>RESET PASSWORD</Text>
        <Text style={styles.title}>Enter your code</Text>
        <Text style={styles.body}>
          We sent an 8-digit code to{'\n'}{email || 'your email'}
        </Text>
        <Card style={styles.card}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            value={code}
            onChangeText={(value) => { setCode(value.replace(/[^0-9]/g, '').slice(0, 8)); setError(''); }}
            placeholder="8-digit code"
            placeholderTextColor={colors.faintText}
            keyboardType="number-pad"
            maxLength={8}
            style={[styles.input, styles.codeInput]}
          />
          <TextInput
            value={password}
            onChangeText={(value) => { setPassword(value); setError(''); }}
            placeholder="New password (8+ characters)"
            placeholderTextColor={colors.faintText}
            secureTextEntry
            autoComplete="new-password"
            style={styles.input}
          />
          <TextInput
            value={confirmPassword}
            onChangeText={(value) => { setConfirmPassword(value); setError(''); }}
            placeholder="Confirm new password"
            placeholderTextColor={colors.faintText}
            secureTextEntry
            autoComplete="new-password"
            style={styles.input}
          />
          <Button label={loading ? 'Resetting…' : 'Reset password'} onPress={() => void submit()} disabled={loading} />
          {resent ? (
            <Text style={styles.resent}>New code sent — check your inbox.</Text>
          ) : (
            <Button label="Resend code" onPress={() => void resend()} disabled={loading} variant="subtle" />
          )}
        </Card>
        <Text style={styles.link} onPress={() => router.replace('/(auth)/sign-in')}>Back to sign in</Text>
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
    codeInput: { fontFamily: fonts.mono, fontSize: 22, letterSpacing: 8, textAlign: 'center' },
    error: { fontFamily: fonts.sansMedium, color: colors.danger, lineHeight: 20 },
    resent: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.success, textAlign: 'center' },
    link: { marginTop: spacing.xl, textAlign: 'center', color: colors.primary, fontFamily: fonts.sansSemibold },
  });
}
