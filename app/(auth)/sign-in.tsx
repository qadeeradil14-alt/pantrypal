import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signIn, resetPassword } from '../../lib/auth';
import { colors, radii } from '../../constants/theme';

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
        <Ionicons name="chevron-back" size={18} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
      <View style={styles.iconWrap}>
        <Ionicons name="lock-closed-outline" size={22} color={colors.primary} />
      </View>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to your shared kitchen workspace.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

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
        placeholder="Password"
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
        placeholderTextColor={colors.placeholder}
      />

      <TouchableOpacity style={styles.btn} onPress={handleSignIn} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.btnText}>Sign in</Text>}
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
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 28, paddingTop: 60 },
  back: { marginBottom: 30, flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: { fontSize: 32, fontWeight: '800', color: colors.ink, marginBottom: 8 },
  subtitle: { fontSize: 16, color: colors.muted, fontWeight: '700', marginBottom: 28, lineHeight: 22 },
  error: {
    backgroundColor: colors.dangerSoft, color: colors.dangerText, borderRadius: radii.sm,
    padding: 12, marginBottom: 16, fontSize: 14,
  },
  input: {
    borderWidth: 1, borderColor: colors.faint, borderRadius: radii.md,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    marginBottom: 12, color: colors.ink, backgroundColor: colors.surface,
  },
  btn: {
    backgroundColor: colors.primary, borderRadius: radii.md,
    paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 16,
  },
  btnText: { color: colors.surface, fontSize: 17, fontWeight: '800' },
  forgotLink: { color: colors.muted, fontSize: 14, textAlign: 'center', marginBottom: 12, fontWeight: '700' },
  link: { color: colors.primary, fontSize: 15, textAlign: 'center', fontWeight: '800' },
});
