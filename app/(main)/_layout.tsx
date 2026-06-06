import { useEffect, useRef } from 'react';
import { View, StyleSheet, AppState, Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import type { ColorValue } from 'react-native';
import { fetchStores } from '../../lib/stores';
import { fetchItems } from '../../lib/items';
import { fetchActiveShoppingList } from '../../lib/shoppingList';
import { getMyHousehold } from '../../lib/households';
import { flushMutationQueue } from '../../lib/offlineQueue';
import { startGeofencing, stopGeofencing, ACTIVE_STORE_TTL_MS } from '../../lib/geofencing';
import { useRealtime } from '../../lib/realtime';
import { useAuthStore } from '../../store/auth';
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
  const { household, loaded: householdLoaded, setHousehold, setLoading: setHouseholdLoading } = useHouseholdStore();
  const householdId = household?.id ?? null;
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const setStores = useStoresStore((s) => s.setStores);
  const setItems = useItemsStore((s) => s.setItems);
  const setShoppingEntries = useShoppingStore((s) => s.setEntries);
  const activeStoreId = useStoresStore((s) => s.activeStoreId);
  const pendingReceiptStoreId = useStoresStore((s) => s.pendingReceiptStoreId);
  const setActiveStore = useStoresStore((s) => s.setActiveStore);
  const setArrivalStore = useStoresStore((s) => s.setArrivalStore);
  const activeStoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime(householdId ?? null);

  // Auto-clear shopping mode after 2 hours (in case user forgets to tap Done)
  useEffect(() => {
    if (activeStoreTimerRef.current) clearTimeout(activeStoreTimerRef.current);
    if (!activeStoreId) return;
    activeStoreTimerRef.current = setTimeout(() => {
      if (useStoresStore.getState().pendingReceiptStoreId) return;
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
        if (!pendingReceiptStoreId || pendingReceiptStoreId === storeId) {
          setActiveStore(storeId);
        }
        router.push('/(main)/grocery');
      } else if (storeId) {
        // Partner tapped the push notification — show banner + go to Pantry to add items
        setArrivalStore({
          storeId,
          actorName: typeof data?.actorName === 'string' ? data.actorName : null,
          arrivedAt: typeof data?.arrivedAt === 'string' ? data.arrivedAt : null,
        });
        router.push('/(main)/pantry');
      }
    });
    return () => sub.remove();
  }, [pendingReceiptStoreId, router, setActiveStore, setArrivalStore]);

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

  // Re-fetch household if we land in (main) without it loaded (e.g. after process restart).
  useEffect(() => {
    if (householdLoaded || !userId) return;
    let cancelled = false;
    setHouseholdLoading(true);
    getMyHousehold(userId)
      .then((data) => {
        if (cancelled) return;
        const raw = data?.households;
        const h = Array.isArray(raw) ? raw[0] : raw;
        if (h && data?.role) {
          setHousehold({ id: h.id, name: h.name, inviteCode: h.invite_code ?? '', role: data.role, plan: h.plan ?? 'free' });
        } else {
          setHousehold(null);
        }
      })
      .catch(() => {
        if (!cancelled) setHousehold(null);
      });
    return () => { cancelled = true; };
  }, [householdLoaded, userId, setHousehold, setHouseholdLoading]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapStoresAndGeofencing() {
      if (!householdId) {
        // Only clear household-scoped data once we've confirmed there is no household.
        // While householdLoaded is false, data is still loading — do not wipe it.
        if (householdLoaded) {
          setStores([]);
          setItems([]);
          setShoppingEntries([]);
        }
        await stopGeofencing();
        return;
      }
      try {
        // Flush queued mutations first so Supabase reflects the latest state
        // before we fetch. Without this, mark_got_it mutations queued during a
        // previous session (e.g. due to network failure) stay pending across
        // app restarts, causing grabbed items to show "In cart" again after reboot.
        await flushMutationQueue();
        if (cancelled) return;
        const [stores, items, shoppingEntries] = await Promise.all([
          fetchStores(householdId),
          fetchItems(householdId),
          fetchActiveShoppingList(householdId),
        ]);
        if (cancelled) return;
        setStores(stores);
        setItems(items);
        setShoppingEntries(shoppingEntries);
        await stopGeofencing();
        if (stores.some((s) => s.latitude != null && s.longitude != null)) {
          await startGeofencing(stores);
        }
      } catch {
        // Keep UI usable even if bootstrap fails — persisted state covers the gap.
      }
    }

    bootstrapStoresAndGeofencing();
    return () => { cancelled = true; };
  }, [householdId, householdLoaded, setItems, setShoppingEntries, setStores]);

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
            borderTopWidth: StyleSheet.hairlineWidth,
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
          name="activity"
          options={{
            title: 'Activity',
            tabBarIcon: tabIcon('time-outline', 'time'),
            tabBarButton: ({ ref: _ref, ...props }) => (
              <Pressable {...props} testID="tab-activity" accessibilityRole="button" />
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
