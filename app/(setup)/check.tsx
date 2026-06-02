import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getMyHousehold } from '../../lib/households';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';
import { useTheme } from '../../hooks/useTheme';

export default function CheckScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuthStore();
  const { setHousehold } = useHouseholdStore();

  useEffect(() => {
    if (!session?.user) {
      router.replace('/(auth)/welcome');
      return;
    }

    getMyHousehold(session.user.id)
      .then((data) => {
        const raw = data?.households;
        const h = Array.isArray(raw) ? raw[0] : raw;
        if (h && data?.role) {
          setHousehold({
            id: h.id,
            name: h.name,
            inviteCode: h.invite_code,
            role: data.role,
            plan: h.plan ?? 'free',
          });
          router.replace('/(main)/pantry');
        } else {
          router.replace('/(setup)/create-or-join');
        }
      })
      .catch(() => {
        router.replace('/(setup)/create-or-join');
      });
  }, [session, router, setHousehold]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
