/**
 * Stokit V2 — Shopping screen.
 *
 * Sub-screens driven by the session state machine:
 *   idle           → plan preview + start button
 *   shopping_store → pick items at current store
 *   receipt_prompt → V1-style spend input (store name, $, Camera/Library, Skip)
 *   store_summary  → per-store stats + continue / finish decision
 *   next_store_ready → pick next store / skip stores / finish early
 *   trip_summary   → full bird's-eye summary with per-store breakdown
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Screen } from '../../components/shared/Screen';
import { Button, Card, PageTitle, Pill, StoreChip } from '../../components/shared/ui';
import { EmptyState } from '../../components/shared/EmptyState';
import { StorePickerSheet } from '../../components/pantry/StorePickerSheet';
import { AddItemSheet } from '../../components/pantry/AddItemSheet';
import { Sheet } from '../../components/shared/Sheet';
import { ItemAvatar } from '../../components/shared/ItemAvatar';
import { Avatar } from '../../components/shared/Avatar';
import { PricePromptSheet } from '../../components/shopping/PricePromptSheet';
import { ShoppingItemEditSheet } from '../../components/shopping/ShoppingItemEditSheet';
import { AddStoreContent } from '../../components/stores/AddStoreSheet';
import { fonts, radii, shadow, spacing, type AppColors } from '../../theme';
import { getCategoryColors } from '../../theme/categoryPalette';
import { useDurableStore } from '../../store/durable-store';
import { useHouseholdStore } from '../../store/household-store';
import { useSessionStore } from '../../store/session-store';
import {
  currentStopId,
  currentStoreEntries,
  currentStoreId,
  entryStopPlacement,
  pendingStoreIds,
  stopIdForQueueIndex,
  type ShoppingSession,
} from '../../core/shopping-machine';
import { ROUTE_COLORS } from '../../core/services/storeBrands';
import { classifyItem, categoryLabel } from '../../core/services/itemClassifier';
import { cheapestRecentPrice, itemPriceHistory, lastPriceAtStore } from '../../core/services/priceHistory';
import { normalizeItemName } from '../../core/services/pantryItems';
import { receiptContinuationEvent, receiptLineItemsFromScan, renameReviewItem, reviewReceiptItems, unplannedStores } from '../../core/services/shoppingUx';
import { isGeofencingRunning, startGeofencing } from '../../core/services/geofencing';
import { sendHouseholdShoppingAlert } from '../../core/services/notifications';
import { sendShoppingAlertOnce } from '../../core/services/shoppingAlertOnce';
import { resetShoppingTripStartGuard, startShoppingTripOnce } from '../../core/services/shoppingTripStart';
import { pullFromSupabase } from '../../core/services/syncEngine';
import type { ReceiptReviewItem } from '../../core/services/shoppingUx';
import type {
  HouseholdMember,
  PantryItem,
  ShoppingEntry,
  ShoppingEntryDraft,
  Store,
  Trip,
} from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { UNASSIGNED_STORE_ID, UNASSIGNED_STORE_NAME } from '../../constants/shopping';
import { getLastAcknowledgedTripCompletedAt, newestUnseenTrip, setLastAcknowledgedTripCompletedAt } from '../../core/services/tripCompletionAck';
import { shoppingCapabilities, type ShoppingCapabilities } from '../../core/services/shoppingAccess';
import { occurrenceId } from '../../core/services/shoppingOccurrence';
import {
  shoppingGroups,
  tripStopsOverviewGroups,
} from '../../core/services/shoppingGroups';
import { shoppingItineraryPreview } from '../../core/services/shoppingItinerary';
import {
  activeShoppingStoreIds,
  shoppingEntryDraftsFromAssignments,
} from '../../core/services/shoppingStoreAssignments';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubProps = {
  session: ReturnType<typeof useSessionStore.getState>['session'];
  dispatch: ReturnType<typeof useSessionStore.getState>['dispatch'];
  storeById: (id: string) => Store | undefined;
  colors: AppColors;
  access: ShoppingCapabilities;
  activeShopper?: HouseholdMember;
  styles?: any;
  rStyles?: any;
  ssStyles?: any;
  nsStyles?: any;
  tsStyles?: any;
};

function EntryChoiceCard({
  selected,
  onPress,
  style,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  style: any;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: selected ? 1.015 : 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [scale, selected]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Card onPress={onPress} style={style}>
        {children}
      </Card>
    </Animated.View>
  );
}

// ── Root screen ───────────────────────────────────────────────────────────────

export default function ShoppingScreen() {
  const { colors } = useTheme();
  const { styles, rStyles, ssStyles, nsStyles, tsStyles } = useMemo(() => makeStyles(colors), [colors]);

  const items      = useDurableStore((s) => s.items);
  const stores     = useDurableStore((s) => s.stores);
  const priceHistory = useDurableStore((s) => s.priceHistory);
  const updateItem = useDurableStore((s) => s.updateItem);
  const resetShoppingList = useDurableStore((s) => s.resetShoppingList);
  const assignItemsToStore = useDurableStore((s) => s.assignItemsToStore);
  const shoppingStoreAssignments = useDurableStore((s) => s.shoppingStoreAssignments);
  const session    = useSessionStore((s) => s.session);
  const dispatch   = useSessionStore((s) => s.dispatch);
  const trips      = useDurableStore((s) => s.trips);
  const members    = useHouseholdStore((s) => s.members);
  const household  = useHouseholdStore((s) => s.household);
  const localMember = members.find((member) => member.isMe);
  const access = shoppingCapabilities(
    session.shopperId,
    localMember?.id,
    localMember?.role ?? household?.role,
  );
  // Called unconditionally, before any early return below, so React's rules
  // of hooks hold across every session status this screen renders.
  const { trip: unseenTrip, dismiss: dismissUnseenTrip } = useUnseenCompletedTrip(trips, session.completedTrip);
  const router     = useRouter();
  const [reassignItem, setReassignItem] = useState<PantryItem | null>(null);

  const { action, arrivalStoreId } = useLocalSearchParams<{ action?: string; arrivalStoreId?: string }>();
  const arrivalHandledRef = useRef(false);
  const [quickScanStorePicker, setQuickScanStorePicker] = useState(false);
  const [bulkAssignStorePicker, setBulkAssignStorePicker] = useState(false);
  // Holds the storeId we want to skip to receipt once START_TRIP settles
  const [pendingQuickScanStore, setPendingQuickScanStore] = useState<string | null>(null);
  const [entryStep, setEntryStep] = useState<'shopper' | 'store' | 'preparing' | null>(null);
  const [selectedShopperId, setSelectedShopperId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [preparingDetails, setPreparingDetails] = useState<{
    shopperName: string;
    storeName: string;
  } | null>(null);
  const preparingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preparingOpacity = useRef(new Animated.Value(0)).current;
  const preparingScale = useRef(new Animated.Value(0.92)).current;
  const tripStartIdRef = useRef<string | null>(null);
  const previousSessionStatusRef = useRef(session.status);

  useFocusEffect(
    useCallback(() => {
      void pullFromSupabase();
    }, []),
  );

  useEffect(() => {
    if (previousSessionStatusRef.current !== 'idle' && session.status === 'idle') {
      if (tripStartIdRef.current) resetShoppingTripStartGuard(tripStartIdRef.current);
      tripStartIdRef.current = null;
    }
    previousSessionStatusRef.current = session.status;
  }, [session.status]);

  useEffect(() => () => {
    if (preparingTimerRef.current) clearTimeout(preparingTimerRef.current);
  }, []);

  useEffect(() => {
    if (entryStep !== 'preparing') return;
    preparingOpacity.setValue(0);
    preparingScale.setValue(0.92);
    Animated.parallel([
      Animated.timing(preparingOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(preparingScale, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [entryStep, preparingOpacity, preparingScale]);

  useEffect(() => {
    if (action === 'scan' && session.status === 'idle') {
      setQuickScanStorePicker(true);
    }
  }, [action, session.status]);

  // Once the machine enters shopping_store, finish the store immediately to land on ReceiptPrompt.
  // SKIP_STORE only works from next_store_ready; FINISH_STORE is the correct event here.
  useEffect(() => {
    if (pendingQuickScanStore && session.status === 'shopping_store') {
      setPendingQuickScanStore(null);
      dispatch({ type: 'FINISH_STORE', now: Date.now() });
    }
  }, [session.status, pendingQuickScanStore]);

  const handleQuickScanStoreSelect = (storeId: string) => {
    if (!access.canStartTrip) return;
    setQuickScanStorePicker(false);
    const dummyEntry: ShoppingEntryDraft = {
      pantryItemId: '__quick_scan__',
      name: 'Quick Scan',
      quantity: 1,
      unit: 'unit',
      storeId: storeId,
      picked: false,
    };
    dispatch({
      type: 'START_TRIP',
      entries: [dummyEntry],
      now: Date.now(),
      shopperId: localMember?.id ?? null,
    });
    setPendingQuickScanStore(storeId);
  };

  const storeById = (id: string): Store | undefined => id === UNASSIGNED_STORE_ID
    ? { id, name: UNASSIGNED_STORE_NAME, logoEmoji: '🛒', logoColor: colors.primary, createdAt: 0, updatedAt: 0 }
    : stores.find((s) => s.id === id);

  const plan = useMemo(() => {
    const byStore = new Map<string, ShoppingEntryDraft[]>();
    for (const entry of shoppingEntryDraftsFromAssignments(items, shoppingStoreAssignments)) {
      const list = byStore.get(entry.storeId) ?? [];
      list.push(entry);
      byStore.set(entry.storeId, list);
    }
    byStore.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return byStore;
  }, [items, shoppingStoreAssignments]);

  const unassigned = useMemo(
    () => items.filter(
      (item) =>
        (item.status === 'low' || item.status === 'expiring') &&
        activeShoppingStoreIds(item, shoppingStoreAssignments).length === 0,
    ),
    [items, shoppingStoreAssignments],
  );
  const unassignedCount = unassigned.length;

  const startTripAt = async (
    firstStoreId: string,
    notifyHousehold = false,
    shopperId: string | null = null,
  ) => {
    if (!access.canStartTrip) return;
    if (tripStartIdRef.current) return;
    const entriesByAssignment = shoppingEntryDraftsFromAssignments(
      items,
      shoppingStoreAssignments,
    );
    const byStore = new Map<string, ShoppingEntryDraft[]>();
    for (const entry of entriesByAssignment) {
      const list = byStore.get(entry.storeId) ?? [];
      list.push(entry);
      byStore.set(entry.storeId, list);
    }
    const entries: ShoppingEntryDraft[] = [...(byStore.get(firstStoreId) ?? [])];
    byStore.forEach((list, sid) => {
      if (sid !== firstStoreId) entries.push(...list);
    });
    if (entries.length === 0) return;
    const now = Date.now();
    const tripId = `t_${now}`;
    tripStartIdRef.current = tripId;
    const store = storeById(firstStoreId);
    startShoppingTripOnce({
      tripId,
      startTrip: () => dispatch({ type: 'START_TRIP', entries, now, shopperId }),
      notifyHousehold: notifyHousehold && store
        ? () => sendShoppingAlertOnce(
            tripId,
            () => sendHouseholdShoppingAlert(store.name, firstStoreId),
          )
        : undefined,
    });
    if (await isGeofencingRunning()) {
      const result = await startGeofencing(stores, items);
      if (result === 'no_permission') {
        Alert.alert('Location permission needed', 'Allow "Always" location access in Settings to enable store arrival reminders.');
      } else if (result === 'no_notification_permission') {
        Alert.alert('Notification permission needed', 'Allow notifications in Settings so Stokit can remind you when you arrive at a store.');
      } else if (result === 'no_stores') {
        Alert.alert('Arrival reminders paused', 'No stores in this trip have both GPS coordinates and assigned shopping items.');
      } else if (result === 'expo_go') {
        Alert.alert('Not available in Expo Go', 'Store arrival reminders need TestFlight or a device build.');
      }
    }
  };

  // Geofence "hybrid" flow: a store_arrival notification tap deep-links here with
  // arrivalStoreId. Auto-start the trip at that store via the SAME startTripAt
  // engine (no duplicate logic) and skip the planning-mode picker. One-shot, and
  // only when idle with shoppable items there — never hijack an active trip, and
  // never start an empty trip (which would focus a different store).
  useEffect(() => {
    if (!arrivalStoreId || arrivalHandledRef.current) return;
    arrivalHandledRef.current = true;
    // Clear the param so back-nav / re-render never re-triggers the auto-start.
    router.setParams({ arrivalStoreId: undefined });
    if (session.status === 'next_store_ready') {
      // Arrived at a store already pending in an active trip → advance to it directly.
      const pending = session.storeQueue.slice(session.currentIndex + 1);
      if (pending.includes(arrivalStoreId)) {
        dispatch({ type: 'CHOOSE_NEXT_STORE', storeId: arrivalStoreId });
      }
      return;
    }
    if (session.status !== 'idle') return;            // don't hijack an in-progress trip
    if (!access.canStartTrip) return;
    if (!plan.has(arrivalStoreId)) return;            // no low/expiring items there → land on idle
    void startTripAt(arrivalStoreId, false, localMember?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivalStoreId, session.status]);

  // Skip the per-store summary when another planned stop remains.
  useEffect(() => {
    if (
      (session.status === 'store_summary' || session.status === 'continue_prompt') &&
      pendingStoreIds(session).length > 0
    ) {
      dispatch({ type: 'CONTINUE_TRIP' });
    }
  }, [session.status, dispatch]);

  // Continue in queue order without duplicating a separate next-stop chooser.
  useEffect(() => {
    if (
      session.status === 'next_store_ready'
      && pendingStoreIds(session).length > 0
    ) {
      dispatch({ type: 'ADVANCE_STORE' });
    }
  }, [session.status, dispatch]);

  const handleResetShopping = () => {
    if (!access.canStartTrip) return;
    const shoppingItems = items.filter((i) => i.status === 'low' || i.status === 'expiring');
    Alert.alert(
      'Reset shopping list?',
      `This will clear all ${shoppingItems.length} item${shoppingItems.length !== 1 ? 's' : ''} from your shopping queue. Your pantry and receipts stay untouched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: resetShoppingList,
        },
      ],
    );
  };

  const handleStartShopping = () => {
    if (!access.canStartTrip) return;
    const entries = Array.from(plan.entries());
    if (entries.length === 0) return;
    setSelectedShopperId(localMember?.id ?? null);
    setSelectedStoreId(null);
    setEntryStep('shopper');
  };

  if (entryStep === 'preparing' && preparingDetails) {
    return (
      <Screen scroll={false} contentStyle={nsStyles.preparingScreen}>
        <Animated.View
          style={[
            nsStyles.preparingContent,
            {
              opacity: preparingOpacity,
              transform: [{ scale: preparingScale }],
            },
          ]}
        >
          <View style={nsStyles.preparingIcon}>
            <Ionicons name="checkmark" size={34} color="#FFFFFF" />
          </View>
          <Text style={nsStyles.preparingTitle}>{preparingDetails.shopperName} is shopping</Text>
          <Text style={nsStyles.preparingStore}>{preparingDetails.storeName}</Text>
          <Text style={nsStyles.preparingBody}>Preparing your shopping trip...</Text>
        </Animated.View>
      </Screen>
    );
  }

  // ── Active states ──────────────────────────────────────────────────────────
  // shopping_store → receipt_prompt → store_summary/continue_prompt → next_store_ready
  // all render through one persistent shell so mid-trip transitions animate in
  // place instead of hard-swapping unrelated screens.
  const activeShopper = session.shopperId
    ? members.find((member) => member.id === session.shopperId)
    : undefined;
  if (
    session.status === 'shopping_store' ||
    session.status === 'receipt_prompt' ||
    session.status === 'store_summary' ||
    session.status === 'continue_prompt' ||
    session.status === 'next_store_ready'
  ) {
    return (
      <ActiveTripShell
        session={session}
        dispatch={dispatch}
        storeById={storeById}
        styles={styles}
        rStyles={rStyles}
        ssStyles={ssStyles}
        nsStyles={nsStyles}
        colors={colors}
        access={access}
        activeShopper={activeShopper}
      />
    );
  }
  if (session.status === 'trip_summary' && access.canManageTripLifecycle) {
    return <TripSummary session={session} dispatch={dispatch} storeById={storeById} tsStyles={tsStyles} colors={colors} access={access} activeShopper={activeShopper} />;
  }

  // Geofence arrival deep-link: arrivalStoreId is present and the store has items
  // → the useEffect is about to call startTripAt. Show a blank screen instead of
  // the idle planner so the user never sees a flash of "Start shopping" before
  // the trip begins automatically.
  if (arrivalStoreId && !arrivalHandledRef.current && plan.has(arrivalStoreId)) {
    return <Screen><View style={{ flex: 1 }} /></Screen>;
  }

  // ── Idle ───────────────────────────────────────────────────────────────────
  // While a trip is running the session's occurrences are the source of truth,
  // so the same pantry item can appear under every stop it was assigned to.
  // Idle falls back to the pantry-derived plan. See shoppingGroups.
  const planGroups  = shoppingGroups(session, items, shoppingStoreAssignments);
  const totalItems  = planGroups.reduce((n, group) => n + group.items.length, 0);
  const singleStore = planGroups.length === 1 ? storeById(planGroups[0].storeId) : undefined;

  if (entryStep === 'shopper') {
    return (
      <Screen contentStyle={nsStyles.entryScreen}>
        <View style={nsStyles.entryHeader}>
          <Text style={nsStyles.entryEyebrow}>STARTING YOUR TRIP</Text>
          <Text style={nsStyles.entryTitle}>Who’s shopping today?</Text>
          <Text style={nsStyles.chooserIntro}>Select who will lead this shopping trip.</Text>
        </View>
        <View style={nsStyles.entryCards}>
          {members.map((member) => {
            const selected = member.id === selectedShopperId;
            return (
              <EntryChoiceCard
                key={member.id}
                selected={selected}
                onPress={() => setSelectedShopperId(member.id)}
                style={[nsStyles.memberCard, selected && nsStyles.memberCardSelected]}
              >
                <Avatar
                  photoUrl={member.avatarUrl}
                  displayName={member.displayName}
                  color={member.avatarColor}
                  size={54}
                  borderColor={`${member.avatarColor}55`}
                />
                <View style={{ flex: 1 }}>
                  <View style={nsStyles.memberNameRow}>
                    <Text style={nsStyles.memberName}>{member.displayName}</Text>
                    {member.isMe ? <Text style={nsStyles.youBadge}>You</Text> : null}
                  </View>
                  <Text style={nsStyles.memberMeta}>
                    {member.role === 'owner' ? 'Owner' : 'Member'}
                  </Text>
                </View>
                <View style={[nsStyles.selectionIndicator, selected && nsStyles.selectionIndicatorSelected]}>
                  {selected ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                </View>
              </EntryChoiceCard>
            );
          })}
        </View>
        <Button
          label="Continue"
          disabled={!selectedShopperId}
          onPress={() => {
            setSelectedStoreId(planGroups[0]?.storeId ?? null);
            setEntryStep('store');
          }}
          style={nsStyles.entryCta}
        />
        <Pressable onPress={() => setEntryStep(null)} style={nsStyles.entryBack}>
          <Text style={nsStyles.entryBackText}>← Back to plan</Text>
        </Pressable>
      </Screen>
    );
  }

  // ── First-store chooser ───────────────────────────────────────────────────
  if (entryStep === 'store' && selectedShopperId) {
    return (
      <Screen contentStyle={nsStyles.entryScreen}>
        <View style={nsStyles.entryHeader}>
          <Text style={nsStyles.entryEyebrow}>CHOOSE YOUR FIRST STOP</Text>
          <Text style={nsStyles.entryTitle}>Where are you shopping first?</Text>
          <Text style={nsStyles.chooserIntro}>Pick your first stop. The rest of your route stays ready.</Text>
        </View>
        <View style={nsStyles.entryCards}>
          {planGroups.map(({ key, storeId, items: list }, idx) => {
            const store = storeById(storeId);
            const selected = storeId === selectedStoreId;
            return (
              <EntryChoiceCard
                key={key}
                selected={selected}
                onPress={() => setSelectedStoreId(storeId)}
                style={[
                  nsStyles.storeChoiceCard,
                  idx === 0 && nsStyles.recommendedStoreCard,
                  selected && nsStyles.storeChoiceCardSelected,
                ]}
              >
                <View style={nsStyles.storeRow}>
                  <StoreChip store={store} name={store?.name ?? '?'} size={56} />
                  <View style={{ flex: 1 }}>
                    {idx === 0 ? <Text style={nsStyles.recommendedLabel}>Suggested first</Text> : null}
                    <Text style={nsStyles.storeName}>{store?.name ?? 'Unknown Store'}</Text>
                    <Text style={nsStyles.storeItems}>{list.length} item{list.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={[nsStyles.selectionIndicator, selected && nsStyles.selectionIndicatorSelected]}>
                    {selected ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                  </View>
                </View>
              </EntryChoiceCard>
            );
          })}
        </View>
        <Button
          label="Start Shopping"
          disabled={!selectedStoreId}
          onPress={() => {
            if (!selectedStoreId) return;
            const storeId = selectedStoreId;
            const shopperId = selectedShopperId;
            const shopper = members.find((member) => member.id === shopperId);
            const store = storeById(storeId);
            setPreparingDetails({
              shopperName: shopper?.displayName ?? 'Your shopper',
              storeName: store?.name ?? 'Your first store',
            });
            setEntryStep('preparing');
            void startTripAt(storeId, false, shopperId);
            preparingTimerRef.current = setTimeout(() => {
              setEntryStep(null);
              setSelectedShopperId(null);
              setSelectedStoreId(null);
              setPreparingDetails(null);
            }, 400);
          }}
          style={nsStyles.entryCta}
        />
        <Pressable onPress={() => setEntryStep('shopper')} style={nsStyles.entryBack}>
          <Text style={nsStyles.entryBackText}>← Change shopper</Text>
        </Pressable>
      </Screen>
    );
  }
  const shoppableCount = totalItems + unassignedCount;
  return (
    <Screen>
      <PageTitle eyebrow="Plan your trip" title="Shopping" />
      {unseenTrip ? (
        <PeerTripCompletedNotice trip={unseenTrip} colors={colors} storeById={storeById} onDismiss={dismissUnseenTrip} />
      ) : shoppableCount === 0 ? (
        <>
          <EmptyState
            icon="cart-outline"
            title="No trip planned"
            body="Items you add to your shopping list will show up here."
            steps={['Add items from Pantry', 'Assign a store when useful', 'Start shopping anywhere']}
          />
          <PriceMemoryIntro count={priceHistory.length} styles={styles} colors={colors} />
        </>
      ) : (
        <>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View>
                <Text style={styles.summaryEyebrow}>TRIP OVERVIEW</Text>
                <Text style={styles.summaryTitle}>
                  {unassignedCount === 0 ? 'Ready to shop' : 'Finish your plan'}
                </Text>
              </View>
              <View style={styles.summaryIcon}>
                <Ionicons name={unassignedCount === 0 ? 'navigate' : 'storefront-outline'} size={22} color={colors.primary} />
              </View>
            </View>
            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryBig}>{shoppableCount}</Text>
                <Text style={styles.summarySub}>Items</Text>
              </View>
              <View style={styles.summaryStatDivider} />
              <View style={styles.summaryStat}>
                <Text style={styles.summaryBig}>{planGroups.length}</Text>
                <Text style={styles.summarySub}>Stores</Text>
              </View>
              <View style={styles.summaryStatDivider} />
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryBig, unassignedCount > 0 && { color: colors.warning }]}>{unassignedCount}</Text>
                <Text style={styles.summarySub}>Unassigned</Text>
              </View>
            </View>
            {singleStore && unassignedCount === 0 ? (
              <View style={styles.firstDestination}>
                <StoreChip store={singleStore} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.firstDestCaption}>YOUR STOP</Text>
                  <Text style={styles.firstDestLabel}>{singleStore.name}</Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={colors.primary} />
              </View>
            ) : null}
            {unassignedCount === 0 && access.canStartTrip
              ? <Button label="Start shopping" onPress={handleStartShopping} style={styles.primaryCta} />
              : unassignedCount === 0
              ? <Text style={styles.assignStoreHint}>The household owner will choose who starts this trip.</Text>
              : <Text style={styles.assignStoreHint}>Choose where to buy each item, then start shopping.</Text>
            }
          </Card>

          <PriceMemoryIntro count={priceHistory.length} styles={styles} colors={colors} />

          {unassigned.length > 0 ? (
            <Card style={styles.planStoreCard}>
              <View>
                <Pressable
                  onPress={() => setBulkAssignStorePicker(true)}
                  style={({ pressed }) => [styles.bulkAssignRow, pressed && { opacity: 0.75 }]}
                >
                  <View style={styles.bulkAssignIcon}>
                    <Ionicons name="storefront-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bulkAssignTitle}>Shop these at one store</Text>
                    <Text style={styles.bulkAssignText}>Choose once for all {unassigned.length} item{unassigned.length === 1 ? '' : 's'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
                <View style={styles.rowDivider} />
                {unassigned.map((item, idx) => (
                  <View key={item.id}>
                    {idx > 0 && <View style={styles.rowDivider} />}
                    <Pressable
                      onPress={() => setReassignItem(item)}
                      style={({ pressed }) => [styles.planRow, pressed && { opacity: 0.6 }]}
                    >
                      <ItemAvatar name={item.name} size={32} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.planName}>{item.name}</Text>
                        {(item.quantity > 1 || item.unit !== 'unit') && (
                          <Text style={styles.planMeta}>×{item.quantity}{item.unit !== 'unit' ? ` ${item.unit}` : ''}</Text>
                        )}
                      </View>
                      <View style={styles.chooseStorePill}>
                        <Text style={styles.chooseStorePillText}>Choose store</Text>
                      </View>
                    </Pressable>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {/* Assigned items — tap any row to change its store */}
          {planGroups.map(({ key, storeId, items: list }) => {
            const store = storeById(storeId);
            return (
              <Card key={key} style={styles.planStoreCard}>
                <PlanStoreHeader store={store} count={list.length} styles={styles} />
                <View>
                  {list.map((e, idx) => (
                    // entryId is per-occurrence, so the same pantry item under a
                    // second stop is a distinct row rather than a duplicate key.
                    <View key={e.entryId ?? e.pantryItemId}>
                      {idx > 0 && <View style={styles.rowDivider} />}
                      <Pressable
                        onPress={() => {
                          const full = items.find((i) => i.id === e.pantryItemId);
                          if (full) setReassignItem(full);
                        }}
                        style={({ pressed }) => [styles.planRow, pressed && { opacity: 0.6 }]}
                      >
                        <ItemAvatar name={e.name} size={32} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.planName}>{e.name}</Text>
                          {(e.quantity > 1 || (e.unit && e.unit !== 'unit')) && (
                            <Text style={styles.planMeta}>×{e.quantity}{e.unit && e.unit !== 'unit' ? ` ${e.unit}` : ''}</Text>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.faintText} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </Card>
            );
          })}

        </>
      )}

      {!unseenTrip && shoppableCount > 0 && access.canStartTrip && (
        <Pressable onPress={handleResetShopping} style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>Reset shopping list</Text>
        </Pressable>
      )}

      <StorePickerSheet
        visible={quickScanStorePicker}
        onClose={() => setQuickScanStorePicker(false)}
        onSelect={(storeId) => handleQuickScanStoreSelect(storeId)}
      />
      <StorePickerSheet
        visible={bulkAssignStorePicker}
        onClose={() => setBulkAssignStorePicker(false)}
        onSelect={(storeId) => {
          assignItemsToStore(unassigned.map((item) => item.id), storeId);
          setBulkAssignStorePicker(false);
        }}
        title="Shop at one store"
        subtitle={`Choose a store for ${unassigned.length} item${unassigned.length === 1 ? '' : 's'}`}
      />

      {/* Tap any item row to change its store */}
      <StorePickerSheet
        item={reassignItem}
        title={reassignItem?.storeId ? 'Change store' : 'Assign store'}
        onClose={() => setReassignItem(null)}
      />


    </Screen>
  );
}

