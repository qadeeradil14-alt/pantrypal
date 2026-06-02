import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../store/auth';
import { useHouseholdStore } from '../store/household';
import { joinHousehold } from '../lib/households';
import { normalizeInviteCode } from '../lib/invites';
import { useTheme } from '../hooks/useTheme';

// Handles deep links: pantrypal://join?code=ABC123
export default function JoinDeepLink() {
  const { colors } = useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const inviteCode = normalizeInviteCode(code);
  const { session } = useAuthStore();
  const { setHousehold } = useHouseholdStore();

  useEffect(() => {
    if (!inviteCode) {
      router.replace('/(setup)/join-household');
      return;
    }

    if (!session?.user) {
      router.replace({ pathname: '/(auth)/sign-up', params: { joinCode: inviteCode, fromJoin: '1' } });
      return;
    }

    joinHousehold(inviteCode, session.user.id)
      .then((household) => {
        setHousehold({ id: household.id, name: household.name, inviteCode, role: 'member' });
        router.replace('/(main)/pantry');
      })
      .catch((e: any) => {
        router.replace({
          pathname: '/(setup)/join-household',
          params: { code: inviteCode, error: e?.message ?? 'Could not join. Check the code and try again.' },
        });
      });
  }, [inviteCode, session, router, setHousehold]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
