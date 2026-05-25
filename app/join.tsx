import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../store/auth';
import { useHouseholdStore } from '../store/household';
import { joinHousehold } from '../lib/households';

// Handles deep links: pantrypal://join?code=ABC123
export default function JoinDeepLink() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useAuthStore();
  const { setHousehold } = useHouseholdStore();

  useEffect(() => {
    if (!code || !session?.user) {
      // Not authed yet — send to sign-up with code preserved via router state
      router.replace({ pathname: '/(auth)/sign-up', params: { joinCode: code, fromJoin: '1' } });
      return;
    }

    joinHousehold(code, session.user.id)
      .then((household) => {
        setHousehold({ id: household.id, name: household.name, inviteCode: '', role: 'member' });
        router.replace('/(main)/pantry');
      })
      .catch(() => {
        router.replace('/(setup)/join-household');
      });
  }, [code, session]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#2D9CDB" />
    </View>
  );
}