// ── Peer trip-completion notice ─────────────────────────────────────────────
//
// activeSession collapses to null the instant a trip reaches trip_summary, so
// a peer device has no other signal that a trip just finished — it only ever
// sees "no active session", indistinguishable from "nothing happened". This
// re-derives that signal from the trips array, which DOES sync reliably, and
// is fully reactive: no polling, re-evaluated on every render from `trips` +
// a locally persisted acknowledgment marker.
//
// Two things this intentionally gets right from the start (learned from the
// prior overlapping-banner regression):
//   1. Self-acknowledgment — the device that completes a trip locally marks
//      it seen immediately (see the localCompletedTrip effect below), so it
//      never sees its own trip mirrored back as a "peer" notice once it
//      returns to idle.
//   2. The notice and the idle planner are wired as one mutually-exclusive
//      ternary in the same change that introduces the notice (see the
//      ShoppingScreen render above) — never two siblings that can both show.
//   3. First-run initialization — a device that has never acknowledged
//      anything establishes its baseline at the newest trip already in
//      history, silently, instead of treating all pre-existing history as a
//      brand-new completion (see the `stored === null` branch below).
function useUnseenCompletedTrip(
  trips: Trip[],
  localCompletedTrip: Trip | null,
): { trip: Trip | null; dismiss: () => void } {
  const [ack, setAck] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // Always the latest `trips` value, so the async first-run baseline below
  // uses fresh data even if it resolves a render or two after mount.
  const tripsRef = useRef(trips);
  tripsRef.current = trips;

  useEffect(() => {
    let cancelled = false;
    void getLastAcknowledgedTripCompletedAt().then((stored) => {
      if (cancelled) return;
      if (stored === null) {
        // First run on this device: silently establish a baseline at the
        // newest trip already in history instead of surfacing pre-existing
        // trip history as a fresh "peer just finished" notice.
        const baseline = tripsRef.current.reduce((max, t) => Math.max(max, t.completedAt), 0);
        setAck((prev) => Math.max(prev, baseline));
        void setLastAcknowledgedTripCompletedAt(baseline);
      } else {
        setAck((prev) => Math.max(prev, stored));
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!localCompletedTrip) return;
    setAck((prev) => Math.max(prev, localCompletedTrip.completedAt));
    void setLastAcknowledgedTripCompletedAt(localCompletedTrip.completedAt);
  }, [localCompletedTrip]);

  const trip = loaded ? newestUnseenTrip(trips, ack) : null;

  const dismiss = () => {
    if (!trip) return;
    setAck((prev) => Math.max(prev, trip.completedAt));
    void setLastAcknowledgedTripCompletedAt(trip.completedAt);
  };

  return { trip, dismiss };
}

function PeerTripCompletedNotice({
  trip, colors, storeById, onDismiss,
}: { trip: Trip; colors: AppColors; storeById: (id: string) => Store | undefined; onDismiss: () => void }) {
  const storeNames = trip.storeIdsVisited
    .map((id) => storeById(id)?.name)
    .filter((name): name is string => Boolean(name));
  const storesLabel = storeNames.length > 0
    ? storeNames.join(', ')
    : `${trip.storeIdsVisited.length} store${trip.storeIdsVisited.length === 1 ? '' : 's'}`;

  return (
    <View style={{ marginBottom: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.success, backgroundColor: colors.successSoft, padding: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        <Text style={{ fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink }}>Shopping trip completed</Text>
      </View>
      <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.inkSoft, marginBottom: spacing.md }}>
        {storesLabel} · {trip.itemsBought} item{trip.itemsBought === 1 ? '' : 's'}{trip.totalSpent > 0 ? ` · $${trip.totalSpent.toFixed(2)}` : ''}
      </Text>
      <Button label="Got it" onPress={onDismiss} />
    </View>
  );
}

// ── Shared sub-component ──────────────────────────────────────────────────────

function StoreHeader({ store, eyebrow, styles }: { store?: Store; eyebrow?: string; styles: any }) {
  return (
    <View style={styles.activeHeader}>
      <StoreChip store={store} name={store?.name ?? '?'} size={52} />
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={styles.activeStep}>{eyebrow}</Text> : null}
        <Text style={styles.activeStore}>{store?.name ?? 'Store'}</Text>
      </View>
    </View>
  );
}

function PriceMemoryIntro({ count, styles, colors }: { count: number; styles: any; colors: AppColors }) {
  return (
    <Card style={styles.priceMemoryCard}>
      <View style={styles.priceMemoryHeader}>
        <View style={styles.priceMemoryIcon}>
          <Ionicons name="pricetag-outline" size={15} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.priceMemoryTitle}>Price memory</Text>
          <Text style={styles.priceMemoryBody}>
            {count > 0
              ? `${count} remembered price${count === 1 ? '' : 's'}`
              : 'Prices saved from past trips will appear here.'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function PlanStoreHeader({ store, count, styles }: { store?: Store; count: number; styles: any }) {
  const isOpen = store?.isOpen;
  return (
    <View style={styles.planStoreHeader}>
      <StoreChip store={store} name={store?.name ?? 'Unknown Store'} size={32} />
      <Text style={styles.planStoreTitle}>{store?.name ?? 'Unknown Store'}</Text>
      {isOpen !== undefined ? (
        <Pill label={isOpen ? 'Open' : 'Closed'} tone={isOpen ? 'stocked' : 'muted'} />
      ) : null}
      <Text style={styles.planStoreCount}>{count}</Text>
    </View>
  );
}

// ── 1. Shopping at current store ──────────────────────────────────────────────

type NotifyState = 'idle' | 'sending' | 'sent' | 'no_tokens' | 'error';

function ShoppingActive({
  session,
  dispatch,
  storeById,
  styles,
  colors,
  access,
  activeShopper,
}: SubProps) {
  const storeId = currentStoreId(session)!;
  const activeStopId = currentStopId(session)!;
  const currentStoreName = storeById(storeId)?.name ?? 'store';
  const entries = currentStoreEntries(session);
  const picked  = entries.filter((e) => e.picked).length;
  const stepNo  = session.currentIndex + 1;
  const total   = session.storeQueue.length;
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [priceEntry, setPriceEntry] = useState<ShoppingEntry | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [quantityStepperId, setQuantityStepperId] = useState<string | null>(null);
  const [notifyState, setNotifyState] = useState<NotifyState>('idle');
  const priceHistory = useDurableStore((s) => s.priceHistory);
  const recordPrice = useDurableStore((s) => s.recordPrice);
  const members = useHouseholdStore((s) => s.members);
  const items = useDurableStore((s) => s.items);
  const isSharedHousehold = members.length > 1;
  const editingItem = editingItemId
    ? items.find((item) => item.id === editingItemId) ?? null
    : null;
  const isCollaborator = !access.canChangePickedState;
  const canEditActiveItems = access.canEditItems && session.status === 'shopping_store';

  // Quantity stepper must never stay expanded across a navigation away from
  // (or back to) this screen — reset on both focus and blur/unmount.
  useFocusEffect(
    useCallback(() => {
      setQuantityStepperId(null);
      return () => setQuantityStepperId(null);
    }, [])
  );

  // Sync newly store-assigned pantry items into the active trip. Scoped to
  // the item's OWN storeId (not the current store) so items assigned to any
  // store — current, an already-queued future stop, or a brand-new one —
  // join this same trip instead of getting stranded until it ends (OTA 145
  // established "don't strand" for the explicit add-sheet; this extends the
  // same rule to the passive Home-tab assignment path). ADD_ENTRY itself
  // appends a new store, or re-queues a store whose earlier stop is finished.
  useEffect(() => {
    items
      .filter((item) => {
        if (!item.storeId || (item.status !== 'low' && item.status !== 'expiring')) return false;
        // null → this item was already shopped at that store's completed stop;
        // leave it assigned there instead of reopening the finished stop.
        const placement = entryStopPlacement(session, item.storeId, item.id);
        if (!placement) return false;
        const { stopId } = placement;
        const entryId = occurrenceId(session.tripId, stopId, item.id);
        const isRemoved = session.removedEntryIds.includes(item.id)
          || session.removedEntryIds.includes(entryId);
        return !isRemoved && !session.entries.some(
          (entry) => entry.pantryItemId === item.id && entry.stopId === stopId,
        );
      })
      .forEach((item) => {
        dispatch({
          type: 'ADD_ENTRY',
          now: Date.now(),
          entry: { pantryItemId: item.id, name: item.name, quantity: item.quantity, unit: item.unit, storeId: item.storeId!, picked: false },
        });
      });
  }, [items, session.entries, session.removedEntryIds, session.storeQueue, session.currentIndex, session.completedStopIds, session.tripId, dispatch]);

  const handleNotifyHousehold = async () => {
    const store = storeById(storeId);
    if (!store || !session.tripId || notifyState === 'sending') return;
    setNotifyState('sending');
    const { ok, sent } = await sendShoppingAlertOnce(
      session.tripId,
      () => sendHouseholdShoppingAlert(store.name, storeId),
    );
    setNotifyState(!ok ? 'error' : sent > 0 ? 'sent' : 'no_tokens');
    setTimeout(() => setNotifyState('idle'), 3000);
  };

  // Build per-item price index once per priceHistory change instead of scanning
  // the full array 3× per list row per render.
  const priceIndex = useMemo(() => {
    const map = new Map<string, { lastHere: ReturnType<typeof lastPriceAtStore>; best: ReturnType<typeof cheapestRecentPrice> }>();
    const names = [...new Set(entries.map((e) => normalizeItemName(e.name)))];
    for (const name of names) {
      map.set(name, {
        lastHere: lastPriceAtStore(priceHistory, name, storeId),
        best: cheapestRecentPrice(priceHistory, name),
      });
    }
    return map;
  }, [priceHistory, entries, storeId]);

  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: entries.length ? picked / entries.length : 0,
      useNativeDriver: false,
      friction: 8,
      tension: 60,
    }).start();
  }, [picked, entries.length]);

  return (
    <Screen>
      {/* Tapping anywhere outside the open quantity stepper's own controls
          closes it — mirrors the existing per-row close below, just scoped
          to the whole screen instead of only the list card. */}
      <Pressable onPress={() => setQuantityStepperId(null)}>
      <PageTitle eyebrow={total > 1 ? `Stop ${stepNo} of ${total}` : (storeById(storeId)?.name ? `At ${storeById(storeId)!.name}` : undefined)} title="Shopping" />
      {isCollaborator ? (
        <Card style={styles.collaboratorCard}>
          <Avatar
            photoUrl={activeShopper?.avatarUrl}
            displayName={activeShopper?.displayName}
            color={activeShopper?.avatarColor ?? colors.primary}
            size={32}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.collaboratorTitle}>
              Shopping with {activeShopper?.displayName ?? 'your household shopper'}
            </Text>
            <Text style={styles.collaboratorBody}>
              You're helping from home.
            </Text>
          </View>
        </Card>
      ) : null}
      <Card style={styles.activeTripCard}>
        <StoreHeader store={storeById(storeId)} eyebrow="Now shopping" styles={styles} />
        <View style={styles.progressWrap}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>TRIP PROGRESS</Text>
            <Text style={styles.progressCount}>{picked} of {entries.length}</Text>
          </View>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {entries.length === picked && entries.length > 0
              ? 'Everything on this list is checked off'
              : `${entries.length - picked} item${entries.length - picked === 1 ? '' : 's'} left at this stop`}
          </Text>
        </View>
      </Card>

      <View style={styles.listHeading}>
        <Text style={styles.listTitle}>Shopping list</Text>
        <View style={styles.listCountBadge}>
          <Text style={styles.listCountText}>{entries.length}</Text>
        </View>
      </View>

      {entries.length > 0 ? <Pressable onPress={() => setQuantityStepperId(null)}><Card style={styles.shoppingListCard}>
        {entries.map((e, idx) => (
          <View key={e.entryId}>
                {idx > 0 && <View style={styles.rowDivider} />}
                <Swipeable
                  renderRightActions={() => (
                    <View style={styles.shoppingSwipeActionRight}>
                      <Ionicons name="trash-outline" size={24} color="#FFF" />
                    </View>
                  )}
                  onSwipeableWillOpen={() => {
                    if (!canEditActiveItems) return;
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    dispatch({ type: 'REMOVE_ENTRY', entryId: e.entryId, now: Date.now() });
                  }}
                  containerStyle={{ overflow: 'hidden' }}
                >
                <Pressable
                  style={({ pressed }) => [styles.pickRow, e.picked && styles.pickRowDone, e.outOfStock && { opacity: 0.5 }, pressed && { opacity: 0.72 }]}
                  onPress={() => {
                    if (quantityStepperId) setQuantityStepperId(null);
                    if (!access.canChangePickedState) {
                      if (canEditActiveItems && e.pantryItemId !== '__quick_scan__') setEditingItemId(e.pantryItemId);
                      return;
                    }
                    if (e.outOfStock) return;
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    // No LayoutAnimation here: on Fabric it can tick over a
                    // freed Modal shadow node during the receipt flow and crash
                    // (see ActiveTripShell note).
                    dispatch({ type: 'TOGGLE_PICK', entryId: e.entryId, now: Date.now() });
                  }}
                  onLongPress={() => {
                    if (!access.canChangePickedState) return;
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Alert.alert(
                      e.name,
                      e.outOfStock ? 'Mark as available again?' : 'Mark this item as out of stock?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: e.outOfStock ? 'Available' : 'Out of stock',
                          onPress: () => dispatch({ type: 'MARK_OUT_OF_STOCK', entryId: e.entryId, now: Date.now() }),
                        },
                      ],
                    );
                  }}
                >
                  <View style={[
                    styles.pickControl,
                    e.picked && styles.pickControlDone,
                    e.outOfStock && { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
                  ]}>
                    <Ionicons
                      name={e.outOfStock ? 'close' : e.picked ? 'checkmark' : 'ellipse-outline'}
                      size={e.picked || e.outOfStock ? 16 : 12}
                      color={e.outOfStock ? colors.danger : e.picked ? colors.onPrimary : colors.faintText}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickName, e.picked && styles.pickNameDone]}>{e.name}</Text>
                    {(() => {
                      const { lastHere: here, best } = priceIndex.get(normalizeItemName(e.name)) ?? {};
                      const bestStore = best && best.storeId !== storeId ? storeById(best.storeId) : undefined;
                      const priceText = here
                        ? `$${here.price.toFixed(2)}${bestStore ? ` · Best $${best!.price.toFixed(2)} @ ${bestStore.name}` : ''}`
                        : bestStore ? `Best $${best!.price.toFixed(2)} @ ${bestStore.name}` : null;
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                          {priceText ? <Text style={styles.priceHint}>{priceText}</Text> : null}
                          {access.canLogPrices && e.pantryItemId !== '__quick_scan__' && (
                            <Pressable
                              onPress={(ev) => { ev.stopPropagation(); setPriceEntry(e); }}
                              style={styles.addPriceButton}
                            >
                              <Ionicons name="pricetag-outline" size={12} color={colors.primary} />
                              <Text style={styles.addPriceText}>
                                {priceIndex.get(normalizeItemName(e.name))?.lastHere ? 'Update' : 'Log price'}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                  {/* Qty badge → stepper on right, never overlaps pricetag */}
                  {canEditActiveItems && e.pantryItemId !== '__quick_scan__' ? (
                    quantityStepperId === e.entryId ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Pressable
                          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                          style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                          onPress={(ev) => { ev.stopPropagation(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); dispatch({ type: 'UPDATE_QUANTITY', entryId: e.entryId, quantity: e.quantity - 1 }); if (e.quantity - 1 <= 1) setQuantityStepperId(null); }}
                        >
                          <Text style={{ fontSize: 16, color: colors.ink, lineHeight: 20 }}>−</Text>
                        </Pressable>
                        <Pressable onPress={(ev) => { ev.stopPropagation(); setQuantityStepperId(null); }}>
                          <Text style={[styles.planMeta, { minWidth: 28, textAlign: 'center' }]}>×{e.quantity}</Text>
                        </Pressable>
                        <Pressable
                          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                          onPress={(ev) => { ev.stopPropagation(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); dispatch({ type: 'UPDATE_QUANTITY', entryId: e.entryId, quantity: e.quantity + 1 }); }}
                          style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ fontSize: 16, color: colors.ink, lineHeight: 20 }}>+</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.itemActions}>
                        <Pressable onPress={(ev) => { ev.stopPropagation(); setQuantityStepperId(e.entryId); }} hitSlop={10}>
                          <Text style={styles.planMeta}>×{e.quantity}</Text>
                        </Pressable>
                        <Pressable
                          onPress={(ev) => {
                            ev.stopPropagation();
                            setEditingItemId(e.pantryItemId);
                          }}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${e.name}`}
                          style={styles.editItemButton}
                        >
                          <Ionicons name="ellipsis-horizontal" size={17} color={colors.muted} />
                        </Pressable>
                      </View>
                    )
                  ) : (
                    <Text style={styles.planMeta}>×{e.quantity}</Text>
                  )}
                </Pressable>
                </Swipeable>
          </View>
        ))}
      </Card></Pressable> : null}

      {entries.length === 0 && (
         <Card style={styles.activeEmptyCard}>
            <View style={styles.activeEmptyIcon}>
              <Ionicons name="basket-outline" size={26} color={colors.primary} />
            </View>
            <Text style={styles.activeEmptyTitle}>This stop is clear</Text>
            <Text style={styles.activeEmptyText}>No items are planned for this store yet.</Text>
            {canEditActiveItems ? (
              <Button label="Add an item" onPress={() => setAddSheetVisible(true)} style={{ alignSelf: 'stretch', marginTop: spacing.lg }} />
            ) : null}
         </Card>
      )}

      {entries.length > 0 && canEditActiveItems && (
          <Pressable onPress={() => setAddSheetVisible(true)} style={({ pressed }) => [styles.addMoreRow, pressed && { opacity: 0.7 }]}>
            <View style={styles.addMoreIcon}>
              <Ionicons name="add" size={20} color={colors.primary} />
            </View>
            <Text style={styles.addMoreText}>Add another item</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.faintText} />
          </Pressable>
      )}

      {isSharedHousehold && access.canManageTripLifecycle && (
        <Card style={{ marginTop: spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md }}>
            <View style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: colors.primarySoft,
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Ionicons name="people-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink, marginBottom: 3 }}>
                Need anything else?
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted, lineHeight: 18 }}>
                {"Let your household add last-minute items to your "}
                <Text style={{ fontFamily: fonts.sansMedium, color: colors.inkSoft }}>
                  {storeById(storeId)?.name ?? 'this store'}
                </Text>
                {" list."}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => { void handleNotifyHousehold(); }}
            disabled={notifyState === 'sending' || notifyState === 'sent'}
            style={({ pressed }) => [{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              backgroundColor: notifyState === 'sent'  ? colors.successSoft
                             : notifyState === 'error'  ? colors.dangerSoft
                             : colors.primarySoft,
              borderRadius: radii.md,
              paddingVertical: spacing.md,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Ionicons
              name={
                notifyState === 'sent'    ? 'checkmark-circle' :
                notifyState === 'error'   ? 'alert-circle-outline' :
                notifyState === 'sending' ? 'time-outline' :
                                            'notifications'
              }
              size={18}
              color={
                notifyState === 'sent'  ? colors.success :
                notifyState === 'error' ? colors.danger  :
                                          colors.primary
              }
            />
            <Text style={{
              flexShrink: 1,
              fontFamily: fonts.sansSemibold,
              fontSize: 13,
              lineHeight: 18,
              textAlign: 'center',
              color: notifyState === 'sent'  ? colors.success
                   : notifyState === 'error' ? colors.danger
                   : colors.primary,
            }}>
              {notifyState === 'sending'   ? 'Notifying family…'
             : notifyState === 'sent'      ? 'Family notified'
             : notifyState === 'no_tokens' ? 'Notifications off — members must sign in first'
             : notifyState === 'error'     ? "Couldn't notify family. Try again."
             :                               'Notify family'}
            </Text>
          </Pressable>
        </Card>
      )}

      <TripStopsOverview
        session={session}
        storeById={storeById}
        styles={styles}
        colors={colors}
      />

      {access.canManageTripLifecycle ? (
        <>
        <Button
          label={`Finish ${currentStoreName}`}
          onPress={() => {
          if (picked === 0 && entries.length > 0) {
            Alert.alert(
              'Nothing checked off',
              'You haven\'t picked any items yet. Done here anyway?',
              [
                { text: 'Keep shopping', style: 'cancel' },
                {
                  text: 'Done anyway',
                  onPress: () => {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    dispatch({ type: 'FINISH_STORE', now: Date.now(), stopId: activeStopId });
                  },
                },
              ],
            );
            return;
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          dispatch({ type: 'FINISH_STORE', now: Date.now(), stopId: activeStopId });
        }}
          style={styles.finishStoreCta}
        />
        <CancelTripLink dispatch={dispatch} colors={colors} />
        </>
      ) : null}
      <AddItemSheet
        visible={addSheetVisible && canEditActiveItems}
        onClose={() => setAddSheetVisible(false)}
        defaultStatus="low"
        defaultStoreId={storeId}
        hideStorePicker={true}
        title={`Add to ${storeById(storeId)?.name ?? 'trip'}`}
        subtitle="Add items you need to buy here right now."
        onItemsAdded={(addedItems) => {
           addedItems.forEach(i => {
              dispatch({
                type: 'ADD_ENTRY',
                now: Date.now(),
                entry: { pantryItemId: i.id, name: i.name, quantity: i.quantity, unit: i.unit, storeId: storeId, picked: false }
              });
           });
        }}
      />
      <PricePromptSheet
        entry={access.canLogPrices ? priceEntry : null}
        store={storeById(storeId)}
        lastPrice={priceEntry ? priceIndex.get(normalizeItemName(priceEntry.name))?.lastHere?.price : undefined}
        onClose={() => setPriceEntry(null)}
        onSave={(price) => {
          if (priceEntry) {
            recordPrice({
              itemId: priceEntry.pantryItemId,
              itemName: priceEntry.name,
              storeId,
              price,
            });
          }
          setPriceEntry(null);
        }}
      />
      <ShoppingItemEditSheet
        item={canEditActiveItems ? editingItem : null}
        // The row being edited belongs to the stop currently being shopped, so
        // the stop's store is the right label. The pantry item's own storeId
        // points at whichever store it was last assigned to, which is a
        // different store as soon as the item has an occurrence elsewhere.
        store={storeById(storeId)}
        onClose={() => setEditingItemId(null)}
      />
      </Pressable>
    </Screen>
  );
}

// ── 2. Receipt input (V1 spend-sheet style) ───────────────────────────────────

function ReceiptPrompt({ session, dispatch, storeById, rStyles, colors }: SubProps) {
  const { isDark } = useTheme();
  const storeId   = currentStoreId(session)!;
  const store     = storeById(storeId);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSpendEntry, setShowSpendEntry] = useState(false);
  const parsed = Math.round((parseFloat(amount.replace(/[^0-9.]/g, '')) || 0) * 100) / 100;

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any>(null);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [reviewRows, setReviewRows] = useState<ReceiptReviewItem<any>[]>([]);
  const [editingScanIndex, setEditingScanIndex] = useState<number | null>(null);
  const [editingScanText, setEditingScanText] = useState('');
  // The "needs a look" group (duplicates / OCR noise) stays collapsed by
  // default so a messy receipt doesn't bury the clean items the user actually
  // wants — see receipt review redesign.
  const [showUnclear, setShowUnclear] = useState(false);
  const addItem = useDurableStore((s) => s.addItem);
  const recordPrice = useDurableStore((s) => s.recordPrice);

  // Rebuild the review rows whenever a fresh scan lands. Confirmed (clean) rows
  // start selected; "Unclear" rows start unchecked so a bad scan can't silently
  // import OCR junk into the pantry.
  useEffect(() => {
    setReviewRows(reviewReceiptItems(scanResult?.items ?? []));
    setEditingScanIndex(null);
    setShowUnclear(false);
  }, [scanResult]);
  const selectedScanCount = reviewRows.filter((r) => r.selected).length;
  const selectedScanTotal = reviewRows
    .filter((r) => r.selected)
    .reduce((sum, r) => sum + (typeof r.item.price === 'number' ? r.item.price : 0), 0);
  const toggleScanItem = (i: number) =>
    setReviewRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r)));
  const beginEditScanItem = (i: number) => {
    setEditingScanIndex(i);
    setEditingScanText(reviewRows[i]?.item?.name ?? '');
  };
  const cancelEditScanItem = () => setEditingScanIndex(null);
  const commitEditScanItem = () => {
    if (editingScanIndex === null) return;
    const i = editingScanIndex;
    setReviewRows((prev) => prev.map((r, idx) => (idx === i ? renameReviewItem(r, editingScanText) : r)));
    setEditingScanIndex(null);
  };

  useEffect(() => {
    if (scanStatus !== 'Extracting items and prices…') return;
    const timer = setTimeout(() => setScanStatus('Almost done…'), 4000);
    return () => clearTimeout(timer);
  }, [scanStatus]);

  // Budget tracking
  const allTrips = useDurableStore((s) => s.trips);
  const prefs = useDurableStore((s) => s.prefs);
  const updatePrefs = useDurableStore((s) => s.updatePrefs);
  const weeklyBudget = prefs.weeklyBudget ?? 200;
  const weekStart = getMondayMs();
  const prevWeekSpend = allTrips
    .filter((t) => t.completedAt >= weekStart)
    .reduce((sum, t) => sum + t.totalSpent, 0);
  const currentTripSpend = session.receipts.reduce((sum, r) => sum + r.amount, 0);
  const totalPriorSpend = prevWeekSpend + currentTripSpend;
  const isOverBudget = (totalPriorSpend + parsed > weeklyBudget) && (prefs.dismissedBudgetWarningWeekOf !== weekStart);

  const slideAnim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isOverBudget ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 50,
    }).start();
  }, [isOverBudget, slideAnim]);

  const save = () => {
    if (parsed <= 0) return;
    setSaving(true);
    dispatch({
      type: 'SAVE_RECEIPT',
      amount: parsed,
      status: 'logged',
      imageUri,
      now: Date.now()
    });
  };

  const skip = () => dispatch({ type: 'SKIP_RECEIPT', now: Date.now() });

  const confirmedScanItems = () => receiptLineItemsFromScan(
    reviewRows.filter((row) => row.selected).map((row) => row.item),
  );

  const continueAfterScan = () => {
    setScanResult(null);
    dispatch(receiptContinuationEvent(parsed, imageUri, Date.now(), confirmedScanItems()));
  };

  const skipScanItems = () => continueAfterScan();

  const addScanItems = () => {
    const items = reviewRows.filter((r) => r.selected).map((r) => r.item);
    if (items.length === 0) return;
    items.forEach((item: any) => {
      const pantryItem = addItem({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit || 'unit',
        storeId,
        status: 'stocked',
      });
      if (item.price > 0) {
        recordPrice({
          itemId: pantryItem.id,
          itemName: pantryItem.name,
          storeId,
          price: item.price,
        });
      }
    });
    continueAfterScan();
  };

  const pickImage = async (source: 'camera' | 'library') => {
    const ImagePicker = await import('expo-image-picker');
    const permFn = source === 'camera'
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;
    const { status } = await permFn();
    if (status !== 'granted') {
      Alert.alert('Permission needed', `Allow ${source === 'camera' ? 'camera' : 'photo library'} access in Settings.`);
      return;
    }

    // Request base64 directly from the picker.
    // This avoids expo-file-system URI issues on iOS (HEIC, ph:// URIs, etc.)
    // that caused "Could not read the image file" errors.
    // Higher quality preserves thin thermal-print text for GPT-4o Vision.
    const pickerOptions = {
      quality: 0.95 as const,
      allowsEditing: false as const,
      exif: false as const,
      base64: true as const,
    };

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync({
          ...pickerOptions,
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setScanStatus('Reading receipt…');
    const { persistReceiptImage } = await import('../../core/services/receiptImages');
    const durableImageUri = await persistReceiptImage(asset.uri);
    setImageUri(durableImageUri);

    if (!asset.base64) {
      setScanStatus(null);
      Alert.alert('Scan failed', 'Could not read image data. Please try again.');
      return;
    }

    const { extractReceiptItems } = await import('../../core/services/aiReceipts');
    const { hasOpenAiKey } = await import('../../lib/config');

    if (!hasOpenAiKey()) {
      setScanStatus(null);
      Alert.alert(
        'Receipt Scan Unavailable',
        'AI receipt scanning is not configured for this build. You can still enter the total manually.',
        [{ text: 'Got it' }]
      );
      return;
    }

    const mimeType = 'image/jpeg';

    setSaving(true);
    setScanStatus('Extracting items and prices…');
    try {
      const aiResult = await extractReceiptItems(asset.base64, mimeType);
      if (aiResult && aiResult.items && aiResult.items.length > 0) {
        setScanResult(aiResult);
        if (aiResult.total_amount != null) setAmount(aiResult.total_amount.toFixed(2));
      } else {
        Alert.alert('Nothing found', 'Could not find any items on the receipt. Please try a clearer, well-lit photo.');
      }
    } catch (e: any) {
      if (__DEV__) console.warn('[AI] Error extracting items:', e);
      Alert.alert('Scan failed', e?.message ?? 'An unexpected error occurred while parsing the receipt.');
    } finally {
      setSaving(false);
      setScanStatus(null);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {/* scroll={false} so the store name is pinned and never scrolls off screen */}
      <Screen scroll={false}>
        {/* Always-visible store header */}
        <View style={rStyles.header}>
          <View style={rStyles.completedIcon}>
            <Ionicons name="checkmark" size={20} color={colors.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={rStyles.stopLabel}>STOP COMPLETED</Text>
            <Text style={rStyles.storeName} numberOfLines={1}>{store?.name ?? 'Store'}</Text>
          </View>
          <Pressable onPress={skip} style={rStyles.checkBadge}>
            <Ionicons name="arrow-forward" size={20} color={colors.primary} />
          </Pressable>
        </View>

        {!showSpendEntry ? (
          <View style={rStyles.receiptChoice}>
            <View style={rStyles.receiptChoiceIcon}>
              <Ionicons name="receipt-outline" size={30} color={colors.primary} />
            </View>
            <Text style={rStyles.receiptChoiceTitle}>Save this purchase?</Text>
            <Text style={rStyles.receiptChoiceBody}>Track your total, scan the receipt, and remember prices for next time.</Text>
            <Button label="Add receipt or total" onPress={() => setShowSpendEntry(true)} style={{ alignSelf: 'stretch', marginTop: spacing.xl }} />
            <Button
              label="Skip receipt"
              variant="ghost"
              onPress={skip}
              style={{ alignSelf: 'stretch', marginTop: spacing.md }}
            />
            <CancelTripLink dispatch={dispatch} colors={colors} />
          </View>
        ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: spacing.huge }}
        >
          <View style={rStyles.amountRow}>
            <Text style={rStyles.currency}>$</Text>
            <TextInput
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              returnKeyType="done"
              onSubmitEditing={save}
              style={rStyles.amountInput}
              autoFocus
            />
          </View>
          <Text style={rStyles.hint}>How much did you spend here? Save to continue — receipt photo is optional.</Text>

          <Animated.View
            pointerEvents={isOverBudget ? 'auto' : 'none'}
            style={[
              rStyles.budgetWarning,
              {
                opacity: slideAnim,
                transform: [
                  {
                    translateY: slideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name="warning" size={20} color="#fff" />
            <Text style={rStyles.budgetWarningText}>
              This pushes you ${((totalPriorSpend + parsed) - weeklyBudget).toFixed(2)} over your ${weeklyBudget} weekly budget!
            </Text>
            <Pressable
              onPress={() => updatePrefs({ dismissedBudgetWarningWeekOf: weekStart })}
              style={{ padding: spacing.xs, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12 }}
            >
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </Animated.View>

          {imageUri && (
            <View style={rStyles.previewContainer}>
              <Image source={{ uri: imageUri }} style={rStyles.previewImage} />
              <View style={rStyles.previewInfo}>
                <Text style={rStyles.previewTitle}>Receipt Photo</Text>
                <Text style={rStyles.previewMeta}>Ready to save with receipt</Text>
              </View>
              <Pressable onPress={() => setImageUri(null)} style={rStyles.removeBtn}>
                <Ionicons name="close-circle" size={24} color={colors.primary} />
              </Pressable>
            </View>
          )}

          {scanStatus && (
            <View style={rStyles.scanStatus}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={rStyles.scanStatusText}>{scanStatus}</Text>
            </View>
          )}

          <Pressable
            onPress={save}
            disabled={parsed <= 0 || saving}
            style={({ pressed }) => [rStyles.saveBtn, (parsed <= 0 || saving) && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}
          >
            <Text style={rStyles.saveBtnText}>
              {scanStatus ?? (saving ? 'Saving…' : parsed > 0 ? `Save  ·  $${parsed.toFixed(2)}` : 'Save amount')}
            </Text>
          </Pressable>

          <View style={rStyles.chipRow}>
            <Pressable style={({ pressed }) => [rStyles.chip, pressed && { opacity: 0.7 }]} onPress={() => void pickImage('camera')}>
              <Ionicons name="camera-outline" size={16} color={colors.ink} />
              <Text style={rStyles.chipText}>Scan Receipt</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [rStyles.chip, pressed && { opacity: 0.7 }]} onPress={() => void pickImage('library')}>
              <Ionicons name="image-outline" size={16} color={colors.ink} />
              <Text style={rStyles.chipText}>Upload Photo</Text>
            </Pressable>
          </View>

          <Pressable onPress={skip} style={rStyles.skipBtn}>
            <Text style={rStyles.skipText}>Skip for now</Text>
          </Pressable>

          <CancelTripLink dispatch={dispatch} colors={colors} />
        </ScrollView>
        )}
      </Screen>

      <Sheet visible={!!scanResult} title="Receipt scanned" onClose={skipScanItems}>
        {(() => {
          const indexed = reviewRows.map((row, i) => ({ row, i }));
          const readyRows = indexed.filter(({ row }) => !row.needsReview);
          const unclearRows = indexed.filter(({ row }) => row.needsReview);
          // Show the full receipt total (the actual amount spent) on the CTA
          // rather than a pre-tax item subtotal — simpler, and it's the number
          // the user cares about. Falls back to the item subtotal only when the
          // receipt total couldn't be read.
          const receiptTotal = scanResult?.total_amount != null ? Number(scanResult.total_amount) : null;
          const ctaAmount = receiptTotal != null ? receiptTotal : selectedScanTotal > 0 ? selectedScanTotal : null;

          const renderRow = ({ row, i, compact }: { row: ReceiptReviewItem<any>; i: number; compact: boolean }) => {
            const item = row.item;
            const cat = item.item_category ?? 'food';
            const dotColor = getCategoryColors(
              cat === 'household' ? 'household' : cat === 'personal_care' ? 'personal_care' : cat === 'non_grocery' ? 'other' : 'produce_fruit',
              isDark,
            ).fg;
            const isSelected = row.selected;
            const isEditing = editingScanIndex === i;

            if (isEditing) {
              return (
                <View key={row.rowId} style={{ padding: spacing.sm, backgroundColor: colors.surfaceRaised, borderRadius: radii.md, marginBottom: spacing.xs }}>
                  <TextInput
                    value={editingScanText}
                    onChangeText={setEditingScanText}
                    placeholder="Item name"
                    placeholderTextColor={colors.muted}
                    autoFocus
                    onSubmitEditing={commitEditScanItem}
                    style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.primary, paddingVertical: 2 }}
                  />
                  <View style={{ flexDirection: 'row', marginTop: spacing.xs }}>
                    <Pressable onPress={commitEditScanItem} hitSlop={8} style={{ marginRight: spacing.lg }}>
                      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.primary }}>Save</Text>
                    </Pressable>
                    <Pressable onPress={cancelEditScanItem} hitSlop={8}>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }

            return (
              <Pressable
                key={row.rowId}
                onPress={() => toggleScanItem(i)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                  paddingVertical: compact ? 9 : spacing.sm, paddingHorizontal: spacing.xs,
                  borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
                }}
              >
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={isSelected ? colors.primary : colors.muted}
                />
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ flexShrink: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink }} numberOfLines={1}>{item.name}</Text>
                    {row.needsReview && <Pill label="Unclear" tone="low" style={{ marginLeft: spacing.sm }} />}
                  </View>
                  {!compact && (
                    <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      Looks like receipt text — edit the name or leave unchecked to skip.
                    </Text>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.name}`}
                  onPress={() => beginEditScanItem(i)}
                  hitSlop={8}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="pencil-outline" size={17} color={colors.muted} />
                </Pressable>
                {item.price ? (
                  <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.muted }}>${item.price.toFixed(2)}</Text>
                ) : null}
              </Pressable>
            );
          };

          return (
            <>
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: colors.surface, borderRadius: radii.md,
                paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.md,
              }}>
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink }}>
                  {scanResult?.total_amount != null ? `$${Number(scanResult.total_amount).toFixed(2)} total` : `${scanResult?.items?.length ?? 0} items found`}
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted }}>
                  {readyRows.length} ready{unclearRows.length > 0 ? ` · ${unclearRows.length} need a look` : ''}
                </Text>
              </View>

              {/* No inner ScrollView here — Sheet already wraps its children in one.
                  Nesting a second ScrollView caused the status bar to scroll away
                  from the list independently, clipping rows against the sheet's
                  rounded top corner. Everything scrolls together as one surface. */}
              <View style={{ marginBottom: spacing.md }}>
                {readyRows.length > 0 && (
                  <Text style={{ fontFamily: fonts.sansSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.muted, marginBottom: spacing.xs }}>
                    READY TO ADD
                  </Text>
                )}
                {readyRows.map(({ row, i }) => renderRow({ row, i, compact: true }))}

                {unclearRows.length > 0 && (
                  <Pressable
                    onPress={() => setShowUnclear((v) => !v)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      backgroundColor: colors.surface, borderRadius: radii.md,
                      paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                      marginTop: spacing.md,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.ink }}>
                      {unclearRows.length} item{unclearRows.length === 1 ? '' : 's'} need a look
                    </Text>
                    <Ionicons name={showUnclear ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
                  </Pressable>
                )}
                {showUnclear && unclearRows.map(({ row, i }) => renderRow({ row, i, compact: false }))}
              </View>

              <Button
                label={
                  selectedScanCount === 0
                    ? 'Select items to add'
                    : `Add ${selectedScanCount} item${selectedScanCount === 1 ? '' : 's'}${ctaAmount != null ? ` · $${ctaAmount.toFixed(2)} total` : ''}`
                }
                disabled={selectedScanCount === 0}
                onPress={addScanItems}
              />
              <Button
                label="Skip for now"
                variant="ghost"
                onPress={skipScanItems}
                style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}
              />
            </>
          );
        })()}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

