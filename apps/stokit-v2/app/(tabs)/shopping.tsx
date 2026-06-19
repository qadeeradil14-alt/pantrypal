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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Animated } from 'react-native';
import { Screen } from '../../components/shared/Screen';
import { Button, Card, PageTitle, Pill, SectionHeader, StoreChip } from '../../components/shared/ui';
import { EmptyState } from '../../components/shared/EmptyState';
import { StorePickerSheet } from '../../components/pantry/StorePickerSheet';
import { AddItemSheet } from '../../components/pantry/AddItemSheet';
import { Sheet } from '../../components/shared/Sheet';
import { ItemAvatar } from '../../components/shared/ItemAvatar';
import { PricePromptSheet } from '../../components/shopping/PricePromptSheet';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useSessionStore } from '../../store/session-store';
import { currentStoreEntries, currentStoreId, pendingStoreIds } from '../../core/shopping-machine';
import { ROUTE_COLORS } from '../../core/services/storeBrands';
import { classifyItem, categoryLabel } from '../../core/services/itemClassifier';
import { cheapestRecentPrice, itemPriceHistory, lastPriceAtStore } from '../../core/services/priceHistory';
import { normalizeItemName } from '../../core/services/pantryItems';
import type { PantryItem, ShoppingEntry, Store } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { UNASSIGNED_STORE_ID, UNASSIGNED_STORE_NAME } from '../../constants/shopping';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubProps = {
  session: ReturnType<typeof useSessionStore.getState>['session'];
  dispatch: ReturnType<typeof useSessionStore.getState>['dispatch'];
  storeById: (id: string) => Store | undefined;
  colors: AppColors;
  styles?: any;
  rStyles?: any;
  ssStyles?: any;
  nsStyles?: any;
  tsStyles?: any;
};

// ── Root screen ───────────────────────────────────────────────────────────────

