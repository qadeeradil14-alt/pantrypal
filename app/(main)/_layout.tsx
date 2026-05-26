import { useEffect, useRef } from 'react';
import { View, StyleSheet, AppState } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { fetchStores } from '../../lib/stores';
import { fetchItems } from '../../lib/items';
import { fetchActiveShoppingList } from '../../lib/shoppingList';
import { flushMutationQueue } from '../../lib/offlineQueue';
import { startGeofencing, stopGeofencing, ACTIVE_STORE_TTL_MS } from '../../lib/geofencing';
import { useRealtime } from '../../lib/realtime';
import { useHouseholdStore } from '../../store/household';
import { useStoresStore } from '../../store/stores';
import { useShoppingStore } from '../../store/shopping';
import { useItemsStore } from '../../store/items';
import { useTheme } from '../../hooks/useTheme';
import ArrivalBanner from '../../components/ArrivalBanner';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IoniconName, focusedName: IoniconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} size={24} color={color as string} />
  );
}

export default function MainLayout() {
  const { colors } = useTheme();
  const householdId = useHouseholdStore((s) => s.household?.id);
  const setStores = useStoresStore((s) => s.setStores);
  const setItems = useItemsStore((s) => s.setItems);
  const setShoppingEntries = useShoppingStore((s) => s.setEntries);
  const activeStoreId = useStoresStore((s) => s.activeStoreId);
  const setActiveStore = useStoresStore((s) => s.setActiveStore);
  const activeStoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime(householdId ?? null);

  useEffect(() => {
    if (activeStoreTimerRef.current) clearTimeout(activeStoreTimerRef.current);
    if (!activeStoreId) return;
    activeStoreTimerRef.current = setTimeout(() => {
      setActiveStore(null);
    }, ACTIVE_STORE_TTL_MS);
    return () => {
      if (activeStoreTimerRef.current) clearTimeout(activeStoreTimerRef.current);
    };
  }, [activeStoreId, setActiveStore]);

  useEffect(() => {
    if (!householdId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void (async () => {
        try {
          await flushMutationQueue();
          const [stores, items, entries] = await Promise.all([
            fetchStores(householdId),
            fetchItems(householdId),
            fetchActiveShoppingList(householdId),
          ]);
          setStores(stores);
          setItems(items);
          setShoppingEntries(entries);
          const geofenceStores = stores.filter((s) => s.latitude != null);
          if (geofenceStores.length > 0) {
            await stopGeofencing();
            await startGeofencing(geofenceStores);
          }
        } catch {
          // ignore foreground refresh errors
        }
      })();
    });
    return () => sub.remove();
  }, [householdId, setStores, setItems, setShoppingEntries]);

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
    <View style={styles.root}>
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
            paddingHorizontal: 12,
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
      <ArrivalBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
