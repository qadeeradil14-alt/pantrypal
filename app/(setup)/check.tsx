import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { getMyHousehold } from '../../lib/households';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';
import { useTheme } from '../../hooks/useTheme';
import { fonts } from '../../constants/theme';

export default function CheckScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuthStore();
  const { setHousehold, setLoading } = useHouseholdStore();
  const [error, setError] = useState<string | null>(null);

  const restoreHousehold = useCallback(() => {
    if (!session?.user) {
      router.replace('/(auth)/welcome');
      return;
    }

    let cancelled = false;
    setError(null);
    setLoading(true);
    getMyHousehold(session.user.id)
      .then((data) => {
        if (cancelled) return;
        const raw = data?.households;
        const h = Array.isArray(raw) ? raw[0] : raw;
        if (h && data?.role) {
          setHousehold({
            id: h.id,
            name: h.name,
            inviteCode: h.invite_code ?? '',
            role: data.role,
            plan: h.plan ?? 'free',
          });
          router.replace('/(main)/pantry');
        } else {
          setHousehold(null);
          router.replace('/(setup)/create-or-join');
        }
      })
      .catch((e: any) => {
        if (!cancelled) {
          setError(e?.message ?? 'Could not restore your household.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session, router, setHousehold, setLoading]);

  useEffect(restoreHousehold, [restoreHousehold]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      {error ? (
        <>
          <Text style={[styles.text, { color: colors.muted }]}>{error}</Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={restoreHousehold}>
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Try again</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.text, { color: colors.muted }]}>Restoring your household...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { marginTop: 14, fontSize: 14, fontFamily: fonts.bodyMedium },
  button: { marginTop: 18, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  buttonText: { fontSize: 15, fontFamily: fonts.bodySemiBold },
});
