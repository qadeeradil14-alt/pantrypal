import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createHousehold } from '../../lib/households';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';
import { useTheme } from '../../hooks/useTheme';
import type { AppColors } from '../../constants/theme';

export default function CreateHouseholdScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuthStore();
  const { setHousehold } = useHouseholdStore();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  function handleBack() {
    if (router.canGoBack()) { router.back(); return; }
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
    await Share.share({ message: `Join my household on PantryPal! Use invite code: ${inviteCode}` });
  }

  if (inviteCode) {
    return (
      <View style={styles.container}>
        <View style={styles.successHero}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
          </View>
          <Text style={styles.title}>Household created!</Text>
          <Text style={styles.subtitle}>Share this code with your household partner.</Text>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Invite code</Text>
          <Text style={styles.codeValue}>{inviteCode}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Share invite code</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.replace('/(main)/pantry')} activeOpacity={0.7}>
            <Text style={styles.secondaryBtnText}>Continue to pantry →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={styles.back} onPress={handleBack}>
        <Ionicons name="chevron-back" size={18} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.iconWrap}>
        <Ionicons name="home-outline" size={22} color={colors.primary} />
      </View>
      <Text style={styles.title}>Name your household</Text>
      <Text style={styles.subtitle}>Something like "The Smiths" or "Our Apartment".</Text>

      {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

      <TextInput
        style={styles.input}
        placeholder="Household name"
        autoCapitalize="words"
        autoFocus
        value={name}
        onChangeText={setName}
        onSubmitEditing={handleCreate}
        returnKeyType="done"
        placeholderTextColor={colors.placeholder}
      />

      <TouchableOpacity style={[styles.primaryBtn, loading && styles.btnDisabled]} onPress={handleCreate} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create household</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 28, paddingTop: 60 },
    back: { marginBottom: 30, flexDirection: 'row', alignItems: 'center', gap: 4 },
    backText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
    iconWrap: {
      width: 50, height: 50, borderRadius: 16,
      backgroundColor: colors.primarySoft,
      alignItems: 'center', justifyContent: 'center', marginBottom: 18,
    },
    title: { fontSize: 32, fontWeight: '800', color: colors.ink, marginBottom: 8 },
    subtitle: { fontSize: 16, color: colors.muted, fontWeight: '600', marginBottom: 28, lineHeight: 22 },
    errorBox: { backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12, marginBottom: 16 },
    errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
      marginBottom: 12, color: colors.ink, backgroundColor: colors.surface,
    },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: 'center', marginTop: 8,
      flexDirection: 'row', justifyContent: 'center', gap: 8,
    },
    btnDisabled: { backgroundColor: colors.disabled },
    primaryBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
    secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
    secondaryBtnText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
    successHero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    successIconWrap: {
      width: 90, height: 90, borderRadius: 30,
      backgroundColor: colors.successSoft,
      alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    },
    codeCard: {
      backgroundColor: colors.surface, borderRadius: 20, padding: 28,
      alignItems: 'center', marginBottom: 32,
      borderWidth: 1, borderColor: colors.border,
    },
    codeLabel: { fontSize: 12, color: colors.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '800' },
    codeValue: { fontSize: 38, fontWeight: '800', color: colors.ink, letterSpacing: 8 },
    actions: { paddingBottom: 48, gap: 12 },
  });
}
