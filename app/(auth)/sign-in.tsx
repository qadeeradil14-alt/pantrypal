import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { signIn, resetPassword } from '../../lib/auth';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(auth)/welcome');
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError('Enter your email first, then tap Forgot password.'); return; }
    setError('');
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setError('');
      alert('Check your email for a password reset link.');
    } catch (e: any) {
      setError(e.message ?? 'Could not send reset email. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/(setup)/check');
    } catch (e: any) {
      setError('Wrong email or password. Try again.');
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
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Welcome back</Text>

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
        placeholder="Password"
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
        placeholderTextColor="#aaa"
      />

      <TouchableOpacity style={styles.btn} onPress={handleSignIn} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign in</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleForgotPassword}>
        <Text style={styles.forgotLink}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push({ pathname: '/(auth)/sign-up', params: { fromJoin: '0' } })}>
        <Text style={styles.link}>No account yet? Sign up</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 28, paddingTop: 60 },
  back: { marginBottom: 32 },
  backText: { color: '#16A34A', fontSize: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a1a', marginBottom: 32 },
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
    backgroundColor: '#16A34A', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 16,
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  forgotLink: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  link: { color: '#16A34A', fontSize: 15, textAlign: 'center' },
});
