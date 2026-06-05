import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, SectionList, StyleSheet,
  ActivityIndicator, ScrollView, Alert, Animated, Linking, Platform, Modal,
  TouchableOpacity, TouchableWithoutFeedback, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { addManualReceipt, getSpendSummary, uploadReceipt } from '../../../lib/receipts';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useItemsStore } from '../../../store/items';
import { useAuthStore } from '../../../store/auth';
import { useHouseholdStore } from '../../../store/household';
import { useStoresStore } from '../../../store/stores';
import { useShoppingStore, type ShoppingEntry } from '../../../store/shopping';
import { markItemGotItWithQueue } from '../../../lib/items';
import { setItemStoreWithQueue, normalizeStoreName } from '../../../lib/stores';
import { completeShoppingEntryWithQueue, setShoppingEntryAisleWithQueue } from '../../../lib/shoppingList';
import { hapticError, hapticSelection, hapticSuccess } from '../../../lib/haptics';
import type { Item } from '../../../lib/items';
import { CATEGORY_LABELS, type ItemCategory } from '../../../constants/defaultItems';
import { localToday } from '../../../lib/dates';
import ItemThumbnail from '../../../components/ItemThumbnail';
import { resolveStoreSection } from '../../../constants/storeSections';
import { groceryItemTestId } from '../../../lib/testIds';
import { radii, shadow, fonts } from '../../../constants/theme';
import type { AppColors } from '../../../constants/theme';
import { useTheme } from '../../../hooks/useTheme';
import ScalePressable from '../../../components/ScalePressable';
import EmptyState from '../../../components/EmptyState';
import StoreLogo from '../../../components/StoreLogo';
import LiftAssignPanel from '../../../components/LiftAssignPanel';
import { useSettingsStore } from '../../../store/settings';
import {
  activeCountForStore,
  countActiveShoppingByStore,
  formatStoreChipLabel,
} from '../../../lib/shoppingActiveByStore';

function normalizeShoppingCategory(category: ShoppingEntry['category']): ItemCategory {
  return category === 'spice_rack' ? 'pantry' : category;
}