export default function ShoppingScreen() {
  const { colors } = useTheme();
  const { styles, rStyles, ssStyles, nsStyles, tsStyles } = useMemo(() => makeStyles(colors), [colors]);

  const items      = useDurableStore((s) => s.items);
  const stores     = useDurableStore((s) => s.stores);
  const priceHistory = useDurableStore((s) => s.priceHistory);
  const updateItem = useDurableStore((s) => s.updateItem);
  const session    = useSessionStore((s) => s.session);
  const dispatch   = useSessionStore((s) => s.dispatch);
  const router     = useRouter();
  const [showAssignAllPicker, setShowAssignAllPicker] = useState(false);
  const [showFirstStorePicker, setShowFirstStorePicker] = useState(false);
  const [reassignItem, setReassignItem] = useState<PantryItem | null>(null);

  const { action } = useLocalSearchParams<{ action?: string }>();
  const [quickScanStorePicker, setQuickScanStorePicker] = useState(false);
  // Holds the storeId we want to skip to receipt once START_TRIP settles
  const [pendingQuickScanStore, setPendingQuickScanStore] = useState<string | null>(null);

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
    setQuickScanStorePicker(false);
    const dummyEntry: ShoppingEntry = {
      itemId: '__quick_scan__',
      name: 'Quick Scan',
      quantity: 1,
      unit: 'unit',
      storeId: storeId,
      picked: false,
    };
    dispatch({ type: 'START_TRIP', entries: [dummyEntry], now: Date.now() });
    setPendingQuickScanStore(storeId);
  };

  const storeById = (id: string): Store | undefined => id === UNASSIGNED_STORE_ID
    ? { id, name: UNASSIGNED_STORE_NAME, logoEmoji: '🛒', logoColor: colors.primary, createdAt: 0, updatedAt: 0 }
    : stores.find((s) => s.id === id);

  const plan = useMemo(() => {
    const eligible = items.filter(
      (i) => (i.status === 'low' || i.status === 'expiring') && i.storeId,
    );
    const byStore = new Map<string, ShoppingEntry[]>();
    for (const it of eligible) {
      const list = byStore.get(it.storeId!) ?? [];
      list.push({ itemId: it.id, name: it.name, quantity: it.quantity, unit: it.unit, storeId: it.storeId!, picked: false });
      byStore.set(it.storeId!, list);
    }
    return byStore;
  }, [items]);

  const unassigned = useMemo(
    () => items.filter((i) => (i.status === 'low' || i.status === 'expiring') && !i.storeId),
    [items],
  );
  const unassignedCount = unassigned.length;
  const planItemsFull = useMemo(
    () => items.filter((i) => (i.status === 'low' || i.status === 'expiring') && !!i.storeId),
    [items],
  );

  const openDirections = (store: Store) => {
    const url = (() => {
      if (store.lat && store.lng) {
        return Platform.select({
          ios: `maps://maps.apple.com/maps?daddr=${store.lat},${store.lng}`,
          android: `geo:${store.lat},${store.lng}?q=${store.lat},${store.lng}(${encodeURIComponent(store.name)})`,
        }) ?? `https://maps.google.com/maps?daddr=${store.lat},${store.lng}`;
      }
      if (store.address) {
        return Platform.select({
          ios: `maps://maps.apple.com/maps?daddr=${encodeURIComponent(store.address)}`,
          android: `geo:0,0?q=${encodeURIComponent(store.address)}`,
        }) ?? `https://maps.google.com/maps?q=${encodeURIComponent(store.address)}`;
      }
      return null;
    })();
    if (url) void Linking.openURL(url);
  };

  const startTripAt = (firstStoreId: string) => {
    setShowFirstStorePicker(false);
    // Build entries in memory — never rely on post-updateItem Zustand timing.
    const shoppable = items.filter((i) => i.status === 'low' || i.status === 'expiring');
    // Persist store assignment for previously unassigned items.
    shoppable
      .filter((i) => !i.storeId)
      .forEach((i) => updateItem(i.id, { storeId: firstStoreId }));
    // Build a normalized list immediately (storeId ?? firstStoreId), don't wait for Zustand.
    const byStore = new Map<string, ShoppingEntry[]>();
    for (const item of shoppable) {
      const sid = item.storeId ?? firstStoreId;
      const list = byStore.get(sid) ?? [];
      list.push({ itemId: item.id, name: item.name, quantity: item.quantity, unit: item.unit, storeId: sid, picked: false });
      byStore.set(sid, list);
    }
    const entries: ShoppingEntry[] = [...(byStore.get(firstStoreId) ?? [])];
    byStore.forEach((list, sid) => {
      if (sid !== firstStoreId) entries.push(...list);
    });
    dispatch({ type: 'START_TRIP', entries, now: Date.now() });
  };

  const handleResetShopping = () => {
    const shoppingItems = items.filter((i) => i.status === 'low' || i.status === 'expiring');
    Alert.alert(
      'Reset shopping list?',
      `This will clear all ${shoppingItems.length} item${shoppingItems.length !== 1 ? 's' : ''} from your shopping queue. Your pantry and receipts stay untouched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => shoppingItems.forEach((i) => updateItem(i.id, { status: 'stocked', storeId: null })),
        },
      ],
    );
  };

  const handleStartShopping = () => {
    const total = (planItemsFull.length) + unassignedCount;
    if (total === 0) return;
    setShowFirstStorePicker(true);
  };

  // ── Active states ──────────────────────────────────────────────────────────
  if (session.status === 'shopping_store')  return <ShoppingActive  session={session} dispatch={dispatch} storeById={storeById} styles={styles} colors={colors} />;
  if (session.status === 'receipt_prompt')  return <ReceiptPrompt   session={session} dispatch={dispatch} storeById={storeById} rStyles={rStyles} colors={colors} />;
  if (session.status === 'store_summary' || session.status === 'continue_prompt') return <StoreSummary session={session} dispatch={dispatch} storeById={storeById} ssStyles={ssStyles} colors={colors} />;
  if (session.status === 'next_store_ready') return <NextStoreSelector session={session} dispatch={dispatch} storeById={storeById} styles={styles} nsStyles={nsStyles} colors={colors} />;
  if (session.status === 'trip_summary')    return <TripSummary     session={session} dispatch={dispatch} storeById={storeById} tsStyles={tsStyles} colors={colors} />;

  // ── Idle ───────────────────────────────────────────────────────────────────
  const planEntries = Array.from(plan.entries());
  const totalItems  = planEntries.reduce((n, [, list]) => n + list.length, 0);
  const singleStore = planEntries.length === 1 ? storeById(planEntries[0][0]) : undefined;
  const shoppableCount = totalItems + unassignedCount;
  // No assigned items → show all stores so user can pick where unassigned items go.
  // Otherwise → show only stores that already have items (unassigned join whichever is first).
  const firstStoreOptions: Array<[string, ShoppingEntry[]]> =
    planEntries.length === 0
      ? stores.map((s) => [s.id, plan.get(s.id) ?? []] as [string, ShoppingEntry[]])
      : planEntries;

  return (
    <Screen>
      <PageTitle eyebrow="Plan your trip" title="Shopping" />
      {shoppableCount === 0 ? (
        <>
          <PriceMemoryIntro count={priceHistory.length} styles={styles} colors={colors} />
          <EmptyState
            icon="cart-outline"
            title="No trip planned"
            body="Add something to buy and it will be ready for your next trip."
            steps={['Add items from Pantry', 'Assign a store only when useful', 'Start shopping anywhere']}
          />
        </>
      ) : (
        <>
          <PriceMemoryIntro count={priceHistory.length} styles={styles} colors={colors} />
          <Card style={styles.summaryCard}>
            {singleStore && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                <StoreChip
                  store={singleStore}
                  size={36}
                />
                <Text style={styles.firstDestLabel}>{singleStore.name}</Text>
              </View>
            )}
            <Text style={styles.summaryBig}>{shoppableCount}</Text>
            <Text style={styles.summarySub}>
              {planEntries.length > 1
                ? `${planEntries.length} stores${unassignedCount > 0 ? ` · ${unassignedCount} unassigned` : ''}`
                : planEntries.length === 1
                ? `${shoppableCount} item${shoppableCount !== 1 ? 's' : ''}${unassignedCount > 0 ? ` · ${unassignedCount} unassigned` : ''}`
                : `${unassignedCount} item${unassignedCount !== 1 ? 's' : ''} · pick a store to start`}
            </Text>
            <Button label="Start shopping" onPress={handleStartShopping} style={{ marginTop: spacing.lg }} />
          </Card>

          {/* Assigned items — tap any row to change its store */}
          {planEntries.map(([storeId, list]) => {
            const store = storeById(storeId);
            return (
              <View key={storeId}>
                <SectionHeader title={store?.name ?? 'Unknown Store'} action={`${list.length}`} />
                <Card style={{ paddingVertical: spacing.xs }}>
                  {list.map((e, idx) => (
                    <View key={e.itemId}>
                      {idx > 0 && <View style={styles.rowDivider} />}
                      <Pressable
                        onPress={() => {
                          const full = items.find((i) => i.id === e.itemId);
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
                </Card>
              </View>
            );
          })}

          {/* Unassigned items — tap a row to assign a store, or use Assign all */}
          {unassignedCount > 0 && (
            <>
              <SectionHeader
                title="No store yet"
                action={`${unassignedCount}`}
              />
              <Card style={{ paddingVertical: spacing.xs }}>
                <View style={styles.assignAllRow}>
                  <Text style={styles.assignAllHint}>Tap an item to assign a store, or assign them all at once.</Text>
                  <Pressable
                    onPress={() => setShowAssignAllPicker(true)}
                    style={({ pressed }) => [styles.assignAllBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.assignAllBtnText}>Assign all</Text>
                  </Pressable>
                </View>
                {unassigned.map((item, idx) => (
                  <View key={item.id}>
                    <View style={styles.rowDivider} />
                    <Pressable
                      onPress={() => setReassignItem(item)}
                      style={({ pressed }) => [styles.planRow, pressed && { opacity: 0.6 }]}
                    >
                      <ItemAvatar name={item.name} size={32} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.planName}>{item.name}</Text>
                        <Text style={styles.unassignedMeta}>Tap to assign a store</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.faintText} />
                    </Pressable>
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      )}

      {shoppableCount > 0 && (
        <Pressable onPress={handleResetShopping} style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>Reset shopping list</Text>
        </Pressable>
      )}

      <StorePickerSheet
        visible={quickScanStorePicker}
        onClose={() => setQuickScanStorePicker(false)}
        onSelect={(storeId) => handleQuickScanStoreSelect(storeId)}
      />

      {/* Tap any item row to change its store */}
      <StorePickerSheet
        item={reassignItem}
        title={reassignItem?.storeId ? 'Change store' : 'Assign store'}
        onClose={() => setReassignItem(null)}
      />

      {/* Assign all unassigned items to one store at once */}
      <StorePickerSheet
        visible={showAssignAllPicker}
        onClose={() => setShowAssignAllPicker(false)}
        title="Assign all to one store"
        subtitle={`All ${unassignedCount} unassigned item${unassignedCount !== 1 ? 's' : ''} will go to this store.`}
        onSelect={(storeId) => {
          unassigned.forEach((item) => updateItem(item.id, { storeId }));
          setShowAssignAllPicker(false);
        }}
      />

      {/* First-store picker — always ask "Where are you shopping first?" */}
      <Sheet visible={showFirstStorePicker} title="Where are you shopping first?" onClose={() => setShowFirstStorePicker(false)}>
        {planEntries.length > 1 && unassignedCount === 0 && (
          <View style={styles.routeStrip}>
            {planEntries.map(([, ], idx) => (
              <React.Fragment key={idx}>
                <View style={[styles.routeDot, idx === 0 && styles.routeDotActive]}>
                  <Text style={[styles.routeDotText, idx === 0 && styles.routeDotTextActive]}>{idx + 1}</Text>
                </View>
                {idx < planEntries.length - 1 && <View style={styles.routeLine} />}
              </React.Fragment>
            ))}
          </View>
        )}
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginBottom: spacing.lg }}>
          {planEntries.length === 0
            ? `All ${unassignedCount} item${unassignedCount !== 1 ? 's' : ''} will go to your first store. You can split them after.`
            : unassignedCount > 0
            ? `Pick your first stop. ${unassignedCount} unassigned item${unassignedCount !== 1 ? 's' : ''} will join it.`
            : "Pick your first stop — we'll line up the rest."}
        </Text>
        {firstStoreOptions.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted, textAlign: 'center' }}>
              Add a store first to begin shopping.
            </Text>
            <Button
              label="Add a store"
              onPress={() => { setShowFirstStorePicker(false); router.push('/stores'); }}
            />
          </View>
        ) : (
          firstStoreOptions.map(([storeId, list], idx) => {
            const store = storeById(storeId);
            const barColor = ROUTE_COLORS[idx % ROUTE_COLORS.length];
            const hasLocation = !!(store?.lat ?? store?.address);
            const assignedCount = planEntries.length === 0 ? 0 : list.length;
            // Whichever store the user taps receives all unassigned items.
            const extraCount = unassignedCount;
            const displayCount = assignedCount + extraCount;
            return (
              <Pressable
                key={storeId}
                onPress={() => startTripAt(storeId)}
                style={({ pressed }) => [styles.firstStoreRow, pressed && { opacity: 0.7 }]}
              >
                <StoreChip store={store} name={store?.name ?? 'Unknown Store'} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.firstStoreName}>{store?.name ?? 'Unknown Store'}</Text>
                  <Text style={styles.firstStoreMeta}>
                    {assignedCount} item{assignedCount !== 1 ? 's' : ''}
                    {extraCount > 0 ? ` + ${extraCount} unassigned` : ''}
                  </Text>
                </View>
                {hasLocation && (
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); openDirections(store!); }}
                    hitSlop={8}
                    style={styles.directionsBtn}
                  >
                    <Ionicons name="navigate-outline" size={18} color={colors.muted} />
                  </Pressable>
                )}
                <View style={[styles.firstStoreGoBtn, { borderColor: barColor }]}>
                  <Text style={[styles.firstStoreGoBtnText, { color: barColor }]}>Go here first</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </Sheet>
    </Screen>
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
          <Ionicons name="pricetag-outline" size={19} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.priceMemoryTitle}>Price memory</Text>
          <Text style={styles.priceMemoryBody}>
            {count > 0
              ? `${count} price${count === 1 ? '' : 's'} remembered. Stokit will show cheaper stores while you shop.`
              : 'During a shopping trip, tap Add price beside an item. Stokit will remember and compare stores next time.'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

// ── 1. Shopping at current store ──────────────────────────────────────────────

function ShoppingActive({ session, dispatch, storeById, styles, colors }: SubProps) {
  const storeId = currentStoreId(session)!;
  const entries = currentStoreEntries(session);
  const picked  = entries.filter((e) => e.picked).length;
  const stepNo  = session.currentIndex + 1;
  const total   = session.storeQueue.length;
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [priceEntry, setPriceEntry] = useState<ShoppingEntry | null>(null);
  const [quantityStepperId, setQuantityStepperId] = useState<string | null>(null);
  const priceHistory = useDurableStore((s) => s.priceHistory);
  const recordPrice = useDurableStore((s) => s.recordPrice);

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

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, typeof entries>();
    for (const e of entries) {
      const cat = categoryLabel(classifyItem(e.name).category);
      const list = groups.get(cat) ?? [];
      list.push(e);
      groups.set(cat, list);
    }
    return Array.from(groups.entries()).map(([title, data]) => ({ title, data })).sort((a, b) => a.title.localeCompare(b.title));
  }, [entries]);

  return (
    <Screen>
      <PageTitle eyebrow={total > 1 ? `Stop ${stepNo} of ${total}` : undefined} title="Shopping" />
      <Card>
        <StoreHeader store={storeById(storeId)} eyebrow="Now shopping" styles={styles} />
        <View style={styles.progressWrap}>
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
          <Text style={styles.progressText}>{picked}/{entries.length} picked</Text>
        </View>
      </Card>

      {groupedEntries.map((group) => (
        <View key={group.title}>
          <SectionHeader title={group.title} />
          <Card style={{ paddingVertical: spacing.xs, marginBottom: spacing.md }}>
            {group.data.map((e, idx) => (
              <View key={e.itemId}>
                {idx > 0 && <View style={styles.rowDivider} />}
                <Pressable
                  style={[styles.pickRow, e.outOfStock && { opacity: 0.5 }]}
                  onPress={() => {
                    if (e.outOfStock) return;
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    dispatch({ type: 'TOGGLE_PICK', itemId: e.itemId });
                  }}
                  onLongPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Alert.alert(
                      e.name,
                      e.outOfStock ? 'Mark as available again?' : 'Mark as out of stock?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: e.outOfStock ? 'Available' : 'Out of stock',
                          onPress: () => dispatch({ type: 'MARK_OUT_OF_STOCK', itemId: e.itemId }),
                        },
                      ],
                    );
                  }}
                >
                  <Ionicons
                    name={e.outOfStock ? 'close-circle-outline' : e.picked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={26}
                    color={e.outOfStock ? colors.danger : e.picked ? colors.success : colors.faintText}
                  />
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
                          {e.itemId !== '__quick_scan__' && (
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
                  {e.itemId !== '__quick_scan__' ? (
                    quantityStepperId === e.itemId ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Pressable
                          onPress={(ev) => { ev.stopPropagation(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); dispatch({ type: 'UPDATE_QUANTITY', itemId: e.itemId, quantity: e.quantity - 1 }); if (e.quantity <= 1) setQuantityStepperId(null); }}
                          style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ fontSize: 16, color: colors.ink, lineHeight: 20 }}>−</Text>
                        </Pressable>
                        <Pressable onPress={(ev) => { ev.stopPropagation(); setQuantityStepperId(null); }}>
                          <Text style={[styles.planMeta, { minWidth: 28, textAlign: 'center' }]}>×{e.quantity}</Text>
                        </Pressable>
                        <Pressable
                          onPress={(ev) => { ev.stopPropagation(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); dispatch({ type: 'UPDATE_QUANTITY', itemId: e.itemId, quantity: e.quantity + 1 }); }}
                          style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ fontSize: 16, color: colors.ink, lineHeight: 20 }}>+</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={(ev) => { ev.stopPropagation(); setQuantityStepperId(e.itemId); }} hitSlop={10}>
                        <Text style={styles.planMeta}>×{e.quantity}</Text>
                      </Pressable>
                    )
                  ) : (
                    <Text style={styles.planMeta}>×{e.quantity}</Text>
                  )}
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      ))}
      
      {groupedEntries.length === 0 && (
         <Card style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: spacing.md }}>
               No items planned for this store.
            </Text>
            <Button label="+ Add more" variant="ghost" onPress={() => setAddSheetVisible(true)} />
         </Card>
      )}

      {groupedEntries.length > 0 && (
          <Button label="+ Add more" variant="subtle" onPress={() => setAddSheetVisible(true)} style={{ marginTop: spacing.md }} />
      )}

      <Button
        label="Done at this store"
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
                    dispatch({ type: 'FINISH_STORE', now: Date.now() });
                  },
                },
              ],
            );
            return;
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          dispatch({ type: 'FINISH_STORE', now: Date.now() });
        }}
        style={{ marginTop: spacing.xl }}
      />
      
      <CancelTripLink dispatch={dispatch} colors={colors} />
      <AddItemSheet
        visible={addSheetVisible}
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
                entry: { itemId: i.id, name: i.name, quantity: i.quantity, unit: i.unit, storeId: storeId, picked: false }
              });
           });
        }}
      />
      <PricePromptSheet
        entry={priceEntry}
        store={storeById(storeId)}
        lastPrice={priceEntry ? priceIndex.get(normalizeItemName(priceEntry.name))?.lastHere?.price : undefined}
        onClose={() => setPriceEntry(null)}
        onSave={(price) => {
          if (priceEntry) {
            recordPrice({
              itemId: priceEntry.itemId,
              itemName: priceEntry.name,
              storeId,
              price,
            });
          }
          setPriceEntry(null);
        }}
      />
    </Screen>
  );
}

// ── 2. Receipt input (V1 spend-sheet style) ───────────────────────────────────

function ReceiptPrompt({ session, dispatch, storeById, rStyles, colors }: SubProps) {
  const storeId   = currentStoreId(session)!;
  const store     = storeById(storeId);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = Math.round((parseFloat(amount.replace(/[^0-9.]/g, '')) || 0) * 100) / 100;

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any>(null);
  const addItem = useDurableStore((s) => s.addItem);
  const recordPrice = useDurableStore((s) => s.recordPrice);

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
    const { persistReceiptImage } = await import('../../core/services/receiptImages');
    const durableImageUri = await persistReceiptImage(asset.uri);
    setImageUri(durableImageUri);

    if (!asset.base64) {
      Alert.alert('Scan failed', 'Could not read image data. Please try again.');
      return;
    }

    const { extractReceiptItems } = await import('../../core/services/aiReceipts');
    const { hasOpenAiKey } = await import('../../lib/config');

    if (!hasOpenAiKey()) {
      Alert.alert(
        'Receipt Scan Unavailable',
        'AI receipt scanning is not configured for this build. You can still enter the total manually.',
        [{ text: 'Got it' }]
      );
      return;
    }

    // Determine MIME type from the asset
    const mimeType = asset.mimeType ?? (asset.uri.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg');

    setSaving(true);
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
          <View>
            <Text style={rStyles.storeName} numberOfLines={1}>{store?.name ?? 'Store'}</Text>
            <Text style={rStyles.stopLabel}>Stop complete</Text>
          </View>
          <Pressable onPress={skip} style={rStyles.checkBadge}>
            <Ionicons name="checkmark" size={20} color={colors.primary} />
          </Pressable>
        </View>

        {/* Scrollable body — amount input + buttons stay reachable when keyboard is up */}
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
              keyboardAppearance="dark"
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

          <Pressable
            onPress={save}
            disabled={parsed <= 0 || saving}
            style={({ pressed }) => [rStyles.saveBtn, (parsed <= 0 || saving) && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}
          >
            <Text style={rStyles.saveBtnText}>
              {saving ? (imageUri && parsed === 0 ? 'Reading receipt…' : 'Saving…') : parsed > 0 ? `Save  ·  $${parsed.toFixed(2)}` : 'Save amount'}
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
      </Screen>

      <Sheet visible={!!scanResult} title="Receipt Scanned!" onClose={() => setScanResult(null)}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: colors.ink, marginBottom: spacing.md }}>
          Found {scanResult?.items?.length} items. Add them to your pantry?
        </Text>
        <ScrollView style={{ maxHeight: 300, marginBottom: spacing.lg }}>
          {scanResult?.items?.map((item: any, i: number) => {
            const cat = item.item_category ?? 'food';
            const iconName =
              cat === 'household'    ? 'home-outline' :
              cat === 'personal_care'? 'person-outline' :
              cat === 'non_grocery'  ? 'bag-outline' :
                                       'nutrition-outline';
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, padding: spacing.sm, backgroundColor: colors.surfaceRaised, borderRadius: radii.md }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={iconName as any} size={20} color={colors.primary} />
                </View>
                <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink }}>{item.name}</Text>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.muted }}>
                    ×{item.quantity}{item.price ? ` · $${item.price.toFixed(2)}` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={() => setScanResult(null)}
            style={{ flex: 1, paddingVertical: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: colors.muted }}>Skip</Text>
          </Pressable>
          <View style={{ flex: 2 }}>
            <Button
              label={`Add ${scanResult?.items?.length} to Pantry`}
              onPress={() => {
                scanResult?.items?.forEach((item: any) => {
                  const pantryItem = addItem({ name: item.name, quantity: item.quantity, unit: item.unit || 'unit', storeId: storeId, status: 'stocked' });
                  if (item.price > 0) {
                    recordPrice({
                      itemId: pantryItem.id,
                      itemName: pantryItem.name,
                      storeId,
                      price: item.price,
                    });
                  }
                });
                setScanResult(null);
              }}
            />
          </View>
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

// ── 3. Per-store summary ──────────────────────────────────────────────────────

function StoreSummary({ session, dispatch, storeById, ssStyles, colors }: SubProps) {
  const router = useRouter();
  const stores = useDurableStore((s) => s.stores);
  const storeId = currentStoreId(session)!;
  const store   = storeById(storeId);
  const receipt = session.receipts.find((r) => r.storeId === storeId);
  const entries = currentStoreEntries(session);
  const bought  = entries.filter((e) => e.picked).length;
  const left    = entries.filter((e) => !e.picked).length;
  const pending = pendingStoreIds(session);
  const manualStores = stores.filter((candidate) => !session.storeQueue.includes(candidate.id));
  const hasOptions = pending.length > 0 || manualStores.length > 0;
  const spent   = receipt && receipt.status !== 'skipped' ? receipt.amount : 0;
  const completedAt = receipt?.createdAt ?? Date.now();

  return (
    <Screen>
      <PageTitle eyebrow="Stop complete" title={store?.name ?? 'Store'} />

      {/* Summary card */}
      <Card style={ssStyles.card}>
        <View style={ssStyles.row}>
          <View style={ssStyles.statBox}>
            <Text style={ssStyles.statVal}>${spent.toFixed(2)}</Text>
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
        <View style={ssStyles.nextHint}>
          <Ionicons name="navigate-outline" size={16} color={colors.primary} />
          <Text style={ssStyles.nextHintText}>
            {pending.length} more stop{pending.length > 1 ? 's' : ''} on your route
          </Text>
        </View>
      ) : (
        <View style={ssStyles.nextHint}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
          <Text style={[ssStyles.nextHintText, { color: colors.success }]}>All stops complete!</Text>
        </View>
      )}

      {pending.length > 0 ? (
        <Button
          label="Continue to next store →"
          onPress={() => dispatch({ type: 'CONTINUE_TRIP' })}
          style={{ marginTop: spacing.xl }}
        />
      ) : null}

      {pending.length === 0 && manualStores.length > 0 ? (
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <Text style={ssStyles.nextHintText}>Shopping somewhere else?</Text>
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
        </View>
      ) : null}

      <Button
        label="Finish trip"
        variant={hasOptions ? 'ghost' : 'primary'}
        onPress={() => dispatch({ type: 'FINISH_TRIP', now: Date.now() })}
        style={{ marginTop: spacing.md }}
      />
      {!hasOptions ? (
        <Button
          label="Add a store for next time"
          variant="subtle"
          onPress={() => router.push('/(tabs)/stores')}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
      <CancelTripLink dispatch={dispatch} colors={colors} />
    </Screen>
  );
}

// ── 4. Continue or finish decision ────────────────────────────────────────────

function ContinuePrompt({ session, dispatch, storeById, styles, colors }: SubProps) {
  const router = useRouter();
  const stores = useDurableStore((s) => s.stores);
  const storeId = currentStoreId(session)!;
  const store = storeById(storeId);
  const pending = pendingStoreIds(session);
  // Stores the user has saved but didn't plan for this trip.
  const manualStores = stores.filter((s) => !session.storeQueue.includes(s.id));
  const hasOptions = pending.length > 0 || manualStores.length > 0;

  return (
    <Screen>
      <PageTitle
        eyebrow="Store visit complete"
        title={hasOptions ? 'Shopping somewhere else?' : 'All done here?'}
      />

      {/* ── Primary action card ── */}
      <Card style={styles.summaryCard}>
        <Text style={styles.continueTitle}>
          You finished {store?.name ?? 'this store'}.
        </Text>

        {/* Case A: planned stops remain — one-tap advance */}
        {pending.length > 0 && (
          <Button
            label="Continue to next store →"
            onPress={() => dispatch({ type: 'CONTINUE_TRIP' })}
            style={{ marginTop: spacing.lg }}
          />
        )}

        {/* Case C: no planned stops, no saved stores — nothing to choose */}
        {pending.length === 0 && manualStores.length === 0 && (
          <Text style={styles.continueBody}>
            Your route is complete. Finish the trip to save your receipts and update your pantry.
          </Text>
        )}
        
        {/* Case B Header: Show inline instruction */}
        {pending.length === 0 && manualStores.length > 0 && (
          <Text style={styles.continueBody}>
            Your planned route is done. Pick another store below to keep going, or finish your trip.
          </Text>
        )}

        {/* Finish trip — primary when no options, secondary otherwise */}
        <Button
          label="Finish trip"
          variant={hasOptions ? 'ghost' : 'primary'}
          onPress={() => dispatch({ type: 'FINISH_TRIP', now: Date.now() })}
          style={{ marginTop: hasOptions ? spacing.md : spacing.lg }}
        />

        {/* Case C only: nudge to add a store for future trips */}
        {pending.length === 0 && manualStores.length === 0 && (
          <Button
            label="Add a store for next time"
            variant="subtle"
            onPress={() => router.push('/(tabs)/stores')}
            style={{ marginTop: spacing.sm }}
          />
        )}
      </Card>
      
      {/* ── Control Center Grid (Case B) ── */}
      {pending.length === 0 && manualStores.length > 0 && (
        <View style={{ marginTop: spacing.xl, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' }}>
          {manualStores.map((candidate) => (
            <Pressable
              key={candidate.id}
              onPress={() => dispatch({ type: 'START_MANUAL_STORE', storeId: candidate.id })}
              style={({ pressed }) => [
                { 
                  width: '48%', 
                  height: 100, 
                  backgroundColor: colors.surfaceRaised, 
                  borderRadius: radii.lg, 
                  padding: spacing.md, 
                  borderWidth: 1, 
                  borderColor: colors.border,
                  flexDirection: 'row',
                  alignItems: 'center', 
                  gap: spacing.sm,
                },
                pressed && { opacity: 0.7 }
              ]}
            >
              <StoreChip
                store={candidate}
                size={40}
              />
              <View style={{ flex: 1 }}>
                <Text 
                  style={{ 
                    fontFamily: fonts.sansSemibold, 
                    fontSize: 14, 
                    color: colors.ink, 
                  }} 
                  numberOfLines={2}
                >
                  {candidate.name}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

// ── 5. Next store selector ────────────────────────────────────────────────────

function NextStoreSelector({ session, dispatch, storeById, styles, nsStyles, colors }: SubProps) {
  const pending = pendingStoreIds(session);
  const allStores = useDurableStore((s) => s.stores);
  const [skipping, setSkipping] = useState<string | null>(null);
  const [showAddStore, setShowAddStore] = useState(false);

  // Saved stores the user hasn't planned into this trip yet
  const unplannedStores = allStores.filter((s) => !session.storeQueue.includes(s.id));

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
          <Text style={nsStyles.subtitle}>Choose your next stop:</Text>

          {pending.map((storeId, idx) => {
            const store    = storeById(storeId);
            const itemCount = session.entries.filter((e) => e.storeId === storeId).length;
            const barColor = ROUTE_COLORS[idx % ROUTE_COLORS.length];

            return (
              <Card key={storeId} style={nsStyles.storeCard}>
                <View style={nsStyles.storeRow}>
                  <StoreChip store={store} name={store?.name ?? '?'} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={nsStyles.storeName}>{store?.name ?? 'Unknown Store'}</Text>
                    <Text style={nsStyles.storeItems}>{itemCount} item{itemCount !== 1 ? 's' : ''} waiting</Text>
                  </View>
                  <Pressable
                    onPress={() => dispatch({ type: 'CHOOSE_NEXT_STORE', storeId })}
                    style={({ pressed }) => [nsStyles.startBtn, { borderColor: barColor }, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={[nsStyles.startBtnText, { color: barColor }]}>Start</Text>
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
                        onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); dispatch({ type: 'UNSKIP_STORE', storeId }); }}
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
          <Pressable onPress={() => setShowAddStore(true)} style={nsStyles.addStoreBtn}>
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
      <Sheet visible={showAddStore} title="Add another stop" onClose={() => setShowAddStore(false)}>
        {unplannedStores.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: spacing.xl }}>
            All your saved stores are already on this trip.
          </Text>
        ) : (
          <>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginBottom: spacing.lg }}>
              Pick a store to add to your current trip. You can add items once you're there.
            </Text>
            {unplannedStores.map((store) => (
              <Pressable
                key={store.id}
                onPress={() => {
                  dispatch({ type: 'START_MANUAL_STORE', storeId: store.id });
                  setShowAddStore(false);
                }}
                style={({ pressed }) => [nsStyles.addStoreRow, pressed && { opacity: 0.7 }]}
              >
                <StoreChip store={store} size={44} />
                <Text style={nsStyles.addStoreRowName}>{store.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </>
        )}
      </Sheet>
      <CancelTripLink dispatch={dispatch} colors={colors} />
    </Screen>
  );
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

  const RESUME_WINDOW_MS = 30 * 60 * 1000;
  const [secsLeft, setSecsLeft] = React.useState(() =>
    Math.max(0, Math.floor((trip.completedAt + RESUME_WINDOW_MS - Date.now()) / 1000))
  );
  useEffect(() => {
    if (secsLeft <= 0) return;
    const id = setInterval(() => setSecsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secsLeft > 0]);
  const canResume = secsLeft > 0;
  const resumeLabel = canResume
    ? `Forgot something? Go back (${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, '0')})`
    : null;

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
        <Text style={tsStyles.eyebrow}>TRIP COMPLETE</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginLeft: 'auto' }}>
          {canResume && (
            <Pressable
              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); dispatch({ type: 'RESUME_TRIP' }); }}
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 }}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted }}>
                ↩ Forgot something? ({Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, '0')})
              </Text>
            </Pressable>
          )}
          <Pressable onPress={() => dispatch({ type: 'END_TRIP' })} style={{ backgroundColor: colors.surfaceRaised, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.primary }}>Done</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={tsStyles.scroll}>
        {/* Header */}
        <View style={tsStyles.header}>
          <Text style={tsStyles.total}>${trip.totalSpent.toFixed(2)}</Text>
          <Text style={tsStyles.totalLabel}>total spent this trip</Text>
        </View>

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
                const boughtHere = session.entries.filter((e) => e.storeId === b.storeId && e.picked && e.itemId !== '__quick_scan__');
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
    summaryCard:  { alignItems: 'center', paddingVertical: spacing.xl },
    priceMemoryCard: { marginBottom: spacing.lg, borderColor: colors.primary + '55' },
    priceMemoryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    priceMemoryIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    priceMemoryTitle: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    priceMemoryBody: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 2 },
    summaryBig:   { fontFamily: fonts.mono, fontSize: 48, color: colors.primary },
    summarySub:   { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, marginTop: 2 },
    firstDestLabel: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    rowDivider:   { height: 1, backgroundColor: colors.borderSoft, marginLeft: spacing.lg },
    planRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.md, justifyContent: 'space-between', paddingVertical: spacing.md },
    planName:     { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
    planMeta:     { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
    unassignedMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    assignAllRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
    assignAllHint: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.muted, lineHeight: 18 },
    assignAllBtn: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radii.sm, backgroundColor: colors.primary },
    assignAllBtnText: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.onPrimary },
    warnText:     { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, lineHeight: 19 },
    routeNotReady:{ borderColor: colors.primary, borderWidth: 1, gap: spacing.sm },
    routeNotReadyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    routeNotReadyTitle: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    activeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    activeStep:   { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
    activeStore:  { fontFamily: fonts.serifItalic, fontSize: 24, color: colors.ink, marginTop: 2 },
    progressWrap: { marginTop: spacing.xl },
    progressTrack:{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised },
    progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
    progressText: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
    pickRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
    pickName:     { flex: 1, fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
    pickNameDone: { color: colors.muted, textDecorationLine: 'line-through' },
    priceHint:    { fontFamily: fonts.sans, fontSize: 11, color: colors.primary, marginTop: 3 },
    addPriceButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8 },
    addPriceText: { fontFamily: fonts.sansSemibold, fontSize: 11, color: colors.primary },
    emptyNote:    { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
    continueTitle:{ fontFamily: fonts.serifItalic, fontSize: 22, color: colors.ink, textAlign: 'center' },
    continueBody: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: spacing.md },
    continueNote: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 19, color: colors.success, textAlign: 'center', marginTop: spacing.xl },
    manualHint:   { fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
    manualStoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    manualStoreName: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    manualStoreMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    firstStoreRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    firstStoreName: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    firstStoreMeta: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 2 },
    firstStoreGoBtn:{ borderWidth: 1.5, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 6 },
    firstStoreGoBtnText: { fontFamily: fonts.sansSemibold, fontSize: 13 },
    routeStrip:     { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    routeDot:       { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
    routeDotActive: { backgroundColor: colors.ink, borderColor: colors.ink },
    routeDotText:   { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.muted },
    routeDotTextActive: { color: colors.surface },
    routeLine:      { flex: 1, height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: colors.borderSoft },
    directionsBtn:  { padding: 4 },
  });

  const rStyles = StyleSheet.create({
    header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.xl, paddingHorizontal: spacing.sm },
    storeName: { fontFamily: fonts.serifItalic, fontSize: 28, color: colors.ink, maxWidth: 260 },
    stopLabel: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.primary, marginTop: 4 },
    checkBadge:{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    amountRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, marginHorizontal: spacing.sm, paddingBottom: spacing.md, marginBottom: spacing.md },
    currency:  { fontFamily: fonts.mono, fontSize: 36, color: colors.primary, marginRight: spacing.sm },
    amountInput:{ flex: 1, fontFamily: fonts.mono, fontSize: 48, color: colors.ink, padding: 0 },
    hint:      { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginHorizontal: spacing.sm, marginBottom: spacing.xl, lineHeight: 19 },
    saveBtn:   { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 16, alignItems: 'center', marginHorizontal: spacing.sm },
    saveBtnText:{ fontFamily: fonts.sansSemibold, fontSize: 17, color: colors.onPrimary },
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
    removeBtn: {
      padding: spacing.xs,
    },
  });

  const ssStyles = StyleSheet.create({
    card:     { paddingVertical: spacing.xl },
    row:      { flexDirection: 'row', alignItems: 'center' },
    statBox:  { flex: 1, alignItems: 'center', gap: 4 },
    statVal:  { fontFamily: fonts.mono, fontSize: 26, color: colors.ink },
    statLbl:  { fontFamily: fonts.sans, fontSize: 11, color: colors.muted },
    divider:  { width: 1, height: 40, backgroundColor: colors.border },
    timeRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.borderSoft },
    timeText: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
    nextHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.sm },
    nextHintText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.primary },
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
    subtitle:    { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted, marginBottom: spacing.md, marginTop: spacing.sm },
    storeCard:   { paddingVertical: spacing.lg },
    storeRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    logo:        { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    logoAbbr:    { fontFamily: fonts.sansSemibold, fontSize: 15, color: '#fff' },
    storeName:   { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    storeItems:  { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 3 },
    startBtn:    { borderWidth: 1.5, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 7 },
    startBtnText:{ fontFamily: fonts.sansSemibold, fontSize: 14 },
    skipStoreBtn:{ alignItems: 'center', paddingTop: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
    skipStoreText:{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
    finishBtn:   { alignItems: 'center', paddingVertical: spacing.xl, marginTop: spacing.sm },
    finishBtnText:{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted },
    addStoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg, marginTop: spacing.sm, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: radii.lg },
    addStoreBtnText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.primary },
    addStoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    addStoreRowName: { flex: 1, fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
  });

  const tsStyles = StyleSheet.create({
    scroll:       { padding: spacing.xl, gap: spacing.xl },
    header:       { alignItems: 'center', marginBottom: spacing.md },
    eyebrow:      { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.muted, letterSpacing: 1, marginBottom: spacing.sm },
    total:        { fontFamily: fonts.mono, fontSize: 48, color: colors.primary, lineHeight: 60 },
    totalLabel:  { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted, marginTop: 4 },
    statsRow:    { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
    statBox:     { flex: 1, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', paddingVertical: spacing.lg, gap: 4 },
    statVal:     { fontSize: 22, color: colors.ink },
    statLbl:     { fontFamily: fonts.sans, fontSize: 11, color: colors.muted, textAlign: 'center' },
    sectionTitle:{ fontFamily: fonts.serifItalic, fontSize: 20, color: colors.ink, marginBottom: spacing.md, marginTop: spacing.sm },
    storeCard:   { marginBottom: spacing.md },
    skippedCard: { opacity: 0.7 },
    storeRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    logo:        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    logoAbbr:    { fontFamily: fonts.sansSemibold, fontSize: 14, color: '#fff' },
    storeName:   { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    storeMeta:   { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 3 },
    itemsList:   { fontFamily: fonts.sans, fontSize: 11, color: colors.muted, marginTop: 3, fontStyle: 'italic' },
    storeSpent:  { fontFamily: fonts.monoMedium, fontSize: 16 },
    timeRow:     { alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.borderSoft },
    timeText:    { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, textAlign: 'center' },
    budgetCard:      { marginBottom: spacing.xl, gap: spacing.sm },
    budgetHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    budgetTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    budgetTitle:     { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, letterSpacing: 1.2 },
    budgetStatus:    { fontFamily: fonts.sansSemibold, fontSize: 13 },
    budgetOver:      { color: colors.danger },
    budgetUnder:     { color: colors.success },
    budgetAmounts:   { flexDirection: 'row', alignItems: 'baseline' },
    budgetSpent:     { fontFamily: fonts.mono, fontSize: 28, color: colors.ink },
    budgetOf:        { fontFamily: fonts.mono, fontSize: 16, color: colors.muted },
    barTrack:        { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
    barFill:         { height: 8, borderRadius: 4 },
    barUnder:        { backgroundColor: colors.success },
    barOver:         { backgroundColor: colors.danger },
    budgetNote:      { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, lineHeight: 17 },
  });

  return { styles, rStyles, ssStyles, nsStyles, tsStyles };
}
