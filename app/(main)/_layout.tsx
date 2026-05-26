import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { fetchStores } from '../../lib/stores';
import { fetchActiveShoppingList } from '../../lib/shoppingList';
import { startGeofencing, stopGeofencing } from '../../lib/geofencing';
import { useRealtime } from '../../lib/realtime';
import { useHouseholdStore } from '../../store/household';
import { useStoresStore } from '../../store/stores';
import { useShoppingStore } from '../../store/shopping';
import { colors } from '../../constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IoniconName, focusedName: IoniconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} size={24} color={color as string} />
  );
}

export default function MainLayout() {
  const householdId = useHouseholdStore((s) => s.household?.id);
  const setStores = useStoresStore((s) => s.setStores);
  const setShoppingEntries = useShoppingStore((s) => s.setEntries);
  useRealtime(householdId ?? null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapStoresAndGeofencing() {
      if (!householdId) {
        setStores([]);
        setShoppingEntries([]);
        await stopGeofencing();
        return;
      }
      try {
        const [stores, shoppingEntries] = await Promise.all([
          fetchStores(householdId),
          fetchActiveShoppingList(householdId),
        ]);
        if (cancelled) return;
        setStores(stores);
        setShoppingEntries(shoppingEntries);
        await stopGeofencing();
        if (stores.some((s) => s.latitude != null && s.longitude != null)) {
          await startGeofencing(stores);
        }
      } catch {
        // Keep UI usable even if stores bootstrap fails.
      }
    }

    bootstrapStoresAndGeofencing();
    return () => { cancelled = true; };
  }, [householdId, setStores, setShoppingEntries]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: 8,
          height: 76,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="pantry"
        options={{
          title: 'Pantry',
          tabBarIcon: tabIcon('nutrition-outline', 'nutrition'),
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: 'Shopping',
          tabBarIcon: tabIcon('cart-outline', 'cart'),
        }}
      />
      <Tabs.Screen
        name="receipts"
        options={{
          title: 'Receipts',
          tabBarIcon: tabIcon('receipt-outline', 'receipt'),
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: 'Stores',
          tabBarIcon: tabIcon('storefront-outline', 'storefront'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: tabIcon('settings-outline', 'settings'),
        }}
      />
    </Tabs>
  );
}
