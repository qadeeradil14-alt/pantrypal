import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { joinHousehold } from '../../lib/households';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';
import { useTheme } from '../../hooks/useTheme';
import { fonts, type AppColors } from '../../constants/theme';

export default function JoinHouseholdScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuthStore();
  const { setHousehold } = useHouseholdStore();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  function handleBack() {
    if (router.canGoBack()) { router.back(); return; }
    router.replace('/(setup)/create-or-join');
  }

  async function handleJoin() {
    if (code.trim().length < 6) { setError('Enter the 6-character invite code.'); return; }
    if (!session?.user) return;
    setError('');
    setLoading(true);
    try {
      const household = await joinHousehold(code.trim(), session.user.id);
      setHousehold({ id: household.id, name: household.name, inviteCode: code.trim().toUpperCase(), role: 'member' });
      router.replace('/(main)/pantry');
    } catch (e: any) {
      setError(e.message ?? 'Invalid code. Check and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={styles.back} onPress={handleBack}>
        <Ionicons name="chevron-back" size={18} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.iconWrap}>
        <Ionicons name="key-outline" size={22} color={colors.primary} />
      </View>
      <Text style={styles.title}>Join a household</Text>
      <Text style={styles.subtitle}>Ask your partner for the 6-character invite code.</Text>

      {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

      <TextInput
        style={[styles.input, styles.codeInput]}
        placeholder="ABC123"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        keyboardType="default"
        maxLength={6}
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        onSubmitEditing={handleJoin}
        returnKeyType="join"
        placeholderTextColor={colors.placeholder}
      />

      <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleJoin} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.btnText}>Join household</Text>}
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
    subtitle: { fontSize: 16, color: colors.muted, fontFamily: fonts.bodyMedium, marginBottom: 28, lineHeight: 22 },
    errorBox: { backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12, marginBottom: 16 },
    errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    input: {
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      marginBottom: 20,
      color: colors.ink,
      backgroundColor: colors.faint,
    },
    codeInput: {
      fontSize: 30,
      fontFamily: fonts.monoMedium,
      letterSpacing: 10,
      textAlign: 'center',
      paddingVertical: 22,
      borderRadius: 14,
      backgroundColor: colors.primarySoft,
      color: colors.ink,
    },
    btn: {
      backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: 'center',
    },
    btnDisabled: { backgroundColor: colors.disabled },
    btnText: { color: colors.onPrimary, fontSize: 17, fontFamily: fonts.bodySemiBold },
  });
}
