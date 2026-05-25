import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { signUp } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

export default function SignUpScreen() {
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

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(auth)/welcome');
  }

  async function handleSignUp() {
    if (!email || !password) { setError('Enter your email and a password.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setError('');
    setLoading(true);
    try {
      const data = await signUp(email.trim(), password);
      // Session is set via onAuthStateChange in _layout.tsx — navigate immediately
      if (data.session || data.user) {
        if (deepLinkJoin) {
          router.replace({ pathname: '/join', params: { code: joinCode!.toUpperCase() } });
          return;
        }
        router.replace('/(setup)/check');
      } else {
        // Email confirmation required — show resend UI instead of a dead-end error
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
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });
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
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.verifyCard}>
          <Text style={styles.verifyEmoji}>📬</Text>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a confirmation link to{'\n'}
            <Text style={styles.emailHighlight}>{email.trim()}</Text>
          </Text>
          <Text style={styles.verifyHint}>
            Tap the link in that email to activate your account, then come back to sign in.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {resendSuccess ? (
            <Text style={styles.resendSuccess}>Sent! Check your inbox (and spam folder).</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, resending && styles.btnDisabled]}
            onPress={handleResend}
            disabled={resending}
          >
            {resending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Resend confirmation email</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.link}>Already confirmed? Sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.back} onPress={handleBack}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.subtitle}>
        {deepLinkJoin
          ? `Create account to continue joining with code ${joinCode!.toUpperCase()}.`
          : "You'll invite your household partner after."
        }
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        placeholderTextColor="#aaa"
      />
      <TextInput
        style={styles.input}
        placeholder="Password (min 6 characters)"
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
        placeholderTextColor="#aaa"
      />

      <TouchableOpacity style={styles.btn} onPress={handleSignUp} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/(auth)/sign-in')}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 28, paddingTop: 60 },
  back: { marginBottom: 32 },
  backText: { color: '#2D9CDB', fontSize: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888', marginBottom: 32 },
  error: {
    backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 8,
    padding: 12, marginBottom: 16, fontSize: 14,
  },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    marginBottom: 12, color: '#1a1a1a',
  },
  btn: {
    backgroundColor: '#2D9CDB', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 16,
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  link: { color: '#2D9CDB', fontSize: 15, textAlign: 'center' },
  btnDisabled: { backgroundColor: '#93C5FD' },
  verifyCard: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 8 },
  verifyEmoji: { fontSize: 56, marginBottom: 8 },
  emailHighlight: { fontWeight: '700', color: '#1a1a1a' },
  verifyHint: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  resendSuccess: {
    backgroundColor: '#D1FAE5', color: '#065F46', borderRadius: 8,
    padding: 12, fontSize: 14, textAlign: 'center', width: '100%',
  },
});
