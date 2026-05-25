import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { fetchStores } from '../../lib/stores';
import { startGeofencing, stopGeofencing } from '../../lib/geofencing';
import { useRealtime } from '../../lib/realtime';
import { useHouseholdStore } from '../../store/household';
import { useStoresStore } from '../../store/stores';

export default function MainLayout() {
  const householdId = useHouseholdStore((s) => s.household?.id);
  const setStores = useStoresStore((s) => s.setStores);
  useRealtime(householdId ?? null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapStoresAndGeofencing() {
      if (!householdId) {
        setStores([]);
        await stopGeofencing();
        return;
      }

      try {
        const stores = await fetchStores(householdId);
        if (cancelled) return;

        setStores(stores);
        await stopGeofencing();
        if (stores.some((s) => s.latitude != null && s.longitude != null)) {
          await startGeofencing(stores);
        }
      } catch {
        // Leave screen usable even if stores bootstrap fails.
      }
    }

    bootstrapStoresAndGeofencing();
    return () => {
      cancelled = true;
    };
  }, [householdId, setStores]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2D9CDB',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { borderTopColor: '#E5E7EB' },
      }}
    >
      <Tabs.Screen
        name="pantry"
        options={{
          title: 'Pantry',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🥬</Text>,
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: 'Shopping',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🛒</Text>,
        }}
      />
      <Tabs.Screen
        name="receipts"
        options={{
          title: 'Receipts',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🧾</Text>,
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: 'Stores',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏪</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
