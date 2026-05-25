import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { joinHousehold } from '../../lib/households';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';

export default function JoinHouseholdScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const { setHousehold } = useHouseholdStore();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(setup)/create-or-join');
  }

  async function handleJoin() {
    if (code.trim().length < 6) { setError('Enter the 6-character invite code.'); return; }
    if (!session?.user) return;
    setError('');
    setLoading(true);
    try {
      const household = await joinHousehold(code.trim(), session.user.id);
      setHousehold({ id: household.id, name: household.name, inviteCode: '', role: 'member' });
      router.replace('/(main)/pantry');
    } catch (e: any) {
      setError(e.message ?? 'Invalid code. Check and try again.');
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
      <Text style={styles.title}>Join a household</Text>
      <Text style={styles.subtitle}>Ask your partner for the 6-character invite code.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={[styles.input, styles.codeInput]}
        placeholder="ABC123"
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        maxLength={6}
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        onSubmitEditing={handleJoin}
        returnKeyType="join"
        placeholderTextColor="#aaa"
      />

      <TouchableOpacity style={styles.btn} onPress={handleJoin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Join household</Text>}
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
  codeInput: {
    fontSize: 28, fontWeight: '700', letterSpacing: 8,
    textAlign: 'center', paddingVertical: 20,
  },
  btn: {
    backgroundColor: '#2D9CDB', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
