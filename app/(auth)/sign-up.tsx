import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signUp } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../hooks/useTheme';
import { fonts } from '../../constants/theme';
import type { AppColors } from '../../constants/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Enter your email address.';
  if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address (e.g. name@example.com).';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Enter a password.';
  if (password.trim().length === 0) return 'Password cannot be only spaces.';
  if (password.length < 6) return 'Password must be at least 6 characters.';
  return null;
}

function classifySignUpError(e: any): string {
  const msg: string = (e?.message ?? '').toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to')) {
    return 'No internet connection. Check your network and try again.';
  }
  if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('duplicate')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (msg.includes('rate') || msg.includes('too many')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  return e?.message ?? 'Something went wrong. Try again.';
}

export default function SignUpScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { joinCode, fromJoin } = useLocalSearchParams<{ joinCode?: string; fromJoin?: string }>();
  const deepLinkJoin =
    fromJoin === '1' &&
    typeof joinCode === 'string' &&
    /^[A-Z0-9]{6}$/i.test(joinCode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  function handleBack() {
    if (router.canGoBack()) { router.back(); return; }
    router.replace('/(auth)/welcome');
  }

  async function handleSignUp() {
    const emailErr = validateEmail(email);
    if (emailErr) { setError(emailErr); return; }
    const passErr = validatePassword(password);
    if (passErr) { setError(passErr); return; }

    setError('');
    setLoading(true);
    try {
      const data = await signUp(email.trim(), password);
      if (data.session || data.user) {
        if (deepLinkJoin) {
          router.replace({ pathname: '/join', params: { code: joinCode!.toUpperCase() } });
          return;
        }
        router.replace('/(setup)/check');
      } else {
        setNeedsVerification(true);
      }
    } catch (e: any) {
      setError(classifySignUpError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setResendSuccess(false);
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
      if (resendError) throw resendError;
      setResendSuccess(true);
    } catch (e: any) {
      const msg = (e?.message ?? '').toLowerCase();
      if (msg.includes('network') || msg.includes('fetch')) {
        setError('No internet connection. Try again when online.');
      } else {
        setError(e.message ?? 'Could not resend. Try again in a minute.');
      }
    } finally {
      setResending(false);
    }
  }

  if (needsVerification) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.verifyCard}>
          <View style={styles.iconWrap}>
            <Ionicons name="mail-unread-outline" size={22} color={colors.primary} />
          </View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a confirmation link to{'\n'}
            <Text style={styles.emailHighlight}>{email.trim()}</Text>
          </Text>
          <Text style={styles.verifyHint}>
            Tap the link to activate your account, then come back to sign in.
          </Text>
          <View style={styles.expiryNotice}>
            <Ionicons name="time-outline" size={14} color={colors.muted} />
            <Text style={styles.expiryNoticeText}>Confirmation links expire after 24 hours.</Text>
          </View>

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
          {resendSuccess ? <View style={styles.successBox}><Text style={styles.successText}>Sent! Check your inbox (and spam folder).</Text></View> : null}

          <TouchableOpacity style={[styles.btn, resending && styles.btnDisabled]} onPress={handleResend} disabled={resending}>
            {resending ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.btnText}>Resend confirmation email</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.link}>Already confirmed? Sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={styles.back} onPress={handleBack}>
        <Ionicons name="chevron-back" size={18} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.iconWrap}>
        <Ionicons name="person-add-outline" size={22} color={colors.primary} />
      </View>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.subtitle}>
        {deepLinkJoin
          ? `Create account to continue joining with code ${joinCode!.toUpperCase()}.`
          : "You'll invite your household partner after."}
      </Text>

      {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

      <TextInput
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
          style={styles.passwordInput}
          placeholder="Password (min 6 characters)"
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          value={password}
          onChangeText={(t) => { setPassword(t); if (error) setError(''); }}
          placeholderTextColor={colors.placeholder}
          returnKeyType="done"
          onSubmitEditing={handleSignUp}
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

      <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleSignUp} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.btnText}>Create account</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/(auth)/sign-in')}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
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
    successBox: { backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, marginBottom: 16, width: '100%' },
    successText: { color: colors.primaryDeep, fontSize: 14, textAlign: 'center' },
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
    link: { color: colors.primary, fontSize: 15, textAlign: 'center', fontFamily: fonts.bodySemiBold },
    verifyCard: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 8 },
    emailHighlight: { fontFamily: fonts.bodySemiBold, color: colors.ink },
    verifyHint: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: 4, fontFamily: fonts.body },
    expiryNotice: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: colors.faint, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8,
    },
    expiryNoticeText: { fontSize: 12, color: colors.muted, fontFamily: fonts.bodyMedium },
  });
}