function ordinalStop(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]} stop`;
}


type ShoppingSection = { title: string; storeId: string | null; data: ShoppingEntry[]; stopNumber?: number };
type StoreSpendSheet = { storeId: string; storeName: string; stopNumber: number; nextStoreName: string | null };
type TripSheet = { itemCount: number; tripSpend: number; weeklySpend: number; receiptCount: number };

export default function GroceryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { items, updateItem } = useItemsStore();
  const { session } = useAuthStore();
  const householdId = useHouseholdStore((s) => s.household?.id);
  const {
    stores,
    activeStoreId,
    pendingReceiptStoreId,
    receiptCompletedStoreIds,
    setActiveStore,
    setPendingReceiptStoreId,
    markReceiptCompleted,
    clearReceiptTrip,
    ambiguousArrivals,
    setAmbiguousArrivals,
  } = useStoresStore();
  const { entries, removeEntry, upsertEntry } = useShoppingStore();
  const [shoppingMode, setShoppingMode] = useState(false);
  /**
   * Store-first "Where are you shopping?" selector, shown when the user taps
   * Start. Prevents blindly entering shopping mode on a stale/mixed store.
   */
  const [startSheet, setStartSheet] = useState(false);
  const [tapping, setTapping] = useState<string | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(() => new Set());
  /** Per-entry grab quantity (Sam's Club stepper). Defaults to 1. Local-only — not persisted. */
  const [itemQty, setItemQty] = useState<Map<string, number>>(() => new Map());
  /** Qty at the moment of grab — kept for the 520 ms purchased-visual window. */
  const [purchasedQty, setPurchasedQty] = useState<Map<string, number>>(() => new Map());
  /** Items grabbed per store this session — used to guard the done/spend sheet. */
  const [storeGrabbedCount, setStoreGrabbedCount] = useState<Map<string, number>>(() => new Map());
  /**
   * "Are you done at [Store]?" confirmation sheet that gates the spend/receipt sheet.
   * Only shows after all items at a store are grabbed and the user has grabbed ≥ 1 item there.
   */
  const [doneConfirmSheet, setDoneConfirmSheet] = useState<{ storeId: string; storeName: string } | null>(null);
  const weeklyBudget = useSettingsStore((s) => s.weeklyBudget);
  const [weeklySpend, setWeeklySpend] = useState(0);
  const [tripSpend, setTripSpend] = useState(0);
  const [tripReceiptCount, setTripReceiptCount] = useState(0);
  const [startCount, setStartCount] = useState(0);
  const [grabbedCount, setGrabbedCount] = useState(0);
  const [tripSheet, setTripSheet] = useState<TripSheet | null>(null);
  const [routeStoreIds, setRouteStoreIds] = useState<string[]>([]);
  const [completedStoreIds, setCompletedStoreIds] = useState<Set<string>>(() => new Set());
  const [storeSpendSheet, setStoreSpendSheet] = useState<StoreSpendSheet | null>(null);
  const [storeSpendAmount, setStoreSpendAmount] = useState('');
  const [savingStoreSpend, setSavingStoreSpend] = useState(false);
  const [assignItem, setAssignItem] = useState<Item | null>(null);
  /** Chip filter only — may point at a store with 0 items without starting a shopping session. */
  const [selectedStoreChipId, setSelectedStoreChipId] = useState<string | null>(null);

  // Pulse animation for the Start button — draws attention before shopping begins
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (shoppingMode) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.delay(1000),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shoppingMode, pulseAnim]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const getQty = useCallback((id: string) => itemQty.get(id) ?? 1, [itemQty]);
  const adjustQty = useCallback((id: string, delta: number) => {
    setItemQty((prev) => {
      const next = new Map(prev);
      next.set(id, Math.max(1, Math.min(99, (prev.get(id) ?? 1) + delta)));
      return next;
    });
  }, []);

  useEffect(() => {
    const tag = 'shopping-mode';
    if (shoppingMode) activateKeepAwakeAsync(tag);
    else deactivateKeepAwake(tag);
    return () => { deactivateKeepAwake(tag); };
  }, [shoppingMode]);

  const refreshSpend = useCallback(() => {
    if (!householdId) return;
    getSpendSummary(householdId)
      .then((s) => setWeeklySpend(s.weeklyTotal))
      .catch(() => {});
  }, [householdId]);

  // Load on mount
  useEffect(refreshSpend, [refreshSpend]);

  // Refresh every time the Grocery tab comes back into focus (e.g. after adding a receipt)
  useFocusEffect(useCallback(() => { refreshSpend(); }, [refreshSpend]));


  const activeStore = useMemo(
    () => stores.find((s) => s.id === activeStoreId),
    [stores, activeStoreId],
  );

  const tripStartItemCountRef = useRef(0);

  const sourceItemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const allActiveItems = useMemo(() => {
    return entries
      .filter((e) => e.status === 'active')
      .sort((a, b) => {
        const linkedA = a.source_item_id ? sourceItemMap.get(a.source_item_id) : null;
        const linkedB = b.source_item_id ? sourceItemMap.get(b.source_item_id) : null;
        const storeA = linkedA?.preferred_store_id ? stores.find((s) => s.id === linkedA.preferred_store_id)?.name ?? 'No store set' : 'No store set';
        const storeB = linkedB?.preferred_store_id ? stores.find((s) => s.id === linkedB.preferred_store_id)?.name ?? 'No store set' : 'No store set';
        const sectionA = resolveStoreSection(a.name, normalizeShoppingCategory(a.category), a.aisle);
        const sectionB = resolveStoreSection(b.name, normalizeShoppingCategory(b.category), b.aisle);
        return storeA.localeCompare(storeB) || sectionA.order - sectionB.order || sectionA.label.localeCompare(sectionB.label) || a.name.localeCompare(b.name);
      });
  }, [entries, sourceItemMap, stores]);

  const activeShoppingCounts = useMemo(
    () => countActiveShoppingByStore(allActiveItems, sourceItemMap),
    [allActiveItems, sourceItemMap],
  );

  const totalActiveCount = activeShoppingCounts.total;

  /**
   * Stores ranked for the Start "Where are you shopping?" selector:
   *   1. only stores that have active shopping items
   *   2. highest item count first
   *   3. alphabetical tie-break
   * (Nearby ranking is handled separately by the geofence ambiguity sheet.)
   */
  const startSheetStores = useMemo(() => {
    return stores
      .map((s) => ({ store: s, count: activeCountForStore(activeShoppingCounts, s.id) }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count || a.store.name.localeCompare(b.store.name));
  }, [stores, activeShoppingCounts]);

  const viewingEmptyStoreChip = useMemo(
    () => selectedStoreChipId !== null && activeCountForStore(activeShoppingCounts, selectedStoreChipId) === 0,
    [activeShoppingCounts, selectedStoreChipId],
  );

  useEffect(() => {
    if (!activeStoreId) return;
    const count = activeCountForStore(activeShoppingCounts, activeStoreId);
    if (count > 0) {
      setShoppingMode(true);
      return;
    }
    setShoppingMode(false);
  }, [activeStoreId, activeShoppingCounts]);

  useEffect(() => {
    if (activeStoreId) setSelectedStoreChipId(activeStoreId);
  }, [activeStoreId]);

  const firstRouteStoreId = useMemo(() => {
    for (const entry of allActiveItems) {
      const linked = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
      if (linked?.preferred_store_id) return linked.preferred_store_id;
    }
    return null;
  }, [allActiveItems, sourceItemMap]);

  const lowItems = useMemo(() => {
    const scopedStoreId = selectedStoreChipId ?? activeStoreId ?? (shoppingMode ? firstRouteStoreId : null);
    if (!scopedStoreId) return allActiveItems;
    return allActiveItems.filter((entry) => {
      const linked = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
      return linked?.preferred_store_id === scopedStoreId;
    });
  }, [activeStoreId, allActiveItems, firstRouteStoreId, selectedStoreChipId, shoppingMode, sourceItemMap]);

  useEffect(() => {
    setStartCount(0);
    setGrabbedCount(0);
  }, [activeStoreId]);

  useEffect(() => {
    if (!shoppingMode) {
      setCompletedStoreIds(new Set());
      setStoreSpendSheet(null);
      setStoreSpendAmount('');
      setPendingReceiptStoreId(null);
      setTripReceiptCount(0);
      tripStartItemCountRef.current = 0;
      setItemQty(new Map());
      setPurchasedQty(new Map());
      setStoreGrabbedCount(new Map());
      setDoneConfirmSheet(null);
    }
  }, [shoppingMode, setPendingReceiptStoreId]);

  // Keep startCount as a running high-water mark: max(startCount, pending + grabbed).
  // This handles three real cases a one-shot snapshot misses:
  //   1. Entries load after mode activates (geofence trigger on cold start)
  //   2. Partner marks items low mid-session (realtime insert)
  //   3. Items sit in lowItems for 520ms after tap while purchasedIds visual plays
  useEffect(() => {
    if (!shoppingMode) {
      setStartCount(0);
      setGrabbedCount(0);
      return;
    }
    const tripCount = Math.max(tripStartItemCountRef.current, allActiveItems.length + grabbedCount);
    if (tripStartItemCountRef.current === 0 && tripCount > 0) {
      tripStartItemCountRef.current = tripCount;
    }
    setStartCount((prev) => Math.max(prev, tripCount));
  }, [allActiveItems.length, shoppingMode, grabbedCount]);


  const makeShoppingSections = useCallback((sectionEntries: ShoppingEntry[]) => {
    const groups = new Map<string, ShoppingSection>();

    sectionEntries.forEach((entry) => {
      const linked = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
      const store = linked?.preferred_store_id ? stores.find((s) => s.id === linked.preferred_store_id) : null;
      const key = store?.id ?? 'unassigned';
      const existing = groups.get(key);
      if (existing) {
        existing.data.push(entry);
        return;
      }
      groups.set(key, {
        title: store?.name ?? 'No store set',
        storeId: store?.id ?? null,
        data: [entry],
      });
    });

    return Array.from(groups.values())
      .sort((a, b) => {
        // "No store set" (unassigned) always goes last
        if (a.title === 'No store set') return 1;
        if (b.title === 'No store set') return -1;
        return a.title.localeCompare(b.title);
      });
  }, [sourceItemMap, stores]);

  const shoppingSections = useMemo(
    () => makeShoppingSections(lowItems),
    [makeShoppingSections, lowItems],
  );

  const allShoppingSections = useMemo(
    () => makeShoppingSections(allActiveItems),
    [makeShoppingSections, allActiveItems],
  );

  const assignedRouteSections = useMemo(
    () => allShoppingSections.filter((section) => section.storeId),
    [allShoppingSections],
  );

  const completedRouteStoreIds = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    completedStoreIds.forEach((id) => {
      seen.add(id);
      ids.push(id);
    });
    receiptCompletedStoreIds.forEach((id) => {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    });
    return ids;
  }, [completedStoreIds, receiptCompletedStoreIds]);

  useEffect(() => {
    if (!shoppingMode) {
      setRouteStoreIds([]);
      return;
    }
    const currentIds = Array.from(new Set([
      ...completedRouteStoreIds,
      ...assignedRouteSections.map((section) => section.storeId!),
    ]));
    setRouteStoreIds((prev) => {
      if (prev.length === 0) return currentIds.length === 0 ? prev : currentIds;
      const seen = new Set(prev);
      const next = [...prev];
      currentIds.forEach((id) => {
        if (!seen.has(id)) {
          seen.add(id);
          next.push(id);
        }
      });
      return next.length === prev.length ? prev : next;
    });
  }, [assignedRouteSections, completedRouteStoreIds, shoppingMode]);

  const stopNumberByStoreId = useMemo(() => {
    const ids = routeStoreIds.length > 0
      ? routeStoreIds
      : assignedRouteSections.map((section) => section.storeId!);
    const withItems = ids.filter(
      (id) =>
        (activeShoppingCounts.byStoreId[id] ?? 0) > 0
        || completedRouteStoreIds.includes(id)
        || receiptCompletedStoreIds.includes(id),
    );
    return new Map(withItems.map((storeId, index) => [storeId, index + 1]));
  }, [activeShoppingCounts.byStoreId, assignedRouteSections, completedRouteStoreIds, receiptCompletedStoreIds, routeStoreIds]);

  const routedShoppingSections = useMemo(
    () => shoppingSections.map((section) => ({
      ...section,
      stopNumber: section.storeId ? stopNumberByStoreId.get(section.storeId) : undefined,
    })),
    [shoppingSections, stopNumberByStoreId],
  );

  const nextStopInfo = useMemo(() => {
    const sectionByStoreId = new Map(assignedRouteSections.map((section) => [section.storeId!, section]));
    const orderedIds = (routeStoreIds.length > 0 ? routeStoreIds : assignedRouteSections.map((section) => section.storeId!))
      .filter((storeId) => sectionByStoreId.has(storeId));
    const assignedStops = orderedIds.map((storeId) => sectionByStoreId.get(storeId)!);
    if (activeStoreId) {
      const currentRouteIdx = routeStoreIds.indexOf(activeStoreId);
      const next = currentRouteIdx === -1
        ? assignedStops[0] ?? null
        : assignedStops.find((section) => routeStoreIds.indexOf(section.storeId!) > currentRouteIdx) ?? null;
      return next ? { stop: next, stopNumber: stopNumberByStoreId.get(next.storeId!) ?? 1 } : null;
    }
    const first = assignedStops[0] ?? null;
    return first ? { stop: first, stopNumber: stopNumberByStoreId.get(first.storeId!) ?? 1 } : null;
  }, [activeStoreId, assignedRouteSections, routeStoreIds, stopNumberByStoreId]);

  const nextStop = nextStopInfo?.stop ?? null;

  const hasUnassignedItems = allActiveItems.some((entry) => {
    const linked = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
    return !linked?.preferred_store_id;
  });

  const unassignedEntries = useMemo(() => allActiveItems.filter((entry) => {
    const linked = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
    return !!linked && !linked.preferred_store_id;
  }), [allActiveItems, sourceItemMap]);

  const activeStoreComplete = !viewingEmptyStoreChip && shoppingMode && (
    (!!activeStoreId && lowItems.length === 0 && (startCount > 0 || grabbedCount > 0))
    || (!activeStoreId && !!nextStop && allActiveItems.length > 0)
    || (!activeStoreId && hasUnassignedItems && allActiveItems.length > 0)
  );

  const nextStoreNameAfter = useCallback((storeId: string): string | null => {
    const sectionByStoreId = new Map(assignedRouteSections.map((section) => [section.storeId!, section]));
    const orderedIds = (routeStoreIds.length > 0 ? routeStoreIds : assignedRouteSections.map((section) => section.storeId!))
      .filter((id) => sectionByStoreId.has(id));
    const assignedStops = orderedIds.map((id) => sectionByStoreId.get(id)!);
    const currentRouteIdx = routeStoreIds.indexOf(storeId);
    const next = currentRouteIdx === -1
      ? assignedStops.find((section) => section.storeId !== storeId) ?? null
      : assignedStops.find((section) => routeStoreIds.indexOf(section.storeId!) > currentRouteIdx) ?? null;
    return next?.title ?? null;
  }, [assignedRouteSections, routeStoreIds]);

  /** Open the spend/receipt sheet directly — only called after user confirms "Yes, finish stop". */
  const openStoreSpendSheetDirect = useCallback((storeId: string) => {
    const store = stores.find((s) => s.id === storeId);
    if (!store) return;
    setStoreSpendAmount('');
    setStoreSpendSheet({
      storeId,
      storeName: store.name,
      stopNumber: stopNumberByStoreId.get(storeId) ?? 1,
      nextStoreName: nextStoreNameAfter(storeId),
    });
  }, [nextStoreNameAfter, stopNumberByStoreId, stores]);

  /**
   * Gate the spend sheet behind a "Are you done?" confirmation.
   * If the user grabbed 0 items at this store, skip silently.
   */
  const openStoreSpendPrompt = useCallback((storeId: string) => {
    if (activeCountForStore(activeShoppingCounts, storeId) === 0) return;
    const store = stores.find((s) => s.id === storeId);
    if (!store) return;

    // Guard: 0 items grabbed at this store → don't force receipt entry
    const grabbed = storeGrabbedCount.get(storeId) ?? 0;
    if (grabbed === 0) return;

    setPendingReceiptStoreId(storeId);
    // Show confirmation sheet first; spend sheet only opens on "Yes, finish stop"
    setDoneConfirmSheet({ storeId, storeName: store.name });
  }, [activeShoppingCounts, setPendingReceiptStoreId, storeGrabbedCount, stores]);

  const isStoreReceiptDone = useCallback(
    (storeId: string) =>
      completedStoreIds.has(storeId) || receiptCompletedStoreIds.includes(storeId),
    [completedStoreIds, receiptCompletedStoreIds],
  );

  const remainingItemsAtStore = useCallback(
    (storeId: string) =>
      allActiveItems.filter((entry) => {
        if (purchasedIds.has(entry.id)) return false;
        const linked = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
        return linked?.preferred_store_id === storeId;
      }).length,
    [allActiveItems, purchasedIds, sourceItemMap],
  );

  const storeNeedsReceiptStep = useCallback(
    (storeId: string): boolean => {
      if (!shoppingMode || !storeId || isStoreReceiptDone(storeId)) return false;
      if (activeCountForStore(activeShoppingCounts, storeId) === 0) return false;
      if (pendingReceiptStoreId === storeId) return true;
      if (remainingItemsAtStore(storeId) > 0) return false;

      if (storeId === activeStoreId) {
        return startCount > 0 || grabbedCount > 0;
      }

      if (!routeStoreIds.includes(storeId)) return false;
      const section = assignedRouteSections.find((s) => s.storeId === storeId);
      return !!section;
    },
    [
      activeShoppingCounts,
      activeStoreId,
      assignedRouteSections,
      grabbedCount,
      isStoreReceiptDone,
      pendingReceiptStoreId,
      remainingItemsAtStore,
      routeStoreIds,
      shoppingMode,
      startCount,
    ],
  );

  const resolveStoreNeedingReceipt = useCallback((): string | null => {
    if (pendingReceiptStoreId && !isStoreReceiptDone(pendingReceiptStoreId)) {
      return pendingReceiptStoreId;
    }
    if (activeStoreId && storeNeedsReceiptStep(activeStoreId)) return activeStoreId;

    const sectionByStoreId = new Map(
      assignedRouteSections
        .filter((s): s is typeof s & { storeId: string } => !!s.storeId)
        .map((s) => [s.storeId, s]),
    );
    const orderedIds = (
      routeStoreIds.length > 0 ? routeStoreIds : assignedRouteSections.map((s) => s.storeId!)
    ).filter((id): id is string => !!id && sectionByStoreId.has(id));

    for (const id of orderedIds) {
      if (storeNeedsReceiptStep(id)) return id;
    }
    return null;
  }, [
    activeStoreId,
    assignedRouteSections,
    isStoreReceiptDone,
    pendingReceiptStoreId,
    routeStoreIds,
    storeNeedsReceiptStep,
  ]);

  const currentStoreNeedsReceiptStep = useMemo(() => {
    if (!activeStoreId) return false;
    return storeNeedsReceiptStep(activeStoreId);
  }, [activeStoreId, storeNeedsReceiptStep]);

  useEffect(() => {
    if (!shoppingMode || !activeStoreId) return;
    if (isStoreReceiptDone(activeStoreId)) return;
    if (activeCountForStore(activeShoppingCounts, activeStoreId) === 0) return;
    // Only set pending receipt for stores that were actually in the planned route.
    // Stores with zero items (e.g. Afghanistan market when no items assigned) are
    // never added to routeStoreIds, so startCount/grabbedCount from other stores
    // should not trigger the spend sheet for them.
    if (!routeStoreIds.includes(activeStoreId)) return;
    if (lowItems.length === 0 && (startCount > 0 || grabbedCount > 0)) {
      if (pendingReceiptStoreId !== activeStoreId) {
        setPendingReceiptStoreId(activeStoreId);
      }
    }
  }, [
    activeShoppingCounts,
    activeStoreId,
    grabbedCount,
    isStoreReceiptDone,
    lowItems.length,
    pendingReceiptStoreId,
    routeStoreIds,
    setPendingReceiptStoreId,
    shoppingMode,
    startCount,
  ]);

  useEffect(() => {
    if (!activeStoreComplete || !activeStoreId || !activeStore) return;
    if (isStoreReceiptDone(activeStoreId)) return;
    if (activeCountForStore(activeShoppingCounts, activeStoreId) === 0) return;
    if (pendingReceiptStoreId === activeStoreId || storeSpendSheet) return;
    // Same guard — only prompt for stores that had items in the route.
    if (!routeStoreIds.includes(activeStoreId)) return;
    openStoreSpendPrompt(activeStoreId);
  }, [
    activeShoppingCounts,
    activeStore,
    activeStoreComplete,
    activeStoreId,
    isStoreReceiptDone,
    openStoreSpendPrompt,
    pendingReceiptStoreId,
    routeStoreIds,
    storeSpendSheet,
  ]);

  useEffect(() => {
    if (!shoppingMode || !pendingReceiptStoreId) return;
    if (activeCountForStore(activeShoppingCounts, pendingReceiptStoreId) === 0) {
      setPendingReceiptStoreId(null);
      return;
    }
    if (isStoreReceiptDone(pendingReceiptStoreId)) {
      setPendingReceiptStoreId(null);
      return;
    }
    if (activeStoreId !== pendingReceiptStoreId) {
      setActiveStore(pendingReceiptStoreId);
    }
    if (storeSpendSheet) return;
    const store = stores.find((s) => s.id === pendingReceiptStoreId);
    if (!store) {
      setPendingReceiptStoreId(null);
      return;
    }
    setStoreSpendAmount('');
    setStoreSpendSheet({
      storeId: pendingReceiptStoreId,
      storeName: store.name,
      stopNumber: stopNumberByStoreId.get(pendingReceiptStoreId) ?? 1,
      nextStoreName: nextStoreNameAfter(pendingReceiptStoreId),
    });
  }, [
    activeShoppingCounts,
    activeStoreId,
    nextStoreNameAfter,
    isStoreReceiptDone,
    pendingReceiptStoreId,
    setActiveStore,
    setPendingReceiptStoreId,
    shoppingMode,
    stopNumberByStoreId,
    storeSpendSheet,
    stores,
  ]);

  const tripBudgetLeft = Math.max(0, weeklyBudget - tripSpend);
  const tripSpendProgress = useMemo(
    () => Math.min(tripSpend / weeklyBudget, 1),
    [tripSpend, weeklyBudget],
  );

  const handleGotIt = useCallback(async (entry: ShoppingEntry, qty = 1) => {
    const userId = session?.user.id ?? '';
    void hapticSelection();
    setTapping(entry.id);
    setPurchasedIds((prev) => new Set(prev).add(entry.id));
    setPurchasedQty((prev) => new Map(prev).set(entry.id, qty));
    setGrabbedCount((prev) => prev + 1);
    const linkedForCount = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
    const countStoreId = linkedForCount?.preferred_store_id ?? '__unassigned__';
    setStoreGrabbedCount((prev) => {
      const next = new Map(prev);
      next.set(countStoreId, (prev.get(countStoreId) ?? 0) + 1);
      return next;
    });
    const linked = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
    const finishedStoreId = linked?.preferred_store_id ?? null;
    const shouldOpenSpendAfterVisual = (() => {
      if (!finishedStoreId || !shoppingMode || isStoreReceiptDone(finishedStoreId) || pendingReceiptStoreId) return false;
      if (activeCountForStore(activeShoppingCounts, finishedStoreId) === 0) return false;
      const othersAtStore = allActiveItems.filter((e) => {
        if (e.id === entry.id || purchasedIds.has(e.id)) return false;
        const l = e.source_item_id ? sourceItemMap.get(e.source_item_id) : null;
        return l?.preferred_store_id === finishedStoreId;
      }).length;
      return othersAtStore === 0;
    })();
    if (entry.source_item_id) {
      updateItem(entry.source_item_id, { is_low: false, got_it_by: userId, macro_status: 'in_stock' as Item['macro_status'] });
    }

    try {
      const finishVisual = () => {
        setTimeout(() => {
          removeEntry(entry.id);
          setPurchasedIds((prev) => {
            const next = new Set(prev);
            next.delete(entry.id);
            return next;
          });
          setItemQty((prev) => { const next = new Map(prev); next.delete(entry.id); return next; });
          setPurchasedQty((prev) => { const next = new Map(prev); next.delete(entry.id); return next; });
          if (shouldOpenSpendAfterVisual && finishedStoreId) {
            openStoreSpendPrompt(finishedStoreId);
          }
        }, 520);
      };
      if (entry.source_item_id) {
        const result = await markItemGotItWithQueue(entry.source_item_id, userId);
        if (result.queued) {
          void hapticSelection();
          finishVisual();
          return;
        }
      } else {
        const result = await completeShoppingEntryWithQueue(entry.id);
        if (result.queued) {
          void hapticSelection();
          finishVisual();
          return;
        }
      }
      void hapticSuccess();
      finishVisual();
    } catch {
      setPurchasedIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
      setGrabbedCount((prev) => Math.max(0, prev - 1));
      if (entry.source_item_id) {
        updateItem(entry.source_item_id, { is_low: true, got_it_by: null, macro_status: 'running_low' as Item['macro_status'] });
      }
      void hapticError();
    } finally {
      setTapping(null);
    }
  }, [
    activeShoppingCounts,
    allActiveItems,
    isStoreReceiptDone,
    openStoreSpendPrompt,
    pendingReceiptStoreId,
    purchasedIds,
    removeEntry,
    session?.user.id,
    shoppingMode,
    sourceItemMap,
    updateItem,
  ]);

  const openDirections = useCallback(async (storeId: string | null) => {
    const store = storeId ? stores.find((s) => s.id === storeId) : null;
    if (!store) return;
    void hapticSelection();
    const destination = store.latitude != null && store.longitude != null
      ? `${store.latitude},${store.longitude}`
      : encodeURIComponent(store.address || store.name);
    const nativeUrl = Platform.OS === 'ios'
      ? `maps://?daddr=${destination}&dirflg=d`
      : `google.navigation:q=${destination}`;
    const fallbackUrl = `https://maps.apple.com/?daddr=${destination}&dirflg=d&t=m`;
    const canOpenNative = await Linking.canOpenURL(nativeUrl).catch(() => false);
    await Linking.openURL(canOpenNative ? nativeUrl : fallbackUrl);
  }, [stores]);

  const trySetActiveStore = useCallback(
    (storeId: string | null) => {
      if (storeId === null) {
        setSelectedStoreChipId(null);
        setActiveStore(null);
        return;
      }
      const itemCount = activeCountForStore(activeShoppingCounts, storeId);
      if (itemCount === 0) {
        setSelectedStoreChipId(storeId);
        if (activeStoreId === storeId) {
          setActiveStore(null);
        }
        return;
      }
      if (
        pendingReceiptStoreId
        && storeId !== pendingReceiptStoreId
        && !isStoreReceiptDone(pendingReceiptStoreId)
      ) {
        const pendingStore = stores.find((s) => s.id === pendingReceiptStoreId);
        Alert.alert(
          'Finish this stop',
          `Enter how much you spent at ${pendingStore?.name ?? 'this store'} before switching. A receipt photo is optional.`,
          [{ text: 'OK', onPress: () => openStoreSpendPrompt(pendingReceiptStoreId) }],
        );
        return;
      }
      if (activeStoreId && storeId !== activeStoreId && storeNeedsReceiptStep(activeStoreId)) {
        openStoreSpendPrompt(activeStoreId);
        return;
      }
      // Switch confirmation: while actively shopping, never silently jump from
      // one store session to another — the user must confirm the switch.
      if (shoppingMode && activeStoreId && storeId !== activeStoreId) {
        const fromName = normalizeStoreName(stores.find((s) => s.id === activeStoreId)?.name ?? 'this store');
        const toName = normalizeStoreName(stores.find((s) => s.id === storeId)?.name ?? 'that store');
        Alert.alert(
          `Switch from ${fromName} to ${toName}?`,
          'Your current store session will be replaced.',
          [
            { text: `Stay at ${fromName}`, style: 'cancel' },
            {
              text: 'Switch store',
              onPress: () => { setSelectedStoreChipId(storeId); setActiveStore(storeId); },
            },
          ],
        );
        return;
      }
      setSelectedStoreChipId(storeId);
      setActiveStore(storeId);
    },
    [
      activeShoppingCounts,
      activeStoreId,
      isStoreReceiptDone,
      openStoreSpendPrompt,
      pendingReceiptStoreId,
      setActiveStore,
      shoppingMode,
      storeNeedsReceiptStep,
      stores,
    ],
  );

  /**
   * Begin a personal, store-locked shopping session from the Start selector.
   * Passing null = "Shop all items" (no single-store lock).
   */
  const beginShopping = useCallback(
    (storeId: string | null) => {
      void hapticSelection();
      setStartSheet(false);
      clearReceiptTrip();
      setTripSpend(0);
      setTripReceiptCount(0);
      setSelectedStoreChipId(storeId);
      setActiveStore(storeId);
      setShoppingMode(true);
    },
    [clearReceiptTrip, setActiveStore],
  );

  const tryAdvanceToNextStop = useCallback(() => {
    if (!nextStop) return;
    void hapticSelection();
    const storeId = resolveStoreNeedingReceipt();
    if (storeId) {
      openStoreSpendPrompt(storeId);
      return;
    }
    setActiveStore(nextStop.storeId);
  }, [nextStop, openStoreSpendPrompt, resolveStoreNeedingReceipt, setActiveStore]);

  const finishShopping = useCallback(() => {
    const blockingReceiptStoreId = resolveStoreNeedingReceipt();
    if (blockingReceiptStoreId) {
      const pendingStore = stores.find((s) => s.id === blockingReceiptStoreId);
      Alert.alert(
        'Finish this stop',
        `Enter how much you spent at ${pendingStore?.name ?? 'this store'} before finishing your trip. A receipt photo is optional.`,
        [{ text: 'OK', onPress: () => openStoreSpendPrompt(blockingReceiptStoreId) }],
      );
      return;
    }
    const remaining = entries.filter((e) => !purchasedIds.has(e.id)).length;
    if (remaining > 0) {
      Alert.alert(
        'Done shopping?',
        `You still have ${remaining} ${remaining === 1 ? 'item' : 'items'} left on your list.`,
        [
          { text: 'Keep shopping', style: 'cancel' },
          {
            text: 'Done',
            onPress: () => {
              void hapticSuccess();
              const count = startCount;
              const finishedTripSpend = tripSpend;
              const finishedWeeklySpend = weeklySpend;
              const finishedReceiptCount = tripReceiptCount;
              setShoppingMode(false);
              setActiveStore(null);
              setSelectedStoreChipId(null);
              clearReceiptTrip();
              setRouteStoreIds([]);
              setStartCount(0);
              setGrabbedCount(0);
              if (count > 0) setTripSheet({ itemCount: count, tripSpend: finishedTripSpend, weeklySpend: finishedWeeklySpend, receiptCount: finishedReceiptCount });
            },
          },
        ],
      );
    } else {
      void hapticSuccess();
      const count = startCount;
      const finishedTripSpend = tripSpend;
      const finishedWeeklySpend = weeklySpend;
      const finishedReceiptCount = tripReceiptCount;
      setShoppingMode(false);
      setActiveStore(null);
      setSelectedStoreChipId(null);
      clearReceiptTrip();
      setRouteStoreIds([]);
      setStartCount(0);
      setGrabbedCount(0);
      if (count > 0) setTripSheet({ itemCount: count, tripSpend: finishedTripSpend, weeklySpend: finishedWeeklySpend, receiptCount: finishedReceiptCount });
    }
  }, [
    clearReceiptTrip,
    entries,
    openStoreSpendPrompt,
    purchasedIds,
    resolveStoreNeedingReceipt,
    setActiveStore,
    startCount,
    stores,
    tripSpend,
    tripReceiptCount,
    weeklySpend,
  ]);

  const blockSpendSheetDismiss = useCallback(() => {
    // Receipt step must finish via Save amount, upload, or Skip — not backdrop/back.
  }, []);

  const continueAfterStoreSpend = useCallback((amount = 0, receiptAdded = false) => {
    const finishedStoreId = storeSpendSheet?.storeId;
    const count = startCount;
    const finishedTripSpend = tripSpend + amount;
    const finishedWeeklySpend = weeklySpend + amount;
    const finishedReceiptCount = tripReceiptCount + (receiptAdded ? 1 : 0);
    if (amount > 0) setTripSpend(finishedTripSpend);
    if (receiptAdded) setTripReceiptCount(finishedReceiptCount);
    setStoreSpendSheet(null);
    setStoreSpendAmount('');
    setPendingReceiptStoreId(null);
    if (finishedStoreId) {
      markReceiptCompleted(finishedStoreId);
      setCompletedStoreIds((prev) => new Set(prev).add(finishedStoreId));
    }
    if (nextStop) {
      setActiveStore(null);
      return;
    }
    if (allActiveItems.length === 0) {
      void hapticSuccess();
      setShoppingMode(false);
      setActiveStore(null);
      clearReceiptTrip();
      setRouteStoreIds([]);
      setStartCount(0);
      setGrabbedCount(0);
      if (count > 0) setTripSheet({ itemCount: count, tripSpend: finishedTripSpend, weeklySpend: finishedWeeklySpend, receiptCount: finishedReceiptCount });
    }
  }, [
    allActiveItems.length,
    clearReceiptTrip,
    markReceiptCompleted,
    nextStop,
    setActiveStore,
    setPendingReceiptStoreId,
    startCount,
    storeSpendSheet?.storeId,
    tripSpend,
    tripReceiptCount,
    weeklySpend,
  ]);

  const saveStoreSpend = useCallback(async () => {
    if (!storeSpendSheet || !householdId || !session?.user.id) return;
    const parsed = parseFloat(storeSpendAmount.replace(/[^0-9.]/g, ''));
    const hasAmount = Number.isFinite(parsed) && parsed > 0;
    if (!hasAmount) {
      continueAfterStoreSpend();
      return;
    }
    setSavingStoreSpend(true);
    try {
      const today = localToday();
      await addManualReceipt(householdId, session.user.id, storeSpendSheet.storeName, parsed, today);
      refreshSpend();
      void hapticSuccess();
      continueAfterStoreSpend(parsed, true);
    } catch (e: any) {
      void hapticError();
      Alert.alert('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setSavingStoreSpend(false);
    }
  }, [continueAfterStoreSpend, householdId, refreshSpend, session?.user.id, storeSpendAmount, storeSpendSheet]);

  const uploadStoreReceipt = useCallback((source: 'camera' | 'library') => {
    if (!storeSpendSheet || !householdId || !session?.user.id) return;
    Alert.alert('Add receipt?', `Attach this receipt to ${storeSpendSheet.storeName}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: async () => {
          try {
            setSavingStoreSpend(true);
            const permission = source === 'camera'
              ? await ImagePicker.requestCameraPermissionsAsync()
              : await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
              Alert.alert('Permission needed', `Please allow ${source === 'camera' ? 'camera' : 'photo library'} access in Settings.`);
              return;
            }
            const result = source === 'camera'
              ? await ImagePicker.launchCameraAsync({ quality: 0.8, base64: false })
              : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
            if (result.canceled || !result.assets[0]) return;
            const asset = result.assets[0];
            const today = localToday();
            await uploadReceipt(householdId, session.user.id, asset.uri, asset.mimeType ?? 'image/jpeg', storeSpendSheet.storeName, today);
            refreshSpend();
            void hapticSuccess();
            Alert.alert('Receipt uploaded', 'Processing this store receipt.');
            continueAfterStoreSpend(0, true);
          } catch (e: any) {
            void hapticError();
            Alert.alert('Upload failed', e?.message ?? 'Please try again.');
          } finally {
            setSavingStoreSpend(false);
          }
        },
      },
    ]);
  }, [continueAfterStoreSpend, householdId, refreshSpend, session?.user.id, storeSpendSheet]);

  const closeTripSheet = useCallback(() => setTripSheet(null), []);

  const goToReceipts = useCallback(() => {
    setTripSheet(null);
    router.push({ pathname: '/(main)/receipts', params: { action: 'camera', fromTrip: '1' } });
  }, [router]);

  const assignEntryToStore = useCallback((entry: ShoppingEntry) => {
    const sourceItem = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
    if (!sourceItem || stores.length === 0) return;
    void hapticSelection();
    setAssignItem(sourceItem);
  }, [sourceItemMap, stores]);

  const assignStore = useCallback(async (storeId: string | null) => {
    if (!assignItem) return;
    const previousStoreId = assignItem.preferred_store_id;
    setAssignItem(null);
    updateItem(assignItem.id, { preferred_store_id: storeId });
    try {
      await setItemStoreWithQueue(assignItem.id, storeId);
    } catch {
      updateItem(assignItem.id, { preferred_store_id: previousStoreId });
      void hapticError();
    }
  }, [assignItem, updateItem]);

  const assignFirstUnassigned = useCallback(() => {
    const first = unassignedEntries[0];
    if (!first) return;
    assignEntryToStore(first);
  }, [assignEntryToStore, unassignedEntries]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>{shoppingMode ? 'Shopping mode' : 'Shopping'}</Text>
          <Text style={styles.headerTitle}>{activeStore ? activeStore.name : 'Shopping list'}</Text>
        </View>
        <Animated.View style={!shoppingMode && { transform: [{ scale: pulseAnim }] }}>
          <ScalePressable
            style={[styles.modeBtn, shoppingMode && styles.modeBtnActive]}
            onPress={() => {
              void hapticSelection();
              // Start path → open the store-first "Where are you shopping?" selector
              // instead of blindly entering shopping mode on a stale/mixed store.
              if (!shoppingMode) {
                setStartSheet(true);
                return;
              }
              // Done path → finish the current session (after any pending receipt).
              const blockingReceiptStoreId = resolveStoreNeedingReceipt();
              if (blockingReceiptStoreId) {
                const pendingStore = stores.find((s) => s.id === blockingReceiptStoreId);
                Alert.alert(
                  'Finish this stop',
                  `Enter how much you spent at ${pendingStore?.name ?? 'this store'} before leaving shopping mode. A receipt photo is optional.`,
                  [{ text: 'OK', onPress: () => openStoreSpendPrompt(blockingReceiptStoreId) }],
                );
                return;
              }
              setShoppingMode(false);
              setActiveStore(null);
              clearReceiptTrip();
            }}
          >
            <Ionicons
              name={shoppingMode ? 'checkmark-circle' : 'cart-outline'}
              size={18}
              color={shoppingMode ? colors.surface : colors.onPrimary}
            />
            <Text style={[styles.modeBtnText, shoppingMode && styles.modeBtnTextActive]}>
              {shoppingMode ? 'Done' : 'Start'}
            </Text>
          </ScalePressable>
        </Animated.View>
      </View>

      <View style={[styles.statusCard, shoppingMode && styles.statusCardActive]}>
        <View>
          {shoppingMode && startCount > 0 && lowItems.length === 0 ? (
            <>
              <Text style={[styles.statusKicker, styles.statusKickerActive]}>All done</Text>
              <Text style={[styles.statusNumber, styles.statusNumberActive]}>{startCount}</Text>
              <Text style={[styles.statusLabel, styles.statusLabelActive]}>items picked up</Text>
            </>
          ) : shoppingMode && startCount > 0 ? (
            <>
              <Text style={[styles.statusKicker, styles.statusKickerActive]}>In progress</Text>
              <Text style={[styles.statusNumber, styles.statusNumberActive]}>
                {grabbedCount}
                <Text style={[styles.statusNumberDim]}> / {startCount}</Text>
              </Text>
              <Text style={[styles.statusLabel, styles.statusLabelActive]}>items picked up</Text>
            </>
          ) : (
            <>
              <Text style={styles.statusKicker}>Shopping list</Text>
              <Text style={[styles.statusNumber, shoppingMode && styles.statusNumberActive]}>{lowItems.length}</Text>
              <Text style={[styles.statusLabel, shoppingMode && styles.statusLabelActive]}>
                {lowItems.length === 1 ? 'item' : 'items'}
              </Text>
            </>
          )}
        </View>
        <View style={styles.statusRight}>
          {activeStore && (
            <View style={styles.storePill}>
              <Ionicons name="storefront-outline" size={14} color={colors.primary} />
              <Text style={styles.storePillText} numberOfLines={1}>{activeStore.name}</Text>
            </View>
          )}
          <View style={styles.budgetSection}>
            <Text style={styles.budgetTitle}>Trip total</Text>
            <Text style={styles.tripAmount}>${tripSpend.toFixed(2)}</Text>
            <View style={styles.budgetBar}>
              <View style={[styles.budgetFill, {
                width: `${Math.round(tripSpendProgress * 100)}%` as any,
                backgroundColor: tripSpendProgress > 0.9 ? colors.danger : tripSpendProgress > 0.65 ? colors.warning : colors.success,
              }]} />
            </View>
            <Text style={styles.budgetLabel}>${tripBudgetLeft.toFixed(2)} budget left</Text>
            <Text style={styles.weeklyContext}>Weekly: ${weeklySpend.toFixed(2)}</Text>
          </View>
        </View>
      </View>


      {stores.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.storeBar}
          contentContainerStyle={styles.storeBarContent}
        >
          <ScalePressable
            profile="chip"
            style={[styles.chip, selectedStoreChipId === null && styles.chipActive]}
            onPress={() => {
              void hapticSelection();
              trySetActiveStore(null);
            }}
          >
            <Text style={[styles.chipText, selectedStoreChipId === null && styles.chipTextActive]}>
              {formatStoreChipLabel('All stores', totalActiveCount)}
            </Text>
          </ScalePressable>
          {stores.map((s) => (
            <ScalePressable
              key={s.id}
              profile="chip"
              style={[styles.chip, selectedStoreChipId === s.id && styles.chipActive]}
              onPress={() => {
                void hapticSelection();
                trySetActiveStore(selectedStoreChipId === s.id ? null : s.id);
              }}
            >
              <Text style={[styles.chipText, selectedStoreChipId === s.id && styles.chipTextActive]}>
                {formatStoreChipLabel(normalizeStoreName(s.name), activeCountForStore(activeShoppingCounts, s.id))}
              </Text>
            </ScalePressable>
          ))}
        </ScrollView>
      )}


      {unassignedEntries.length > 0 && (
        <View style={styles.unassignedBanner}>
          <View style={styles.unassignedIcon}>
            <Ionicons name="storefront-outline" size={16} color={colors.warning} />
          </View>
          <View style={styles.unassignedBody}>
            <Text style={styles.unassignedTitle}>Store missing</Text>
            <Text style={styles.unassignedSub} numberOfLines={2}>
              {(() => {
                const names = unassignedEntries.map((e) => e.name);
                if (names.length === 1) return `${names[0]} needs a store for accurate directions.`;
                if (names.length === 2) return `${names[0]} and ${names[1]} need stores.`;
                return `${names[0]}, ${names[1]} and ${names.length - 2} more need stores.`;
              })()}
            </Text>
          </View>
          <ScalePressable style={styles.unassignedBtn} onPress={assignFirstUnassigned}>
            <Text style={styles.unassignedBtnText}>Fix</Text>
          </ScalePressable>
        </View>
      )}

      {!viewingEmptyStoreChip && activeStoreComplete && (nextStop || hasUnassignedItems) && !pendingReceiptStoreId && !storeSpendSheet && (
        <View style={styles.nextStopCard}>
          <View style={styles.nextStopTop}>
            <View style={styles.nextStopIcon}>
              <Ionicons name={nextStop ? 'navigate-outline' : 'storefront-outline'} size={14} color={colors.primary} />
            </View>
            <View style={styles.nextStopBody}>
              {nextStop ? (
                <>
                  <Text style={styles.nextStopKicker}>{activeStoreId ? 'Store complete' : 'Ready to start'}</Text>
                  <Text style={styles.nextStopTitle} numberOfLines={1}>
                    {ordinalStop(nextStopInfo!.stopNumber)}: {nextStop.title}
                  </Text>
                  <Text style={styles.nextStopSub}>
                    {nextStop.data.length} {nextStop.data.length === 1 ? 'item' : 'items'} left in this stop
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.nextStopKicker}>Stores needed</Text>
                  <Text style={styles.nextStopTitle} numberOfLines={1}>Assign stores to route this trip</Text>
                  <Text style={styles.nextStopSub}>Use each Store chip below to add GPS directions.</Text>
                </>
              )}
            </View>
            {nextStop && (
              <StoreLogo
                name={nextStop.title}
                size={44}
                domain={nextStop.storeId ? stores.find((s) => s.id === nextStop.storeId)?.brand_domain : undefined}
                logoUrl={nextStop.storeId ? stores.find((s) => s.id === nextStop.storeId)?.logo_url : undefined}
              />
            )}
          </View>
          <View style={styles.nextStopActions}>
            {nextStop?.storeId && (
              <ScalePressable
                style={styles.nextStopPrimary}
                onPress={() => {
                  void openDirections(nextStop.storeId);
                }}
              >
                <Ionicons name="navigate-outline" size={13} color={colors.onPrimary} />
                <Text style={styles.nextStopPrimaryText}>Directions</Text>
              </ScalePressable>
            )}
            {nextStop && (
              <ScalePressable style={styles.nextStopSecondary} onPress={tryAdvanceToNextStop}>
                <Text style={styles.nextStopSecondaryText}>{nextStop.storeId ? 'Skip GPS' : 'View list'}</Text>
              </ScalePressable>
            )}
            <ScalePressable style={styles.nextStopGhost} onPress={finishShopping}>
              <Text style={styles.nextStopGhostText}>Done shopping</Text>
            </ScalePressable>
          </View>
        </View>
      )}

      {viewingEmptyStoreChip ? (
        <EmptyState
          emoji="🏪"
          title="0 items for this store"
          subtitle={`No active shopping items are assigned to ${stores.find((s) => s.id === selectedStoreChipId)?.name ?? 'this store'}. Assign items from the list or pick another store.`}
        />
      ) : lowItems.length === 0 ? (
        <EmptyState
          emoji={
            shoppingMode && startCount > 0
              ? '🍽️'
              : selectedStoreChipId ?? activeStoreId
              ? '🏪'
              : shoppingMode
              ? '🛒'
              : '🧺'
          }
          title={
            shoppingMode && startCount > 0
              ? 'All grabbed!'
              : selectedStoreChipId ?? activeStoreId
              ? `Nothing at ${stores.find((s) => s.id === (selectedStoreChipId ?? activeStoreId))?.name ?? 'this store'}`
              : shoppingMode
              ? 'List is clear'
              : 'All stocked up'
          }
          subtitle={
            shoppingMode && startCount > 0
              ? `You picked up all ${startCount} ${startCount === 1 ? 'item' : 'items'}. Tap Done when you're finished.`
              : selectedStoreChipId ?? activeStoreId
              ? 'No low items are assigned to this store. Tap All stores above to see the full list.'
              : shoppingMode
              ? "Nothing on the list right now. Mark items low from the Pantry tab and they'll appear here."
              : "Mark items low from the Pantry tab and they'll show up here when it's time to shop."
          }
        />
      ) : (
        <SectionList
          sections={routedShoppingSections}
          keyExtractor={(entry) => entry.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <StoreLogo
                name={section.title}
                size={28}
                domain={section.storeId ? stores.find((s) => s.id === section.storeId)?.brand_domain : undefined}
                logoUrl={section.storeId ? stores.find((s) => s.id === section.storeId)?.logo_url : undefined}
              />
              <View style={styles.sectionTitleWrap}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{section.data.length}</Text>
              </View>
            </View>
          )}
          renderItem={({ item: entry }) => {
            const sourceItem = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
            const storeName = sourceItem?.preferred_store_id
              ? stores.find((s) => s.id === sourceItem.preferred_store_id)?.name
              : null;
            const isTapping = tapping === entry.id;
            const purchased = purchasedIds.has(entry.id);
            const categoryLabel = CATEGORY_LABELS[normalizeShoppingCategory(entry.category)];

            function handleSetAisle() {
              void hapticSelection();
              Alert.prompt(
                'Store aisle',
                `Custom section for "${entry.name}" — e.g. "Aisle 7" or "Back wall".`,
                async (text) => {
                  const aisle = text?.trim() || null;
                  const prev = entry.aisle;
                  upsertEntry({ ...entry, aisle });
                  try {
                    await setShoppingEntryAisleWithQueue(entry.id, aisle);
                  } catch {
                    upsertEntry({ ...entry, aisle: prev });
                  }
                },
                'plain-text',
                entry.aisle ?? '',
              );
            }

            const qty = getQty(entry.id);
            const grabbedQty = purchasedQty.get(entry.id) ?? 1;

            return (
              <ScalePressable
                testID={groceryItemTestId(entry.name)}
                profile="card"
                style={[styles.row, shoppingMode && styles.rowShop, purchased && styles.rowPurchased]}
                onPress={shoppingMode && !purchased ? () => handleGotIt(entry, qty) : undefined}
                onLongPress={shoppingMode ? (storeName ? handleSetAisle : () => assignEntryToStore(entry)) : (sourceItem ? () => assignEntryToStore(entry) : undefined)}
                delayLongPress={400}
                disabled={shoppingMode ? isTapping : false}
              >
                <View style={[styles.lead, shoppingMode && styles.leadShop, isTapping && styles.leadTapping, purchased && styles.leadPurchased]}>
                  {isTapping ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : purchased ? (
                    <Ionicons name="checkmark" size={13} color={colors.surface} />
                  ) : null}
                </View>
                <View style={styles.itemEmojiWrap}>
                  <ItemThumbnail name={entry.name} category={entry.category} size={28} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.itemName, shoppingMode && styles.itemNameShop, purchased && styles.itemPurchased]}>
                    {entry.name}
                  </Text>
                  <Text style={[styles.itemMeta, purchased && styles.itemMetaPurchased]}>
                    {purchased
                      ? (grabbedQty > 1 ? `Grabbed ×${grabbedQty} ✓` : 'Grabbed ✓')
                      : storeName
                        ? `${categoryLabel} · ${storeName}`
                        : sourceItem
                          ? `${categoryLabel} · Hold to assign store`
                          : categoryLabel}
                  </Text>
                </View>
                {shoppingMode && !purchased && !storeName && sourceItem ? (
                  <ScalePressable
                    profile="chip"
                    style={styles.assignStoreChip}
                    onPress={() => assignEntryToStore(entry)}
                  >
                    <Text style={styles.assignStoreChipText}>Store</Text>
                  </ScalePressable>
                ) : purchased ? (
                  <View style={styles.qtyGrabbedBadge}>
                    <Text style={styles.qtyGrabbedText}>
                      {grabbedQty > 1 ? `×${grabbedQty}` : '✓'}
                    </Text>
                  </View>
                ) : shoppingMode ? (
                  <View style={styles.qtyPill}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => adjustQty(entry.id, -1)}
                      hitSlop={{ top: 10, bottom: 10, left: 6, right: 4 }}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.qtyBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyCount}>{qty}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => adjustQty(entry.id, +1)}
                      hitSlop={{ top: 10, bottom: 10, left: 4, right: 6 }}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </ScalePressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          stickySectionHeadersEnabled={false}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          windowSize={7}
        />
      )}

      <LiftAssignPanel
        item={assignItem}
        stores={stores}
        visible={!!assignItem}
        onAssign={(storeId) => { void assignStore(storeId); }}
        onClose={() => setAssignItem(null)}
      />

      <Modal
        visible={!!storeSpendSheet}
        transparent
        animationType="slide"
        onRequestClose={blockSpendSheetDismiss}
      >
        <KeyboardAvoidingView
          style={styles.keyboardSheetRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <TouchableWithoutFeedback onPress={blockSpendSheetDismiss}>
            <View style={styles.sheetOverlay} />
          </TouchableWithoutFeedback>
          <View style={[styles.spendSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHandle} />

            <View style={styles.spendHeader}>
              <View style={styles.spendHeaderLeft}>
                <Text style={[styles.spendStoreName, { color: colors.ink }]} numberOfLines={1}>
                  {storeSpendSheet?.storeName ?? 'Store'}
                </Text>
                <Text style={[styles.spendCompleteLabel, { color: colors.primary }]}>Stop complete</Text>
              </View>
              <ScalePressable
                profile="chip"
                style={[styles.spendCheckBadge, { backgroundColor: colors.primarySoft }]}
                onPress={() => { void hapticSuccess(); continueAfterStoreSpend(); }}
                disabled={savingStoreSpend}
              >
                <Ionicons name="checkmark" size={17} color={colors.primary} />
              </ScalePressable>
            </View>

            <View style={[styles.spendAmountRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.spendCurrencySymbol, { color: colors.primary }]}>$</Text>
              <TextInput
                value={storeSpendAmount}
                onChangeText={(t) => setStoreSpendAmount(t.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                keyboardType="default"
                returnKeyType="done"
                onSubmitEditing={saveStoreSpend}
                style={[styles.spendAmountInput, { color: colors.ink }]}
              />
            </View>
            <Text style={[styles.spendHintText, { color: colors.muted }]}>
              How much did you spend here? Save to continue — receipt photo is optional.
            </Text>

            <TouchableOpacity
              style={[styles.spendSaveBtn, { backgroundColor: colors.primary }]}
              onPress={saveStoreSpend}
              activeOpacity={0.85}
              disabled={savingStoreSpend}
            >
              {savingStoreSpend ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={[styles.spendSaveBtnText, { color: colors.onPrimary }]}>Save amount</Text>
              )}
            </TouchableOpacity>

            <View style={styles.spendReceiptRow}>
              <TouchableOpacity
                style={[styles.spendReceiptChip, { backgroundColor: colors.faint }]}
                onPress={() => uploadStoreReceipt('camera')}
                activeOpacity={0.8}
                disabled={savingStoreSpend}
              >
                <Ionicons name="camera-outline" size={15} color={colors.muted} />
                <Text style={[styles.spendReceiptChipText, { color: colors.muted }]}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.spendReceiptChip, { backgroundColor: colors.faint }]}
                onPress={() => uploadStoreReceipt('library')}
                activeOpacity={0.8}
                disabled={savingStoreSpend}
              >
                <Ionicons name="image-outline" size={15} color={colors.muted} />
                <Text style={[styles.spendReceiptChipText, { color: colors.muted }]}>Library</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.sheetGhost}
              onPress={() => continueAfterStoreSpend()}
              activeOpacity={0.7}
              disabled={savingStoreSpend}
            >
              <Text style={[styles.sheetGhostText, { color: colors.muted }]}>
                {storeSpendSheet?.nextStoreName
                  ? `Skip · next: ${storeSpendSheet.nextStoreName}`
                  : 'Skip for now'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={!!tripSheet}
        transparent
        animationType="slide"
        onRequestClose={closeTripSheet}
      >
        <TouchableWithoutFeedback onPress={closeTripSheet}>
          <View style={styles.sheetOverlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetEmoji]}>🛒</Text>
          <Text style={[styles.sheetTitle, { color: colors.ink }]}>Trip complete!</Text>
          <Text style={[styles.sheetSub, { color: colors.muted }]}>
            You grabbed {tripSheet?.itemCount ?? 0} {(tripSheet?.itemCount ?? 0) === 1 ? 'item' : 'items'} this run.
          </Text>

          <View style={styles.tripAnalyticsTab}>
            <Ionicons name="analytics-outline" size={14} color={colors.primary} />
            <Text style={styles.tripAnalyticsTabText}>Trip spending summary</Text>
          </View>

          <View style={[styles.spendRow, { backgroundColor: colors.primarySoft }]}>
            <View style={styles.spendCol}>
              <Text style={[styles.spendLabel, { color: colors.muted }]}>Trip total</Text>
              <Text style={[styles.spendValue, { color: colors.primaryDeep }]}>
                ${(tripSheet?.tripSpend ?? 0).toFixed(2)}
              </Text>
            </View>
            <View style={[styles.spendDivider, { backgroundColor: colors.border }]} />
            <View style={styles.spendCol}>
              <Text style={[styles.spendLabel, { color: colors.muted }]}>Budget left</Text>
              <Text style={[styles.spendValue, { color: colors.primaryDeep }]}>
                ${Math.max(0, weeklyBudget - (tripSheet?.tripSpend ?? 0)).toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.weeklySpendContext}>
            <Text style={[styles.spendLabel, { color: colors.muted }]}>Weekly spend</Text>
            <Text style={[styles.weeklySpendValue, { color: colors.muted }]}>
              ${(tripSheet?.weeklySpend ?? weeklySpend).toFixed(2)}
            </Text>
          </View>

          <Text style={[styles.sheetHint, { color: colors.muted }]}>
            {tripSheet?.receiptCount
              ? `${tripSheet.receiptCount} ${tripSheet.receiptCount === 1 ? 'receipt' : 'receipts'} logged this trip.`
              : 'Add a receipt photo or log spending from each store.'}
          </Text>

          <TouchableOpacity
            style={[styles.sheetPrimary, { backgroundColor: colors.primary }]}
            onPress={goToReceipts}
            activeOpacity={0.85}
          >
            <Ionicons name="receipt-outline" size={18} color={colors.onPrimary} />
            <Text style={[styles.sheetPrimaryText, { color: colors.onPrimary }]}>
              {tripSheet?.receiptCount ? 'Add another receipt' : 'Add receipt'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sheetGhost} onPress={closeTripSheet} activeOpacity={0.7}>
            <Text style={[styles.sheetGhostText, { color: colors.muted }]}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── "Are you done?" confirmation — gates the spend/receipt sheet ── */}
      <Modal
        visible={!!doneConfirmSheet}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setDoneConfirmSheet(null);
          setPendingReceiptStoreId(null);
        }}
      >
        <TouchableWithoutFeedback onPress={() => {
          setDoneConfirmSheet(null);
          setPendingReceiptStoreId(null);
        }}>
          <View style={styles.sheetOverlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.doneConfirmSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.doneConfirmTitle, { color: colors.ink }]}>
            Done at {doneConfirmSheet?.storeName}?
          </Text>
          <Text style={[styles.doneConfirmSubtitle, { color: colors.muted }]}>
            You can keep shopping or log this stop.
          </Text>
          <TouchableOpacity
            style={[styles.doneConfirmPrimary, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => {
              const sheet = doneConfirmSheet;
              setDoneConfirmSheet(null);
              if (sheet) openStoreSpendSheetDirect(sheet.storeId);
            }}
          >
            <Text style={[styles.doneConfirmPrimaryText, { color: colors.onPrimary }]}>
              Yes, finish stop
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetGhost}
            activeOpacity={0.7}
            onPress={() => {
              setDoneConfirmSheet(null);
              setPendingReceiptStoreId(null);
            }}
          >
            <Text style={[styles.sheetGhostText, { color: colors.muted }]}>Keep shopping</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Multi-store disambiguation — "Where are you shopping?" ── */}
      <Modal
        visible={ambiguousArrivals.length > 0}
        transparent
        animationType="slide"
        onRequestClose={() => setAmbiguousArrivals([])}
      >
        <TouchableWithoutFeedback onPress={() => setAmbiguousArrivals([])}>
          <View style={styles.sheetOverlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.disambigSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.disambigTitle, { color: colors.ink }]}>Where are you shopping?</Text>
          <Text style={[styles.disambigSubtitle, { color: colors.muted }]}>
            Multiple stores are nearby. Pick the one you're in.
          </Text>
          {ambiguousArrivals.map((sid) => {
            const s = stores.find((st) => st.id === sid);
            if (!s) return null;
            return (
              <TouchableOpacity
                key={sid}
                style={[styles.disambigOption, { backgroundColor: colors.faint }]}
                activeOpacity={0.8}
                onPress={() => {
                  setAmbiguousArrivals([]);
                  setActiveStore(sid);
                  setSelectedStoreChipId(sid);
                }}
              >
                <StoreLogo name={s.name} size={32} domain={s.brand_domain} logoUrl={s.logo_url} fallbackToAppIcon />
                <Text style={[styles.disambigOptionText, { color: colors.ink }]}>{normalizeStoreName(s.name)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.sheetGhost}
            activeOpacity={0.7}
            onPress={() => setAmbiguousArrivals([])}
          >
            <Text style={[styles.sheetGhostText, { color: colors.muted }]}>Not at any of these</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Start selector — "Where are you shopping?" (store-first session) ── */}
      <Modal
        visible={startSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setStartSheet(false)}
      >
        <TouchableWithoutFeedback onPress={() => setStartSheet(false)}>
          <View style={styles.sheetOverlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.disambigSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.disambigTitle, { color: colors.ink }]}>Where are you shopping?</Text>
          <Text style={[styles.disambigSubtitle, { color: colors.muted }]}>
            {startSheetStores.length > 0
              ? "Pick the store you're at — your trip will lock to it."
              : 'Start a shopping trip across all your items.'}
          </Text>
          {startSheetStores.map(({ store: s, count }) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.disambigOption, { backgroundColor: colors.faint }]}
              activeOpacity={0.8}
              onPress={() => beginShopping(s.id)}
            >
              <StoreLogo name={s.name} size={32} domain={s.brand_domain} logoUrl={s.logo_url} fallbackToAppIcon />
              <View style={{ flex: 1 }}>
                <Text style={[styles.disambigOptionText, { color: colors.ink }]}>{normalizeStoreName(s.name)}</Text>
                <Text style={[styles.disambigSubtitle, { color: colors.muted, marginBottom: 0 }]}>
                  {count} {count === 1 ? 'item' : 'items'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </TouchableOpacity>
          ))}
          {startSheetStores.length > 0 && (
            <TouchableOpacity
              style={[styles.disambigOption, { backgroundColor: colors.faint }]}
              activeOpacity={0.8}
              onPress={() => beginShopping(null)}
            >
              <Ionicons name="cart-outline" size={26} color={colors.primary} />
              <Text style={[styles.disambigOptionText, { color: colors.ink, flex: 1 }]}>Shop all items</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
          {startSheetStores.length === 0 && (
            <TouchableOpacity
              style={[styles.disambigOption, { backgroundColor: colors.faint }]}
              activeOpacity={0.8}
              onPress={() => beginShopping(null)}
            >
              <Ionicons name="cart-outline" size={26} color={colors.primary} />
              <Text style={[styles.disambigOptionText, { color: colors.ink, flex: 1 }]}>Start shopping</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.sheetGhost}
            activeOpacity={0.7}
            onPress={() => setStartSheet(false)}
          >
            <Text style={[styles.sheetGhostText, { color: colors.muted }]}>Not shopping right now</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 14,
    },
    headerLeft: { flex: 1, gap: 2 },
    eyebrow: { fontSize: 13, color: colors.primary, fontFamily: fonts.bodySemiBold },
    headerTitle: { fontSize: 26, fontFamily: fonts.displayExtraBoldItalic, color: colors.ink, letterSpacing: 0 },
    modeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 10,
      backgroundColor: colors.primary,
    },
    modeBtnActive: { backgroundColor: colors.surfaceDeep },
    modeBtnText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },
    modeBtnTextActive: { color: colors.surface },
    statusCard: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      padding: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    statusCardActive: { backgroundColor: colors.primarySoft },
    statusKicker: { fontSize: 13, color: colors.primary, fontFamily: fonts.bodySemiBold, marginBottom: 4 },
    statusKickerActive: { color: colors.primary },
    statusNumber: { fontSize: 38, lineHeight: 46, fontFamily: fonts.mono, color: colors.ink },
    statusNumberActive: { color: colors.primaryDeep },
    statusLabel: { fontSize: 14, color: colors.muted, fontFamily: fonts.bodyMedium },
    statusLabelActive: { color: colors.muted },
    statusNumberDim: { fontSize: 24, color: colors.muted, fontFamily: fonts.mono },
    statusRight: { alignItems: 'flex-end', gap: 9, flex: 1, maxWidth: 154 },
    storePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      alignSelf: 'flex-end',
    },
    storePillText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary, maxWidth: 100 },
    routePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.faint,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      alignSelf: 'flex-end',
    },
    routePillText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary },
    budgetSection: { alignItems: 'flex-end', gap: 4 },
    budgetTitle: { fontSize: 11, color: colors.muted, fontFamily: fonts.bodyMedium },
    budgetRow: { alignItems: 'flex-end', gap: 4 },
    tripAmount: { fontSize: 20, lineHeight: 24, color: colors.primaryDeep, fontFamily: fonts.monoMedium },
    budgetBar: {
      width: 110,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.faint,
      overflow: 'hidden',
    },
    budgetFill: { height: 6, borderRadius: 3 },
    budgetLabel: { fontSize: 11, color: colors.muted, fontFamily: fonts.bodyMedium },
    weeklyContext: { fontSize: 10, color: colors.muted, fontFamily: fonts.body, opacity: 0.82 },
    storeBar: { height: 50, flexGrow: 0, flexShrink: 0, backgroundColor: colors.background },
    storeBarContent: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
      alignItems: 'center',
      flexDirection: 'row',
    },
    routeCard: {
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingVertical: 12,
      gap: 10,
    },
    routeCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 14,
    },
    routeCardTitle: { fontSize: 14, color: colors.ink, fontFamily: fonts.bodySemiBold },
    routeSteps: { gap: 8, paddingHorizontal: 14 },
    routeStep: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    routeStepNumber: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      color: colors.primary,
      textAlign: 'center',
      fontSize: 11,
      lineHeight: 18,
      fontFamily: fonts.monoMedium,
      fontVariant: ['tabular-nums'],
    },
    routeStepText: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodySemiBold, maxWidth: 140 },
    unassignedBanner: {
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: radii.md,
      backgroundColor: colors.warningSoft,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    unassignedIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    unassignedBody: { flex: 1, minWidth: 0 },
    unassignedTitle: { fontSize: 14, color: colors.ink, fontFamily: fonts.bodySemiBold },
    unassignedSub: { fontSize: 12, color: colors.muted, fontFamily: fonts.body, marginTop: 1 },
    unassignedBtn: {
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 8,
      backgroundColor: colors.surface,
    },
    unassignedBtnText: { fontSize: 13, color: colors.warning, fontFamily: fonts.bodySemiBold },
    nextStopCard: {
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingVertical: 10,
      paddingRight: 12,
      paddingLeft: 11,
      gap: 8,
    },
    nextStopTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    nextStopIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextStopBody: { flex: 1, minWidth: 0 },
    nextStopKicker: { fontSize: 11, color: colors.primary, fontFamily: fonts.bodySemiBold },
    nextStopTitle: { fontSize: 15, color: colors.ink, fontFamily: fonts.bodySemiBold, marginTop: 1 },
    nextStopSub: { fontSize: 12, color: colors.muted, fontFamily: fonts.body, marginTop: 1 },
    nextStopActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    nextStopPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    nextStopPrimaryText: { color: colors.onPrimary, fontSize: 12, fontFamily: fonts.bodySemiBold },
    nextStopSecondary: {
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    nextStopSecondaryText: { color: colors.primary, fontSize: 12, fontFamily: fonts.bodySemiBold },
    nextStopGhost: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 7,
    },
    nextStopGhostText: { color: colors.muted, fontSize: 12, fontFamily: fonts.bodySemiBold },
    chip: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.faint,
    },
    chipActive: { backgroundColor: colors.primary },
    chipText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted },
    chipTextActive: { color: colors.onPrimary },
    list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
    separator: { height: 10 },
    sectionSeparator: { height: 10 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 14,
      paddingBottom: 10,
      paddingHorizontal: 2,
      backgroundColor: colors.background,
    },
    sectionIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    sectionTitleWrap: { flex: 1, minWidth: 0 },
    sectionStopLabel: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodySemiBold },
    sectionTitle: { fontSize: 22, color: colors.ink, fontFamily: fonts.displayItalic, letterSpacing: 0 },
    sectionBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 2,
    },
    sectionBadgeText: {
      fontSize: 12,
      fontFamily: fonts.monoMedium,
      color: colors.primary,
      fontVariant: ['tabular-nums'],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      gap: 12,
    },
    rowShop: { paddingVertical: 16, backgroundColor: colors.accentSoft },
    rowPurchased: {
      backgroundColor: colors.successSoft,
      opacity: 0.86,
    },
    lead: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    leadTapping: { borderColor: colors.primary },
    leadShop: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    leadPurchased: {
      borderColor: colors.success,
      backgroundColor: colors.success,
    },
    itemEmojiWrap: { width: 28, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1 },
    itemName: { fontSize: 16, color: colors.ink, fontFamily: fonts.bodyMedium },
    itemNameShop: { fontSize: 18 },
    itemPurchased: { textDecorationLine: 'line-through', color: colors.muted },
    itemMeta: { fontSize: 13, color: colors.muted, marginTop: 3, fontFamily: fonts.body },
    itemMetaPurchased: { color: colors.success, fontFamily: fonts.bodySemiBold },
    tapHint: { fontSize: 12, color: colors.muted, fontFamily: fonts.bodySemiBold },
    tapHintPurchased: { color: colors.success },
    // ── Quantity stepper (Sam's Club style) ────────────────────────────────
    qtyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 999,
      backgroundColor: colors.primarySoft,
      overflow: 'hidden',
    },
    qtyBtn: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qtyBtnText: {
      fontSize: 20,
      lineHeight: 22,
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
    },
    qtyCount: {
      minWidth: 22,
      textAlign: 'center',
      fontSize: 15,
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
    },
    qtyGrabbedBadge: {
      minWidth: 28,
      height: 28,
      borderRadius: 999,
      backgroundColor: colors.successSoft,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    qtyGrabbedText: {
      fontSize: 13,
      color: colors.success,
      fontFamily: fonts.bodySemiBold,
    },
    assignStoreChip: {
      borderRadius: 999,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.primary,
    },
    assignStoreChipText: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodySemiBold },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 48,
    },
    emptyIconWrap: {
      backgroundColor: colors.primarySoft,
      borderRadius: radii.xl,
      padding: 16,
      marginBottom: 8,
    },
    emptyTitle: { fontSize: 23, fontFamily: fonts.display, color: colors.ink },
    emptySub: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 23, fontFamily: fonts.body },

    sheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    keyboardSheetRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    /* Legacy sheet used by tripSheet modal */
    sheet: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 40,
      alignItems: 'center',
      gap: 12,
      ...shadow,
    },
    /* Redesigned spend sheet — sleek, half the height */
    spendSheet: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 22,
      paddingTop: 14,
      paddingBottom: 36,
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.14,
      shadowRadius: 20,
      elevation: 18,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 4,
      alignSelf: 'center',
    },
    spendHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    spendHeaderLeft: { flex: 1, minWidth: 0 },
    spendStoreName: {
      fontSize: 20,
      fontFamily: fonts.displayItalic,
      letterSpacing: 0,
    },
    spendCompleteLabel: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      marginTop: 1,
    },
    spendCheckBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    spendAmountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 4,
      marginTop: 2,
    },
    spendCurrencySymbol: {
      fontSize: 24,
      fontFamily: fonts.monoMedium,
      lineHeight: 52,
    },
    spendAmountInput: {
      flex: 1,
      fontSize: 48,
      fontFamily: fonts.mono,
      padding: 0,
      letterSpacing: -1,
    },
    spendHintText: {
      fontSize: 12,
      fontFamily: fonts.bodyMedium,
      marginTop: -2,
    },
    spendSaveBtn: {
      width: '100%',
      borderRadius: radii.md,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    spendSaveBtnText: {
      fontSize: 16,
      fontFamily: fonts.bodySemiBold,
      letterSpacing: 0.2,
    },
    spendReceiptRow: {
      flexDirection: 'row',
      gap: 8,
    },
    spendReceiptChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: radii.sm,
      paddingVertical: 11,
    },
    spendReceiptChipText: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
    },
    /* kept for legacy storeSpendAction refs — unused but avoids TS errors */
    storeCompleteIcon: { width: 0, height: 0 },
    storeSpendInputRow: { width: 0, height: 0 },
    storeSpendDollar: { fontSize: 0 },
    storeSpendInput: { fontSize: 0 },
    storeSpendActions: { flexDirection: 'row' },
    storeSpendAction: { flex: 1 },
    storeSpendActionText: { fontSize: 0 },
    sheetEmoji: { fontSize: 52, lineHeight: 64 },
    sheetTitle: { fontSize: 26, fontFamily: fonts.displayExtraBoldItalic, letterSpacing: 0 },
    sheetSub: { fontSize: 15, fontFamily: fonts.body, textAlign: 'center' },
    spendRow: {
      flexDirection: 'row',
      borderRadius: radii.lg,
      paddingVertical: 16,
      paddingHorizontal: 20,
      width: '100%',
      marginVertical: 4,
    },
    spendCol: { flex: 1, alignItems: 'center', gap: 4 },
    spendDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
    spendLabel: { fontSize: 12, fontFamily: fonts.bodyMedium },
    spendValue: { fontSize: 26, fontFamily: fonts.mono, letterSpacing: 0 },
    tripAnalyticsTab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'stretch',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: colors.faint,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    tripAnalyticsTabText: {
      color: colors.primary,
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      textAlign: 'center',
    },
    weeklySpendContext: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 6,
      marginTop: -2,
    },
    weeklySpendValue: { fontSize: 14, fontFamily: fonts.monoMedium },
    sheetHint: { fontSize: 13, fontFamily: fonts.body, textAlign: 'center', paddingHorizontal: 8 },
    sheetPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 999,
      paddingHorizontal: 28,
      paddingVertical: 14,
      width: '100%',
      justifyContent: 'center',
      marginTop: 4,
    },
    sheetPrimaryText: { fontSize: 16, fontFamily: fonts.bodySemiBold },
    sheetGhost: { paddingVertical: 10, paddingHorizontal: 20 },
    sheetGhostText: { fontSize: 14, fontFamily: fonts.bodySemiBold },
    // ── Done-confirmation sheet ──────────────────────────────────────────────
    doneConfirmSheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 24,
      paddingBottom: 36,
      paddingTop: 14,
      gap: 12,
      alignItems: 'center',
    },
    doneConfirmTitle: {
      fontSize: 22,
      fontFamily: fonts.displayExtraBoldItalic,
      letterSpacing: 0,
      textAlign: 'center',
      marginTop: 4,
    },
    doneConfirmSubtitle: {
      fontSize: 14,
      fontFamily: fonts.bodyMedium,
      textAlign: 'center',
      lineHeight: 20,
    },
    doneConfirmPrimary: {
      alignSelf: 'stretch',
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    doneConfirmPrimaryText: { fontSize: 16, fontFamily: fonts.bodySemiBold },
    // ── Multi-store disambiguation sheet ────────────────────────────────────
    disambigSheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingBottom: 36,
      paddingTop: 14,
      gap: 10,
      alignItems: 'center',
    },
    disambigTitle: {
      fontSize: 22,
      fontFamily: fonts.displayExtraBoldItalic,
      letterSpacing: 0,
      textAlign: 'center',
      marginTop: 4,
    },
    disambigSubtitle: {
      fontSize: 14,
      fontFamily: fonts.bodyMedium,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 4,
    },
    disambigOption: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    disambigOptionText: {
      flex: 1,
      fontSize: 16,
      fontFamily: fonts.bodySemiBold,
    },
  });
}