// ── Trip stops overview ───────────────────────────────────────────────────────

/**
 * Completed and remaining stops in the active trip, read from shopping
 * occurrences. The current stop is rendered only by ShoppingActive above.
 *
 * This is the only place the multi-stop shape is visible while shopping, and it
 * is deliberately read-only: the stop being shopped stays the single
 * interactive list above, so this adds no second shopping flow. It exists
 * because a pantry item carries one storeId, so the same item bought at two
 * stops is only representable as two occurrences — grouping by stopId is what
 * keeps an earlier stop visible after the shopper moves on.
 */
function TripStopsOverview({
  session,
  storeById,
  styles,
  colors,
}: {
  session: ShoppingSession;
  storeById: (id: string) => Store | undefined;
  styles: ReturnType<typeof makeStyles>['styles'];
  colors: AppColors;
}) {
  const groups = tripStopsOverviewGroups(session)
    .filter((group) => group.classification === 'remaining');
  if (groups.length === 0) return null;

  return (
    <View style={styles.itinerarySection}>
      <Text style={styles.summaryEyebrow}>UP NEXT</Text>
      <View style={styles.itineraryDivider} />
      {groups.map((group) => {
        const preview = shoppingItineraryPreview(
          group.items.map((occurrence) => occurrence.name),
        );
        const store = storeById(group.storeId);
        return (
          <Card key={group.key} style={styles.itineraryCard}>
            <View style={styles.itineraryHeader}>
              <StoreChip store={store} name={store?.name ?? 'Unknown Store'} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itineraryStoreName}>
                  {store?.name ?? 'Unknown Store'}
                </Text>
                <Text style={styles.itineraryItemCount}>
                  {group.items.length} item{group.items.length === 1 ? '' : 's'}
                </Text>
              </View>
              {group.isNext ? (
                <Ionicons name="navigate-outline" size={18} color={colors.primary} />
              ) : null}
            </View>
            {preview.label ? (
              <Text style={styles.itineraryPreview} numberOfLines={1}>
                {preview.label}
              </Text>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

// ── 3. Per-store summary ──────────────────────────────────────────────────────

function StoreSummary({ session, dispatch, storeById, ssStyles, colors }: SubProps) {
  const stores = useDurableStore((s) => s.stores);
  const [showAddStore, setShowAddStore] = useState(false);
  const storeId = currentStoreId(session)!;
  const store   = storeById(storeId);
  const receipt = session.receipts.find((r) => r.storeId === storeId);
  const entries = currentStoreEntries(session);
  const bought  = entries.filter((e) => e.picked).length;
  const left    = entries.filter((e) => !e.picked).length;
  const pending = pendingStoreIds(session);
  const manualStores = stores.filter((candidate) => !session.storeQueue.includes(candidate.id));
  const spent   = receipt && receipt.status !== 'skipped' ? receipt.amount : 0;
  const completedAt = receipt?.createdAt ?? Date.now();
  const finishTrip = () => {
    dispatch({ type: 'FINISH_TRIP', now: Date.now() });
  };

  return (
    <Screen>
      <PageTitle eyebrow="Stop completed" title={store?.name ?? 'Store'} />

      <Card style={ssStyles.card}>
        <View style={ssStyles.completedBadge}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={ssStyles.completedBadgeText}>Stop saved</Text>
        </View>
        <View style={ssStyles.row}>
          <View style={ssStyles.statBox}>
            <Text style={ssStyles.statVal}>{spent > 0 ? `$${spent.toFixed(2)}` : '—'}</Text>
            <Text style={ssStyles.statLbl}>Spent</Text>
          </View>
          <View style={ssStyles.divider} />
          <View style={ssStyles.statBox}>
            <Text style={ssStyles.statVal}>{bought}</Text>
            <Text style={ssStyles.statLbl}>Items bought</Text>
          </View>
          <View style={ssStyles.divider} />
          <View style={ssStyles.statBox}>
            <Text style={ssStyles.statVal}>{left}</Text>
            <Text style={ssStyles.statLbl}>Items left</Text>
          </View>
        </View>
        <View style={ssStyles.timeRow}>
          <Ionicons name="time-outline" size={14} color={colors.muted} />
          <Text style={ssStyles.timeText}>
            Visit completed · {new Date(completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </Card>

      {/* What's next hint */}
      {pending.length > 0 ? (
        <Card style={ssStyles.routeCard}>
          <View style={ssStyles.routeIcon}>
            <Ionicons name="navigate" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ssStyles.routeEyebrow}>UP NEXT</Text>
            <Text style={ssStyles.routeTitle}>{storeById(pending[0])?.name ?? 'Next store'}</Text>
            <Text style={ssStyles.routeMeta}>{pending.length} stop{pending.length > 1 ? 's' : ''} left on your route</Text>
          </View>
        </Card>
      ) : (
        <View style={[ssStyles.nextHint, ssStyles.completeHint]}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
          <Text style={[ssStyles.nextHintText, { color: colors.success }]}>All stops completed!</Text>
        </View>
      )}

      {pending.length > 0 ? (
        <Button
          label={`Continue to ${storeById(pending[0])?.name ?? 'next store'}`}
          onPress={() => dispatch({ type: 'CONTINUE_TRIP' })}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      {pending.length === 0 ? (
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <Text style={ssStyles.sectionLabel}>Shopping somewhere else?</Text>
          {manualStores.map((candidate) => (
            <Pressable
              key={candidate.id}
              onPress={() => dispatch({ type: 'START_MANUAL_STORE', storeId: candidate.id })}
              style={ssStyles.manualStore}
            >
              <StoreChip store={candidate} size={40} />
              <Text style={ssStyles.manualStoreName}>{candidate.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
          <Pressable
            onPress={() => setShowAddStore(true)}
            style={ssStyles.manualStore}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={22} color={colors.primary} />
            </View>
            <Text style={ssStyles.manualStoreName}>Add a new store</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      {pending.length === 0 ? (
        <Button
          label="Reopen store"
          variant="ghost"
          onPress={() => dispatch({ type: 'REOPEN_STORE', stopId: currentStopId(session)!, now: Date.now() })}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      {pending.length === 0 ? (
        <Button
          label="End trip"
          onPress={finishTrip}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
      <Sheet
        visible={showAddStore}
        title="Add a new store"
        onClose={() => setShowAddStore(false)}
      >
        <AddStoreContent
          isActive={showAddStore}
          onClose={() => setShowAddStore(false)}
          onStoreAdded={(newStoreId) => {
            dispatch({ type: 'START_MANUAL_STORE', storeId: newStoreId });
            setShowAddStore(false);
          }}
        />
      </Sheet>
      <CancelTripLink dispatch={dispatch} colors={colors} />
    </Screen>
  );
}

// ── 5. Next store selector ────────────────────────────────────────────────────

function NextStoreSelector({ session, dispatch, storeById, styles, nsStyles, colors }: SubProps) {
  const pending = pendingStoreIds(session);
  const allStores = useDurableStore((s) => s.stores);
  const [skipping, setSkipping] = useState<string | null>(null);
  const [showAddStore, setShowAddStore] = useState(false);
  const [addStoreMode, setAddStoreMode] = useState<'choose' | 'create'>('choose');

  // Saved stores the user hasn't planned into this trip yet
  const availableStores = unplannedStores(allStores, session.storeQueue);
  const closeAddStore = () => {
    setShowAddStore(false);
    setAddStoreMode('choose');
  };

  return (
    <Screen>
      <PageTitle eyebrow="On the move" title="Where next?" />

      {pending.length === 0 ? (
        <Card>
          <Text style={styles.emptyNote}>All planned stores done or skipped.</Text>
          <Button
            label="See trip summary"
            onPress={() => dispatch({ type: 'FINISH_TRIP_EARLY', now: Date.now() })}
            style={{ marginTop: spacing.lg }}
          />
        </Card>
      ) : (
        <>
          <View style={nsStyles.routeSummary}>
            <View style={nsStyles.routeSummaryIcon}>
              <Ionicons name="map-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={nsStyles.routeSummaryTitle}>{pending.length} stop{pending.length === 1 ? '' : 's'} remaining</Text>
              <Text style={nsStyles.routeSummaryText}>Choose where you want to shop next.</Text>
            </View>
          </View>

          {pending.map((storeId, idx) => {
            const store    = storeById(storeId);
            const itemCount = session.entries.filter((e) => e.storeId === storeId).length;
            const barColor = ROUTE_COLORS[idx % ROUTE_COLORS.length];

            return (
              <Card key={storeId} style={[nsStyles.storeCard, idx === 0 && nsStyles.recommendedStoreCard]}>
                <View style={nsStyles.storeRow}>
                  <StoreChip store={store} name={store?.name ?? '?'} size={48} />
                  <View style={{ flex: 1 }}>
                    {idx === 0 ? <Text style={nsStyles.recommendedLabel}>NEXT ON ROUTE</Text> : null}
                    <Text style={nsStyles.storeName}>{store?.name ?? 'Unknown Store'}</Text>
                    <Text style={nsStyles.storeItems}>{itemCount} item{itemCount !== 1 ? 's' : ''} waiting</Text>
                  </View>
                  <Pressable
                    onPress={() => dispatch({ type: 'CHOOSE_NEXT_STORE', storeId })}
                    style={({ pressed }) => [nsStyles.startBtn, { borderColor: barColor }, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={[nsStyles.startBtnText, { color: barColor }]}>Go</Text>
                  </Pressable>
                </View>

                {/* Skip this store link */}
                <Pressable
                  onPress={() => {
                    setSkipping(storeId);
                    dispatch({ type: 'SKIP_STORE', storeId, now: Date.now() });
                  }}
                  style={nsStyles.skipStoreBtn}
                >
                  <Text style={nsStyles.skipStoreText}>Skip {store?.name ?? 'Unknown Store'}</Text>
                </Pressable>
              </Card>
            );
          })}

          {/* Skipped stores — allow un-skipping */}
          {session.skippedStoreIds.length > 0 && (
            <View style={{ marginTop: spacing.md }}>
              <Text style={[nsStyles.subtitle, { marginBottom: spacing.sm }]}>Skipped:</Text>
              {session.skippedStoreIds.map((storeId) => {
                const store = storeById(storeId);
                const itemCount = session.entries.filter((e) => e.storeId === storeId).length;
                return (
                  <Card key={storeId} style={[nsStyles.storeCard, { opacity: 0.65 }]}>
                    <View style={nsStyles.storeRow}>
                      <StoreChip store={store} name={store?.name ?? '?'} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text style={nsStyles.storeName}>{store?.name ?? 'Unknown'}</Text>
                        <Text style={nsStyles.storeItems}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
                      </View>
                      <Pressable
                        onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); dispatch({ type: 'UNSKIP_STORE', storeId, now: Date.now() }); }}
                        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}
                      >
                        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink }}>Un-skip</Text>
                      </Pressable>
                    </View>
                  </Card>
                );
              })}
            </View>
          )}

          {/* Add an unplanned store mid-trip */}
          <Pressable onPress={() => { setAddStoreMode('choose'); setShowAddStore(true); }} style={nsStyles.addStoreBtn}>
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={nsStyles.addStoreBtnText}>Add another stop</Text>
          </Pressable>
        </>
      )}

      <Pressable
        onPress={() => {
          Alert.alert(
            'Finish entire trip?',
            `${pending.length} store${pending.length > 1 ? 's' : ''} will be marked as skipped.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Finish trip', style: 'destructive', onPress: () => dispatch({ type: 'FINISH_TRIP_EARLY', now: Date.now() }) },
            ],
          );
        }}
        style={nsStyles.finishBtn}
      >
        <Text style={nsStyles.finishBtnText}>Finish entire shopping trip</Text>
      </Pressable>

      {/* Sheet: pick an unplanned store to add mid-trip */}
      <Sheet
        visible={showAddStore}
        title={addStoreMode === 'create' ? 'Add a new store' : 'Add another stop'}
        onClose={closeAddStore}
      >
        {addStoreMode === 'create' ? (
          <AddStoreContent
            isActive={showAddStore}
            onClose={() => setAddStoreMode('choose')}
            onStoreAdded={(storeId) => {
              dispatch({ type: 'START_MANUAL_STORE', storeId });
              closeAddStore();
            }}
          />
        ) : availableStores.length === 0 ? (
          <View>
            <Text style={nsStyles.noStoresText}>
              All saved stores are already on this trip.
            </Text>
            <Button label="Add a new store" onPress={() => setAddStoreMode('create')} />
            <Button label="Close" variant="ghost" onPress={closeAddStore} style={{ marginTop: spacing.sm }} />
          </View>
        ) : (
          <>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginBottom: spacing.lg }}>
              Pick a store to add to your current trip. You can add items once you're there.
            </Text>
            {availableStores.map((store) => (
              <Pressable
                key={store.id}
                onPress={() => {
                  dispatch({ type: 'START_MANUAL_STORE', storeId: store.id });
                  closeAddStore();
                }}
                style={({ pressed }) => [nsStyles.addStoreRow, pressed && { opacity: 0.7 }]}
              >
                <StoreChip store={store} size={44} />
                <Text style={nsStyles.addStoreRowName}>{store.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
            <Button
              label="Add a new store"
              variant="ghost"
              onPress={() => setAddStoreMode('create')}
              style={{ marginTop: spacing.lg }}
            />
          </>
        )}
      </Sheet>
      <CancelTripLink dispatch={dispatch} colors={colors} />
    </Screen>
  );
}

// ── Active trip shell ─────────────────────────────────────────────────────────
// Persistent wrapper for the shopping_store / receipt_prompt / store_summary
// (continue_prompt) / next_store_ready sequence, so switching between them
// animates in place instead of hard-swapping separate screens.

function ActiveTripShell(props: SubProps) {
  const { session } = props;

  // NOTE: Do NOT run LayoutAnimation on status change here. On the New
  // Architecture (Fabric), a LayoutAnimation tick that overlaps the receipt
  // review Sheet (a Modal, i.e. a separate shadow surface) mounting/unmounting
  // dereferences a freed shadow node → EXC_BAD_ACCESS (KERN_INVALID_ADDRESS
  // 0x18) in RCTMountingManager. Confirmed via device crash log. Status changes
  // now transition without the ease animation, which is the safe trade.

  if (!props.access.canManageTripLifecycle) return <ShoppingActive {...props} />;
  if (session.status === 'receipt_prompt') return <ReceiptPrompt {...props} />;
  if (session.status === 'store_summary' || session.status === 'continue_prompt') return <StoreSummary {...props} />;
  if (session.status === 'next_store_ready') return <NextStoreSelector {...props} />;
  return <ShoppingActive {...props} />;
}

// ── Shared cancel-trip link ───────────────────────────────────────────────────

function CancelTripLink({ dispatch, colors }: { dispatch: SubProps['dispatch']; colors: AppColors }) {
  const confirmCancel = () => {
    Alert.alert(
      'Cancel this trip?',
      'All picks and receipts from this trip will be discarded. Your pantry plan stays unchanged.',
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Cancel trip', style: 'destructive', onPress: () => dispatch({ type: 'END_TRIP' }) },
      ],
    );
  };
  return (
    <Pressable onPress={confirmCancel} style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>Cancel trip</Text>
    </Pressable>
  );
}


// ── helpers ───────────────────────────────────────────────────────────────────

function getMondayMs(): number {
  const now = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

// ── 6. Final trip summary ─────────────────────────────────────────────────────

function TripSummary({ session, dispatch, storeById, tsStyles, colors }: SubProps) {
  const trip = session.completedTrip!;
  const prefs = useDurableStore((s) => s.prefs);
  const allTrips = useDurableStore((s) => s.trips);

  const visitedCount = trip.storeIdsVisited.length;
  const skippedCount = trip.skippedStoreIds.length;
  const durationMin  = Math.round(trip.duration / 60_000);
  const durationStr  = durationMin < 60
    ? `${durationMin} min`
    : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;

  // Budget tracking — sum previous trips this week + this trip
  const weeklyBudget  = prefs.weeklyBudget ?? 200;
  const weekStart     = getMondayMs();
  const prevWeekSpend = allTrips
    .filter((t) => t.completedAt >= weekStart)
    .reduce((sum, t) => sum + t.totalSpent, 0);
  const weekTotal  = prevWeekSpend + trip.totalSpent;
  const budgetFill = Math.min(weekTotal / weeklyBudget, 1);
  const overBudget = weekTotal > weeklyBudget;
  const remaining  = weeklyBudget - weekTotal;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: spacing.xs, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.sm }}>
        <Text style={tsStyles.eyebrow}>Trip complete</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginLeft: 'auto' }}>
          <Pressable onPress={() => dispatch({ type: 'END_TRIP' })} style={{ backgroundColor: colors.surfaceRaised, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.primary }}>Done</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={tsStyles.scroll}>
        <Card style={tsStyles.heroCard}>
          <View style={tsStyles.completeIcon}>
            <Ionicons name="checkmark" size={24} color={colors.onPrimary} />
          </View>
          <Text style={tsStyles.heroEyebrow}>SHOPPING COMPLETE</Text>
          <Text style={tsStyles.total}>${trip.totalSpent.toFixed(2)}</Text>
          <Text style={tsStyles.totalLabel}>total spent this trip</Text>
        </Card>

        {/* Stats row */}
        <View style={tsStyles.statsRow}>
          <StatBox value={visitedCount} label="Stops" tsStyles={tsStyles} colors={colors} />
          <StatBox value={trip.itemsBought} label="Bought" tsStyles={tsStyles} colors={colors} />
          {(trip.itemsOutOfStock ?? 0) > 0 && <StatBox value={trip.itemsOutOfStock} label="Out of stock" dim tsStyles={tsStyles} colors={colors} />}
          {trip.itemsRemaining > 0 && <StatBox value={trip.itemsRemaining} label="Remaining" dim tsStyles={tsStyles} colors={colors} />}
          <StatBox value={durationStr} label="Duration" mono={false} tsStyles={tsStyles} colors={colors} />
        </View>

        {/* Weekly budget card */}
        <Card style={tsStyles.budgetCard}>
          <View style={tsStyles.budgetHeader}>
            <View style={tsStyles.budgetTitleRow}>
              <Ionicons name="wallet-outline" size={15} color={overBudget ? colors.danger : colors.primary} />
              <Text style={tsStyles.budgetTitle}>WEEKLY BUDGET</Text>
            </View>
            <Text style={[tsStyles.budgetStatus, overBudget ? tsStyles.budgetOver : tsStyles.budgetUnder]}>
              {overBudget
                ? `$${Math.abs(remaining).toFixed(2)} over`
                : `$${remaining.toFixed(2)} left`}
            </Text>
          </View>
          <View style={tsStyles.budgetAmounts}>
            <Text style={tsStyles.budgetSpent}>${weekTotal.toFixed(2)}</Text>
            <Text style={tsStyles.budgetOf}> / ${weeklyBudget.toFixed(0)}</Text>
          </View>
          {/* Progress bar */}
          <View style={tsStyles.barTrack}>
            <View
              style={[
                tsStyles.barFill,
                { width: `${Math.round(budgetFill * 100)}%` as any },
                overBudget ? tsStyles.barOver : tsStyles.barUnder,
              ]}
            />
          </View>
          <Text style={tsStyles.budgetNote}>
            {overBudget
              ? `You've spent $${Math.abs(remaining).toFixed(2)} over your $${weeklyBudget} weekly budget this week.`
              : `${Math.round(budgetFill * 100)}% of your $${weeklyBudget} weekly budget used.`}
          </Text>
        </Card>

        {/* Completed stores */}
        {visitedCount > 0 && (
          <>
            <Text style={tsStyles.sectionTitle}>Stops completed</Text>
            {trip.breakdown
              .filter((b) => !b.skipped)
              .map((b, idx) => {
                const store = storeById(b.storeId);
                const barColor = ROUTE_COLORS[idx % ROUTE_COLORS.length];
                const boughtHere = session.entries.filter((e) => e.storeId === b.storeId && e.picked && e.pantryItemId !== '__quick_scan__');
                return (
                  <Card key={b.storeId} style={tsStyles.storeCard}>
                    <View style={tsStyles.storeRow}>
                      <StoreChip store={store} name={store?.name ?? '?'} size={44} />
                      <View style={{ flex: 1 }}>
                        <Text style={tsStyles.storeName}>{store?.name ?? 'Unknown Store'}</Text>
                        <Text style={tsStyles.storeMeta}>
                          {b.itemsBought} item{b.itemsBought !== 1 ? 's' : ''} bought
                        </Text>
                        {boughtHere.length > 0 && (
                          <Text style={tsStyles.itemsList} numberOfLines={2}>
                            {boughtHere.map((e) => e.name).join(', ')}
                          </Text>
                        )}
                      </View>
                      <Text style={[tsStyles.storeSpent, { color: barColor }]}>
                        {b.amount > 0 ? `$${b.amount.toFixed(2)}` : '—'}
                      </Text>
                    </View>
                  </Card>
                );
              })}
          </>
        )}

        {/* Skipped stores */}
        {skippedCount > 0 && (
          <>
            <Text style={[tsStyles.sectionTitle, { color: colors.muted }]}>Skipped</Text>
            {trip.breakdown
              .filter((b) => b.skipped)
              .map((b) => {
                const store = storeById(b.storeId);
                const remaining = session.entries.filter((e) => e.storeId === b.storeId).length;
                return (
                  <Card key={b.storeId} style={[tsStyles.storeCard, tsStyles.skippedCard]}>
                    <View style={tsStyles.storeRow}>
                      <StoreChip store={store} name={store?.name ?? '?'} size={44} />
                      <View style={{ flex: 1 }}>
                        <Text style={[tsStyles.storeName, { color: colors.muted }]}>{store?.name ?? 'Unknown Store'}</Text>
                        <Text style={tsStyles.storeMeta}>{remaining} item{remaining !== 1 ? 's' : ''} not bought</Text>
                      </View>
                      <Pill label="Skipped" tone="muted" />
                    </View>
                  </Card>
                );
              })}
          </>
        )}

        {/* Time info */}
        <View style={tsStyles.timeRow}>
          <Text style={tsStyles.timeText}>
            {new Date(trip.startedAt).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            {'  '}
            {new Date(trip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {' → '}
            {new Date(trip.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        {/* Done */}
        <Button
          label="Done"
          onPress={() => dispatch({ type: 'END_TRIP' })}
          style={{ marginTop: spacing.xl }}
        />
        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ value, label, dim, mono = true, tsStyles, colors }: { value: string | number; label: string; dim?: boolean; mono?: boolean; tsStyles: any; colors: AppColors }) {
  return (
    <View style={tsStyles.statBox}>
      <Text style={[tsStyles.statVal, mono && { fontFamily: fonts.mono }, dim && { color: colors.muted }]}>
        {value}
      </Text>
      <Text style={tsStyles.statLbl}>{label}</Text>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  const styles = StyleSheet.create({
    summaryCard:  { padding: spacing.xl, borderColor: colors.primary + '24', backgroundColor: colors.backgroundElevated },
    summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    summaryEyebrow: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1.2, color: colors.primary },
    summaryTitle: { fontFamily: fonts.sansSemibold, fontSize: 20, color: colors.ink, marginTop: 3 },
    summaryIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    summaryStats: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderSoft },
    summaryStat: { flex: 1, alignItems: 'center' },
    summaryStatDivider: { width: 1, height: 38, backgroundColor: colors.border },
    priceMemoryCard: { marginTop: spacing.md, marginBottom: spacing.sm, paddingVertical: spacing.md, borderColor: colors.borderSoft, backgroundColor: colors.surface },
    priceMemoryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    priceMemoryIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    priceMemoryTitle: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.ink },
    priceMemoryBody: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted, marginTop: 1 },
    summaryBig:   { fontFamily: fonts.monoMedium, fontSize: 27, color: colors.ink, lineHeight: 34, fontVariant: ['tabular-nums'] },
    summarySub:   { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
    firstDestination: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.primarySoft },
    firstDestCaption: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1, color: colors.primary },
    firstDestLabel: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    primaryCta: { marginTop: spacing.lg, minHeight: 54 },
    planStoreCard: { marginTop: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xs },
    planStoreHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    planStoreTitle: { flex: 1, fontFamily: fonts.sansSemibold, fontSize: 17, color: colors.ink },
    planStoreCount: { minWidth: 28, height: 28, borderRadius: 14, textAlign: 'center', textAlignVertical: 'center', paddingTop: Platform.OS === 'ios' ? 6 : 4, fontFamily: fonts.monoMedium, fontSize: 12, color: colors.primary, backgroundColor: colors.primarySoft, fontVariant: ['tabular-nums'] },
    rowDivider:   { height: 1, backgroundColor: colors.borderSoft, marginLeft: 44 + spacing.md },
    planRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.md, justifyContent: 'space-between', minHeight: 58, paddingVertical: spacing.md },
    planName:     { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
    planMeta:     { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'] },
    itinerarySection: { marginTop: spacing.xl },
    itineraryDivider: { height: 1, backgroundColor: colors.borderSoft, marginTop: spacing.sm, marginBottom: spacing.xs },
    itineraryCard: { marginTop: spacing.md, paddingVertical: spacing.md },
    itineraryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    itineraryStoreName: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    itineraryItemCount: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
    itineraryPreview: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: spacing.sm },
    bulkAssignRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
    bulkAssignIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    bulkAssignTitle: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    bulkAssignText: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    chooseStorePill: { minHeight: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, justifyContent: 'center', backgroundColor: colors.surface },
    chooseStorePillText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.primary },
    assignStoreHint: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.warning, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },
    warnText:     { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, lineHeight: 19 },
    routeNotReady:{ borderColor: colors.primary, borderWidth: 1, gap: spacing.sm },
    routeNotReadyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    routeNotReadyTitle: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    activeTripCard: { padding: spacing.xl, borderColor: colors.primary + '24' },
    collaboratorCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
      paddingVertical: spacing.xs,
      borderColor: colors.primary + '35',
      backgroundColor: colors.primarySoft,
    },
    collaboratorTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 13,
      color: colors.ink,
    },
    collaboratorBody: {
      fontFamily: fonts.sans,
      fontSize: 11,
      lineHeight: 15,
      color: colors.muted,
      marginTop: 1,
    },
    activeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    activeStep:   { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
    activeStore:  { fontFamily: fonts.serifItalic, fontSize: 25, color: colors.ink, marginTop: 2 },
    progressWrap: { marginTop: spacing.xl },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    progressLabel: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.muted, letterSpacing: 1 },
    progressCount: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.primary, fontVariant: ['tabular-nums'] },
    progressTrack:{ height: 10, borderRadius: 5, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
    progressFill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
    progressText: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
    listHeading: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
    listTitle: { fontFamily: fonts.serifItalic, fontSize: 20, lineHeight: 26, color: colors.ink, flex: 1 },
    listCountBadge: { minWidth: 28, height: 28, paddingHorizontal: spacing.sm, borderRadius: 14, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
    listCountText: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.ink, fontVariant: ['tabular-nums'] },
    shoppingListCard: { paddingVertical: spacing.xs, marginBottom: spacing.sm },
    shoppingSwipeActionRight: { backgroundColor: colors.danger, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20, flex: 1 },
    pickRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, borderRadius: radii.sm },
    pickRowDone: { backgroundColor: colors.successSoft + '55' },
    pickControl: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
    pickControlDone: { backgroundColor: colors.success, borderColor: colors.success },
    pickName:     { flex: 1, fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
    pickNameDone: { color: colors.muted, textDecorationLine: 'line-through' },
    priceHint:    { fontFamily: fonts.sans, fontSize: 11, color: colors.primary, marginTop: 3, fontVariant: ['tabular-nums'] },
    addPriceButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8 },
    addPriceText: { fontFamily: fonts.sansSemibold, fontSize: 11, color: colors.primary },
    itemActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    editItemButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    addMoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
    addMoreIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    addMoreText: { flex: 1, fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.ink },
    activeEmptyCard: { alignItems: 'center', paddingVertical: spacing.xxl },
    activeEmptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    activeEmptyTitle: { fontFamily: fonts.serifItalic, fontSize: 22, color: colors.ink, marginTop: spacing.md },
    activeEmptyText: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginTop: spacing.xs },
    finishStoreCta: { marginTop: spacing.xl, minHeight: 54, ...shadow.card },
    emptyNote:    { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
    continueTitle:{ fontFamily: fonts.serifItalic, fontSize: 22, color: colors.ink, textAlign: 'center' },
    continueBody: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: spacing.md },
    continueNote: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 19, color: colors.success, textAlign: 'center', marginTop: spacing.xl },
    manualHint:   { fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
    manualStoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    manualStoreName: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    manualStoreMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
  });

  const rStyles = StyleSheet.create({
    header:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radii.lg, backgroundColor: colors.surface, ...shadow.card },
    completedIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
    storeName: { fontFamily: fonts.serifItalic, fontSize: 25, color: colors.ink, maxWidth: 230 },
    stopLabel: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.success, letterSpacing: 1, marginBottom: 2 },
    checkBadge:{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    receiptChoice: { alignItems: 'center', paddingTop: spacing.xl },
    receiptChoiceIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
    receiptChoiceTitle: { fontFamily: fonts.serifItalic, fontSize: 26, color: colors.ink, textAlign: 'center' },
    receiptChoiceBody: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: 'center', maxWidth: 310, marginTop: spacing.sm },
    amountRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, marginHorizontal: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.md },
    currency:  { fontFamily: fonts.mono, fontSize: 36, color: colors.primary, marginRight: spacing.sm, fontVariant: ['tabular-nums'] },
    amountInput:{ flex: 1, fontFamily: fonts.mono, fontSize: 48, color: colors.ink, padding: 0, fontVariant: ['tabular-nums'] },
    hint:      { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginHorizontal: spacing.sm, marginBottom: spacing.xl, lineHeight: 19 },
    saveBtn:   { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 17, alignItems: 'center', marginHorizontal: spacing.sm, ...shadow.card },
    saveBtnText:{ fontFamily: fonts.sansSemibold, fontSize: 17, color: colors.onPrimary, fontVariant: ['tabular-nums'] },
    chipRow:   { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, marginHorizontal: spacing.sm },
    chip:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.surfaceRaised, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.primary, paddingVertical: 12 },
    chipText:  { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },
    skipBtn:   { alignItems: 'center', paddingVertical: spacing.xl, marginTop: spacing.sm },
    skipText:  { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted },
    budgetWarning: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.warning,
      marginHorizontal: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    budgetWarningText: {
      fontFamily: fonts.sansMedium,
      fontSize: 14,
      color: '#fff',
      flex: 1,
    },
    previewContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.sm,
      marginHorizontal: spacing.sm,
      marginBottom: spacing.lg,
    },
    previewImage: {
      width: 50,
      height: 50,
      borderRadius: radii.sm,
      backgroundColor: colors.border,
    },
    previewInfo: {
      flex: 1,
      marginLeft: spacing.md,
    },
    previewTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 14,
      color: colors.ink,
    },
    previewMeta: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    scanStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.sm,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceRaised,
    },
    scanStatusText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },
    removeBtn: {
      padding: spacing.xs,
    },
  });

  const ssStyles = StyleSheet.create({
    card:     { paddingVertical: spacing.xl, borderColor: colors.success + '24' },
    completedBadge: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.pill, backgroundColor: colors.successSoft, marginBottom: spacing.xl },
    completedBadgeText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.success },
    row:      { flexDirection: 'row', alignItems: 'center' },
    statBox:  { flex: 1, alignItems: 'center', gap: 4 },
    statVal:  { fontFamily: fonts.mono, fontSize: 26, color: colors.ink, fontVariant: ['tabular-nums'] },
    statLbl:  { fontFamily: fonts.sans, fontSize: 11, color: colors.muted },
    divider:  { width: 1, height: 40, backgroundColor: colors.border },
    timeRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.borderSoft },
    timeText: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'] },
    nextHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.sm },
    completeHint: { justifyContent: 'center', padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.successSoft },
    nextHintText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.primary },
    routeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg, padding: spacing.lg, borderColor: colors.primary + '24' },
    routeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    routeEyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.1, color: colors.primary },
    routeTitle: { fontFamily: fonts.sansSemibold, fontSize: 17, color: colors.ink, marginTop: 2 },
    routeMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    sectionLabel: { fontFamily: fonts.serifItalic, fontSize: 19, color: colors.ink, marginBottom: spacing.xs },
    manualStore: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      padding: spacing.md,
    },
    manualStoreName: { flex: 1, fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
  });

  const nsStyles = StyleSheet.create({
    entryScreen: { paddingHorizontal: spacing.xs },
    entryHeader: { marginBottom: spacing.xxl },
    entryEyebrow: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1.3, color: colors.primary, marginBottom: spacing.sm },
    entryTitle: { fontFamily: fonts.serifItalic, fontSize: 34, lineHeight: 40, color: colors.ink, maxWidth: 340 },
    chooserIntro: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: spacing.sm },
    entryCards: { gap: spacing.md },
    memberCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 88, padding: spacing.lg, borderRadius: radii.xl, borderWidth: 1.5, borderColor: colors.borderSoft, backgroundColor: colors.surface },
    memberCardSelected: { borderColor: colors.success, backgroundColor: colors.successSoft },
    memberNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
    memberName: { fontFamily: fonts.sansSemibold, fontSize: 17, color: colors.ink },
    memberMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 3 },
    youBadge: { fontFamily: fonts.sansSemibold, fontSize: 10, color: colors.success, backgroundColor: colors.backgroundElevated, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, overflow: 'hidden' },
    selectionIndicator: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
    selectionIndicatorSelected: { borderColor: colors.success, backgroundColor: colors.success },
    entryCta: { minHeight: 56, marginTop: spacing.xxl, borderRadius: radii.auth, ...shadow.card },
    entryBack: { alignItems: 'center', paddingVertical: spacing.lg },
    entryBackText: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
    preparingScreen: { alignItems: 'center', justifyContent: 'center' },
    preparingContent: { alignItems: 'center', paddingBottom: spacing.huge },
    preparingIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl, ...shadow.card },
    preparingTitle: { fontFamily: fonts.serifItalic, fontSize: 28, lineHeight: 35, color: colors.ink, textAlign: 'center' },
    preparingStore: { fontFamily: fonts.sansSemibold, fontSize: 17, color: colors.primary, marginTop: spacing.sm },
    preparingBody: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, marginTop: spacing.lg },
    readOnlyCard: { padding: spacing.xl, borderColor: colors.primary + '35' },
    readOnlyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    readOnlyLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1, color: colors.primary },
    readOnlyTitle: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink, marginTop: 2 },
    readOnlyBody: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: spacing.lg },
    readOnlyStore: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.borderSoft },
    subtitle:    { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted, marginBottom: spacing.md, marginTop: spacing.sm },
    routeSummary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderSoft },
    routeSummaryIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    routeSummaryTitle: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    routeSummaryText: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    storeChoiceCard: { minHeight: 92, paddingVertical: spacing.lg, borderRadius: radii.xl, borderWidth: 1.5, borderColor: colors.borderSoft, backgroundColor: colors.surface },
    storeChoiceCardSelected: { borderColor: colors.success, backgroundColor: colors.successSoft },
    storeCard:   { paddingVertical: spacing.lg, marginBottom: spacing.md },
    recommendedStoreCard: { borderColor: colors.primary + '55', backgroundColor: colors.backgroundElevated },
    recommendedLabel: { fontFamily: fonts.monoMedium, fontSize: 9, color: colors.primary, letterSpacing: 0.9, marginBottom: 2 },
    storeRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    logo:        { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    logoAbbr:    { fontFamily: fonts.sansSemibold, fontSize: 15, color: '#fff' },
    storeName:   { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    storeItems:  { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 3, fontVariant: ['tabular-nums'] },
    startBtn:    { minWidth: 64, borderWidth: 1.5, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
    startBtnText:{ fontFamily: fonts.sansSemibold, fontSize: 14 },
    skipStoreBtn:{ alignItems: 'center', paddingTop: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
    skipStoreText:{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
    finishBtn:   { alignItems: 'center', paddingVertical: spacing.xl, marginTop: spacing.sm },
    finishBtnText:{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted },
    addStoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg, marginTop: spacing.sm, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: radii.lg },
    addStoreBtnText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.primary },
    noStoresText: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', marginBottom: spacing.xl },
    addStoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    addStoreRowName: { flex: 1, fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
  });

  const tsStyles = StyleSheet.create({
    scroll:       { padding: spacing.xl, gap: spacing.xl },
    header:       { alignItems: 'center', marginBottom: spacing.md },
    heroCard:     { alignItems: 'center', paddingVertical: spacing.xxl, borderColor: colors.primary + '24' },
    completeIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
    heroEyebrow:  { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.success, letterSpacing: 1.2, marginBottom: spacing.xs },
    eyebrow:      { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.muted, letterSpacing: 1, marginBottom: spacing.sm },
    total:        { fontFamily: fonts.mono, fontSize: 48, color: colors.primary, lineHeight: 60, fontVariant: ['tabular-nums'] },
    totalLabel:  { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted, marginTop: 4 },
    statsRow:    { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
    statBox:     { flex: 1, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', paddingVertical: spacing.lg, gap: 4 },
    statVal:     { fontSize: 22, color: colors.ink, fontVariant: ['tabular-nums'] },
    statLbl:     { fontFamily: fonts.sans, fontSize: 11, color: colors.muted, textAlign: 'center' },
    sectionTitle:{ fontFamily: fonts.serifItalic, fontSize: 20, color: colors.ink, marginBottom: spacing.md, marginTop: spacing.sm },
    storeCard:   { marginBottom: spacing.md },
    skippedCard: { opacity: 0.7 },
    storeRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    logo:        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    logoAbbr:    { fontFamily: fonts.sansSemibold, fontSize: 14, color: '#fff' },
    storeName:   { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    storeMeta:   { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 3, fontVariant: ['tabular-nums'] },
    itemsList:   { fontFamily: fonts.sans, fontSize: 11, color: colors.muted, marginTop: 3, fontStyle: 'italic' },
    storeSpent:  { fontFamily: fonts.monoMedium, fontSize: 16, fontVariant: ['tabular-nums'] },
    timeRow:     { alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.borderSoft },
    timeText:    { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, textAlign: 'center', fontVariant: ['tabular-nums'] },
    budgetCard:      { marginBottom: spacing.xl, gap: spacing.sm },
    budgetHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    budgetTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    budgetTitle:     { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, letterSpacing: 1.2, fontVariant: ['tabular-nums'] },
    budgetStatus:    { fontFamily: fonts.sansSemibold, fontSize: 13 },
    budgetOver:      { color: colors.danger },
    budgetUnder:     { color: colors.success },
    budgetAmounts:   { flexDirection: 'row', alignItems: 'baseline' },
    budgetSpent:     { fontFamily: fonts.mono, fontSize: 28, color: colors.ink, fontVariant: ['tabular-nums'] },
    budgetOf:        { fontFamily: fonts.mono, fontSize: 16, color: colors.muted, fontVariant: ['tabular-nums'] },
    barTrack:        { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
    barFill:         { height: 8, borderRadius: 4 },
    barUnder:        { backgroundColor: colors.success },
    barOver:         { backgroundColor: colors.danger },
    budgetNote:      { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, lineHeight: 17 },
  });

  return { styles, rStyles, ssStyles, nsStyles, tsStyles };
}
