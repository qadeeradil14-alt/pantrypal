import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card } from '../../components/shared/ui';
import { Logo } from '../../components/shared/Logo';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { isEmailVerified, useAuthStore } from '../../store/auth-store';

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(typeof params.message === 'string' ? params.message : '');

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
      // Email with an 8-digit code is on its way — go to the code-entry screen.
      router.push({ pathname: '/(auth)/reset-password', params: { email: email.trim() } });
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
        <Text style={styles.eyebrow}>WELCOME BACK</Text>
        <Text style={styles.title}>Sign in to Stokit</Text>
        <Text style={styles.body}>Your pantry and shopping trips stay private to your account.</Text>
        <Card style={styles.card}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            value={email}
            onChangeText={(value) => { setEmail(value); setError(''); }}
            placeholder="Email"
            placeholderTextColor={colors.faintText}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={styles.input}
          />
          <View style={styles.passwordRow}>
            <TextInput
              value={password}
              onChangeText={(value) => { setPassword(value); setError(''); }}
              placeholder="Password"
              placeholderTextColor={colors.faintText}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              style={styles.passwordInput}
            />
            <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={10}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
            </Pressable>
          </View>
          <Button label={loading ? 'Signing in…' : 'Sign in'} onPress={() => void submit()} disabled={loading} />
          <Button
            label={loading ? 'Sending…' : 'Forgot password?'}
            onPress={() => void sendReset()}
            disabled={loading}
            variant="subtle"
          />
        </Card>
        <Link href="/(auth)/sign-up" style={styles.link}>Don't have an account? Sign up</Link>
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
    passwordRow: { height: 50, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center' },
    passwordInput: { flex: 1, color: colors.ink, fontFamily: fonts.sans },
    error: { fontFamily: fonts.sansMedium, color: colors.danger, lineHeight: 20 },
    resetSent: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.success, textAlign: 'center' },
    link: { marginTop: spacing.xl, textAlign: 'center', color: colors.primary, fontFamily: fonts.sansSemibold },
  });
}
