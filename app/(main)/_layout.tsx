import { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import type { ColorValue } from 'react-native';
import { ACTIVE_STORE_TTL_MS } from '../../lib/geofencing';
import { useRealtime } from '../../lib/realtime';
import { useHouseholdStore } from '../../store/household';
import { useStoresStore } from '../../store/stores';
import { useTheme } from '../../hooks/useTheme';
import { fonts } from '../../constants/theme';
import { useDataBootstrap } from '../../hooks/useDataBootstrap';
import { useHouseholdLoader } from '../../hooks/useHouseholdLoader';
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
  const householdId = useHouseholdStore((s) => s.household?.id ?? null);
  const activeStoreId = useStoresStore((s) => s.activeStoreId);
  const pendingReceiptStoreId = useStoresStore((s) => s.pendingReceiptStoreId);
  const setActiveStore = useStoresStore((s) => s.setActiveStore);
  const setArrivalStore = useStoresStore((s) => s.setArrivalStore);
  const activeStoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Belt-and-suspenders household loader — handles process restarts that land
  // directly in (main) (push notification taps, deep links, Expo Go reloads)
  // without going through check.tsx.
  useHouseholdLoader();

  // All data fetching, geofencing, and foreground refresh.
  useDataBootstrap(householdId);

  // Realtime subscriptions for items, shopping list, and store arrivals.
  useRealtime(householdId);

  // Auto-clear shopping mode after 2 hours.
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

  // Push notification tap routing.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      const storeId: string | undefined = data?.storeId;
      const type: string | undefined = data?.type;

      if (type === 'arrival_self' && storeId) {
        if (!pendingReceiptStoreId || pendingReceiptStoreId === storeId) {
          setActiveStore(storeId);
        }
        router.push('/(main)/grocery');
      } else if (storeId) {
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
