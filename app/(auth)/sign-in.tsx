import { useRef, useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signIn, resetPassword } from '../../lib/auth';
import { useTheme } from '../../hooks/useTheme';
import { fonts } from '../../constants/theme';
import type { AppColors } from '../../constants/theme';

function classifyAuthError(e: any): string {
  const msg: string = (e?.message ?? '').toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to')) {
    return 'No internet connection. Check your network and try again.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox.';
  }
  if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('wrong')) {
    return 'Wrong email or password. Try again.';
  }
  if (msg.includes('rate') || msg.includes('too many')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  return 'Sign in failed. Check your connection and try again.';
}

export default function SignInScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInput>(null);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  function handleBack() {
    if (router.canGoBack()) { router.back(); return; }
    router.replace('/(auth)/welcome');
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError('Enter your email first, then tap Forgot password.');
      emailRef.current?.focus();
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword(email.trim());
      alert('Check your email for a password reset link.');
    } catch (e: any) {
      const msg = (e?.message ?? '').toLowerCase();
      if (msg.includes('network') || msg.includes('fetch')) {
        setError('No internet connection. Try again when online.');
      } else {
        setError(e.message ?? 'Could not send reset email. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) { setError('Enter your email and password.'); return; }
    if (!trimmedEmail.includes('@')) { setError('Enter a valid email address.'); return; }
    setError('');
    setLoading(true);
    try {
      await signIn(trimmedEmail, password);
      router.replace('/(setup)/check');
    } catch (e: any) {
      setError(classifyAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.back} onPress={handleBack}>
        <Ionicons name="chevron-back" size={18} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.iconWrap}>
        <Ionicons name="lock-closed-outline" size={22} color={colors.primary} />
      </View>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to your shared kitchen workspace.</Text>

      {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

      <TextInput
        ref={emailRef}
        testID="auth-sign-in-email"
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={email}
        onChangeText={(t) => { setEmail(t); if (error) setError(''); }}
        placeholderTextColor={colors.placeholder}
        returnKeyType="next"
      />

      <View style={styles.passwordWrap}>
        <TextInput
          testID="auth-sign-in-password"
          style={styles.passwordInput}
          placeholder="Password"
          secureTextEntry={!showPassword}
          autoComplete="current-password"
          value={password}
          onChangeText={(t) => { setPassword(t); if (error) setError(''); }}
          placeholderTextColor={colors.placeholder}
          returnKeyType="done"
          onSubmitEditing={handleSignIn}
        />
        <TouchableOpacity
          hitSlop={10}
          style={styles.eyeBtn}
          onPress={() => setShowPassword((v) => !v)}
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
        >
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        testID="auth-sign-in-submit"
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={handleSignIn}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.btnText}>Sign in</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleForgotPassword} disabled={loading}>
        <Text style={styles.forgotLink}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push({ pathname: '/(auth)/sign-up', params: { fromJoin: '0' } })}>
        <Text style={styles.link}>No account yet? Sign up</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 28, paddingTop: 60 },
    back: { marginBottom: 30, flexDirection: 'row', alignItems: 'center', gap: 4 },
    backText: { color: colors.primary, fontSize: 16, fontFamily: fonts.bodySemiBold },
    iconWrap: {
      width: 50, height: 50, borderRadius: 16,
      backgroundColor: colors.primarySoft,
      alignItems: 'center', justifyContent: 'center', marginBottom: 18,
    },
    title: { fontSize: 32, fontFamily: fonts.displayExtraBold, color: colors.ink, marginBottom: 8 },
    subtitle: { fontSize: 16, color: colors.muted, fontFamily: fonts.body, marginBottom: 28, lineHeight: 22 },
    errorBox: { backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12, marginBottom: 16 },
    errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    input: {
      borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, marginBottom: 12, color: colors.ink,
      backgroundColor: colors.faint, fontFamily: fonts.body,
    },
    passwordWrap: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.faint, borderRadius: 14, marginBottom: 12,
    },
    passwordInput: {
      flex: 1, paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, color: colors.ink, fontFamily: fonts.body,
    },
    eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
    btn: {
      backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 16,
    },
    btnDisabled: { opacity: 0.65 },
    btnText: { color: colors.onPrimary, fontSize: 17, fontFamily: fonts.bodySemiBold },
    forgotLink: { color: colors.muted, fontSize: 14, textAlign: 'center', marginBottom: 12, fontFamily: fonts.bodyMedium },
    link: { color: colors.primary, fontSize: 15, textAlign: 'center', fontFamily: fonts.bodySemiBold },
  });
}
