import { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';
import { useTheme } from '../../hooks/useTheme';
import { fonts } from '../../constants/theme';

export default function CheckScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { status, load } = useHouseholdStore();

  // Belt-and-suspenders: useHouseholdLoader in app/_layout.tsx normally triggers
  // the load, but if this screen is reached before that hook fires (cold start
  // race or deeplink), kick off the load here as well.
  useEffect(() => {
    if (userId && status === 'idle') {
      void load(userId);
    }
  }, [userId, status, load]);

  // Route once the fetch settles.
  useEffect(() => {
    if (status === 'ready') {
      router.replace('/(main)/pantry');
    } else if (status === 'none') {
      router.replace('/(setup)/create-or-join');
    }
  }, [status, router]);

  if (status === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.message, { color: colors.muted }]}>
          Could not load your household.{'\n'}Check your connection and try again.
        </Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          onPress={() => userId && void load(userId)}
        >
          <Text style={[styles.retryText, { color: colors.onPrimary }]}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.message, { color: colors.muted }]}>Restoring your household…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  message: { marginTop: 14, fontSize: 14, fontFamily: fonts.bodyMedium, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { marginTop: 18, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  retryText: { fontSize: 15, fontFamily: fonts.bodySemiBold },
});
