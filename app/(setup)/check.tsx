import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getMyHousehold } from '../../lib/households';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';

export default function CheckScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const { setHousehold } = useHouseholdStore();

  useEffect(() => {
    if (!session?.user) return;

    getMyHousehold(session.user.id).then((data) => {
      if (data?.households) {
        const h = data.households as any;
        setHousehold({ id: h.id, name: h.name, inviteCode: h.invite_code, role: data.role });
        router.replace('/(main)/pantry');
      } else {
        router.replace('/(setup)/create-or-join');
      }
    });
  }, [session]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#2D9CDB" />
    </View>
  );
}
