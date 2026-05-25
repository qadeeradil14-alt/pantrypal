import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Share, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createHousehold } from '../../lib/households';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';

export default function CreateHouseholdScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const { setHousehold } = useHouseholdStore();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(setup)/create-or-join');
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Enter a name for your household.'); return; }
    if (!session?.user) return;
    setError('');
    setLoading(true);
    try {
      const household = await createHousehold(name.trim(), session.user.id);
      setHousehold({ id: household.id, name: household.name, inviteCode: household.invite_code, role: 'owner' });
      setInviteCode(household.invite_code);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    if (!inviteCode) return;
    await Share.share({
      message: `Join my household on PantryPal! Use invite code: ${inviteCode}`,
    });
  }

  if (inviteCode) {
    return (
      <View style={styles.container}>
        <View style={styles.successHero}>
          <Text style={styles.checkEmoji}>✅</Text>
          <Text style={styles.title}>Household created!</Text>
          <Text style={styles.subtitle}>Share this code with your household partner.</Text>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Invite code</Text>
          <Text style={styles.codeValue}>{inviteCode}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleShare}>
            <Text style={styles.primaryBtnText}>Share invite code</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.replace('/(main)/pantry')}>
            <Text style={styles.secondaryBtnText}>Continue to pantry</Text>
          </TouchableOpacity>
        </View>
      </View>
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
      <Text style={styles.title}>Name your household</Text>
      <Text style={styles.subtitle}>Something like "The Smiths" or "Our Apartment".</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Household name"
        autoCapitalize="words"
        autoFocus
        value={name}
        onChangeText={setName}
        onSubmitEditing={handleCreate}
        returnKeyType="done"
        placeholderTextColor="#aaa"
      />

      <TouchableOpacity style={styles.primaryBtn} onPress={handleCreate} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create household</Text>}
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
  primaryBtn: {
    backgroundColor: '#2D9CDB', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { color: '#2D9CDB', fontSize: 16 },
  successHero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  checkEmoji: { fontSize: 64 },
  codeCard: {
    backgroundColor: '#F0F9FF', borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 32,
  },
  codeLabel: { fontSize: 13, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  codeValue: { fontSize: 36, fontWeight: '800', color: '#1a1a1a', letterSpacing: 6 },
  actions: { paddingBottom: 48, gap: 12 },
});
