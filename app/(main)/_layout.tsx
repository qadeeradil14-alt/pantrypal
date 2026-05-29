import { useEffect, useRef } from 'react';
import { View, StyleSheet, AppState, Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import type { ColorValue } from 'react-native';
import { fetchStores } from '../../lib/stores';
import { fetchItems } from '../../lib/items';
import { fetchActiveShoppingList } from '../../lib/shoppingList';
import { flushMutationQueue } from '../../lib/offlineQueue';
import { startGeofencing, stopGeofencing, ACTIVE_STORE_TTL_MS } from '../../lib/geofencing';
import { useRealtime } from '../../lib/realtime';
import { useHouseholdStore } from '../../store/household';
import { useStoresStore } from '../../store/stores';
import { useItemsStore } from '../../store/items';
import { useShoppingStore } from '../../store/shopping';
import { useTheme } from '../../hooks/useTheme';
import { fonts } from '../../constants/theme';
import ArrivalBanner from '../../components/ArrivalBanner';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IoniconName, focusedName: IoniconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} size={24} color={color as string} />
  );
}

export default function MainLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const householdId = useHouseholdStore((s) => s.household?.id);
  const setStores = useStoresStore((s) => s.setStores);
  const setItems = useItemsStore((s) => s.setItems);
  const setShoppingEntries = useShoppingStore((s) => s.setEntries);
  const activeStoreId = useStoresStore((s) => s.activeStoreId);
  const setActiveStore = useStoresStore((s) => s.setActiveStore);
  const setArrivalStore = useStoresStore((s) => s.setArrivalStore);
  const activeStoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime(householdId ?? null);

  // Auto-clear shopping mode after 2 hours (in case user forgets to tap Done)
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

  // Handle push notification taps:
  // - Person at store taps their own arrival notification → open Shopping tab
  // - Partner taps arrival notification (app was closed) → open Pantry to update list
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      const storeId: string | undefined = data?.storeId;
      const type: string | undefined = data?.type;

      if (type === 'arrival_self' && storeId) {
        // The person who arrived tapped their own notification — open Shopping
        setActiveStore(storeId);
        router.push('/(main)/grocery');
      } else if (storeId) {
        // Partner tapped the push notification — show banner + go to Pantry to add items
        setArrivalStore(storeId);
        router.push('/(main)/pantry');
      }
    });
    return () => sub.remove();
  }, [router, setActiveStore, setArrivalStore]);

  useEffect(() => {
    if (!householdId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void (async () => {
        try {
          await flushMutationQueue();
          const [stores, items, shoppingEntries] = await Promise.all([
            fetchStores(householdId),
            fetchItems(householdId),
            fetchActiveShoppingList(householdId),
          ]);
          setStores(stores);
          setItems(items);
          setShoppingEntries(shoppingEntries);
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
        // Keep UI usable even if stores bootstrap fails.
      }
    }

    bootstrapStoresAndGeofencing();
    return () => { cancelled = true; };
  }, [householdId, setStores]);

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
            fontFamily: fonts.bodySemiBold,
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
            tabBarButton: ({ ref: _ref, ...props }) => (
              <Pressable {...props} testID="tab-pantry" accessibilityRole="button" />
            ),
          }}
        />
        <Tabs.Screen
          name="grocery"
          options={{
            title: 'Shopping',
            tabBarIcon: tabIcon('cart-outline', 'cart'),
            tabBarButton: ({ ref: _ref, ...props }) => (
              <Pressable {...props} testID="tab-grocery" accessibilityRole="button" />
            ),
          }}
        />
        <Tabs.Screen
          name="receipts"
          options={{
            title: 'Receipts',
            tabBarIcon: tabIcon('receipt-outline', 'receipt'),
            tabBarButton: ({ ref: _ref, ...props }) => (
              <Pressable {...props} testID="tab-receipts" accessibilityRole="button" />
            ),
          }}
        />
        <Tabs.Screen
          name="stores"
          options={{
            title: 'Stores',
            tabBarIcon: tabIcon('storefront-outline', 'storefront'),
            tabBarButton: ({ ref: _ref, ...props }) => (
              <Pressable {...props} testID="tab-stores" accessibilityRole="button" />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: tabIcon('settings-outline', 'settings'),
            tabBarButton: ({ ref: _ref, ...props }) => (
              <Pressable {...props} testID="tab-settings" accessibilityRole="button" />
            ),
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
