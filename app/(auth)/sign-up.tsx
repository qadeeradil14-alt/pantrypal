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
    if (!email || !password) { setError('Enter your email and a password.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
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
      setError(e.message ?? 'Something went wrong. Try again.');
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
      setError(e.message ?? 'Could not resend. Try again in a minute.');
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
            Tap the link in that email to activate your account, then come back to sign in.
          </Text>

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
          {resendSuccess ? <View style={styles.successBox}><Text style={styles.successText}>Sent! Check your inbox (and spam folder).</Text></View> : null}

          <TouchableOpacity style={[styles.btn, resending && styles.btnDisabled]} onPress={handleResend} disabled={resending}>
            {resending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Resend confirmation email</Text>}
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
        onChangeText={setEmail}
        placeholderTextColor={colors.placeholder}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (min 6 characters)"
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
        placeholderTextColor={colors.placeholder}
      />

      <TouchableOpacity style={styles.btn} onPress={handleSignUp} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>Create account</Text>}
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
      borderWidth: 1, borderColor: colors.border, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
      marginBottom: 12, color: colors.ink, backgroundColor: colors.surface,
    },
    btn: {
      backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 16,
    },
    btnDisabled: { backgroundColor: colors.disabled },
    btnText: { color: '#FFFFFF', fontSize: 17, fontFamily: fonts.bodySemiBold },
    link: { color: colors.primary, fontSize: 15, textAlign: 'center', fontFamily: fonts.bodySemiBold },
    verifyCard: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 8 },
    emailHighlight: { fontFamily: fonts.bodySemiBold, color: colors.ink },
    verifyHint: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: 8, fontFamily: fonts.body },
  });
}
