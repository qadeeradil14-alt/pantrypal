import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, SectionList, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, Alert,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHouseholdStore } from '../../../store/household';
import { useAuthStore } from '../../../store/auth';
import { useItemsStore } from '../../../store/items';
import { useStoresStore } from '../../../store/stores';
import { addItemWithQueue, ensureDefaultItems, fetchItems, markItemOkWithQueue, updateItemDetailsWithQueue } from '../../../lib/items';
import { setItemStoreWithQueue, type Store } from '../../../lib/stores';
import { recordLocalOverride } from '../../../lib/realtime';
import { registerPushToken } from '../../../lib/notifications';
import { hapticError, hapticSelection, hapticSuccess } from '../../../lib/haptics';
import SwipeableItemRow from '../../../components/SwipeableItemRow';
import LiftAssignPanel from '../../../components/LiftAssignPanel';
import AddItemModal from '../../../components/AddItemModal';
import EmptyState from '../../../components/EmptyState';
import SyncStatusPill from '../../../components/SyncStatusPill';
import EditItemModal from '../../../components/EditItemModal';
import BarcodeScannerModal from '../../../components/BarcodeScannerModal';
import StoreLogo from '../../../components/StoreLogo';
import type { Item } from '../../../lib/items';
import type { BarcodeProduct } from '../../../lib/barcodes';
import { pantryStoreTargetTestId } from '../../../lib/testIds';
import ScalePressable from '../../../components/ScalePressable';
import { useTheme } from '../../../hooks/useTheme';
import type { AppColors } from '../../../constants/theme';
import { fonts } from '../../../constants/theme';

type SortMode = 'alpha' | 'category' | 'store';

interface PantrySection {
  title: string;
  data: Item[];
  key: string;
  count: number;
  isLow?: boolean;
  emoji?: string;
}

const CATEGORY_EMOJI: Record<string, string> = {
  produce: '🥬', vegetables: '🥦', vegetable: '🥦', fruits: '🍎', fruit: '🍎',
  dairy: '🥛', meat: '🥩', 'meat & seafood': '🥩', seafood: '🐟', fish: '🐟',
  bakery: '🍞', bread: '🍞', beverages: '🥤', beverage: '🥤', drinks: '🥤',
  snacks: '🍿', snack: '🍿', frozen: '🧊', canned: '🥫', 'canned goods': '🥫',
  grains: '🌾', grain: '🌾', 'grains & pasta': '🌾', pasta: '🍝', rice: '🍚',
  condiments: '🧂', condiment: '🧂', spices: '🌶️', 'herbs & spices': '🌶️',
  breakfast: '🥣', cereal: '🥣', legumes: '🫘', legume: '🫘', beans: '🫘',
  nuts: '🥜', nut: '🥜', oils: '🫙', oil: '🫙', sauces: '🍅', sauce: '🍅',
  sweets: '🍬', desserts: '🍰', baking: '🧁', eggs: '🥚', egg: '🥚',
  cleaning: '🧹', household: '🏠', 'personal care': '🧴', other: '📦',
};

function getCategoryEmoji(cat: string): string {
  return CATEGORY_EMOJI[cat.toLowerCase().trim()] ?? '🛒';
}

function getFirstName(email: string, metadata?: Record<string, any> | null): string {
  // Prefer Supabase user_metadata name fields
  const metaName: string | undefined =
    metadata?.full_name ?? metadata?.name ?? metadata?.first_name;
  if (metaName) {
    return metaName.split(' ')[0];
  }
  // Fall back to email local part: strip trailing digits, capitalise
  const local = email.split('@')[0].replace(/\d+$/, '');
  return local.charAt(0).toUpperCase() + local.slice(1) || 'there';
}

const STREAK_KEY = 'pantry_streak';
const STREAK_DATE_KEY = 'pantry_streak_date';
const NOTIF_PROMPT_KEY = 'pantrypal:notif:prompted:v1';

async function computeStreak(allStocked: boolean): Promise<number> {
  const today = new Date().toDateString();
  const storedDate = await AsyncStorage.getItem(STREAK_DATE_KEY);
  const storedStreak = parseInt((await AsyncStorage.getItem(STREAK_KEY)) ?? '0', 10);
  if (storedDate === today) return storedStreak;
  const yesterday = new Date(Date.now() - 864e5).toDateString();
  const newStreak = allStocked ? (storedDate === yesterday ? storedStreak + 1 : 1) : 0;
  await AsyncStorage.multiSet([[STREAK_KEY, String(newStreak)], [STREAK_DATE_KEY, today]]);
  return newStreak;
}

export default function PantryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { household } = useHouseholdStore();
  const { session } = useAuthStore();
  const { items, setItems, updateItem, upsertItem } = useItemsStore();
  const stores = useStoresStore((state) => state.stores);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [query, setQuery] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('category');
  const [liftedItem, setLiftedItem] = useState<Item | null>(null);
  const [streak, setStreak] = useState(0);
  // 'unknown' = not yet prompted, 'enabled' = user tapped Enable, 'declined' = user tapped Not now
  const [notifPromptState, setNotifPromptState] = useState<'unknown' | 'enabled' | 'declined' | 'loading'>('loading');
  const householdId = household?.id ?? null;
  const canAdd = !!householdId;

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const listRef = useRef<SectionList<Item>>(null);
  const storeTargetRefs = useRef<Record<string, any>>({});



  const load = useCallback(async () => {
    if (!householdId) { setItems([]); return; }
    let data = await fetchItems(householdId);
    if (data.length === 0) {
      const inserted = await ensureDefaultItems(householdId, session?.user.id);
      if (inserted > 0) data = await fetchItems(householdId);
    }
    setItems(data);
  }, [householdId, session?.user.id, setItems]);

  useEffect(() => {
    load()
      .catch(() => Alert.alert('Could not load items', 'Please try again.'))
      .finally(() => setLoading(false));
  }, [load]);


  // Check AsyncStorage to see if we've already asked about notifications.
  useEffect(() => {
    AsyncStorage.getItem(NOTIF_PROMPT_KEY).then((val) => {
      setNotifPromptState(val === 'enabled' ? 'enabled' : val === 'declined' ? 'declined' : 'unknown');
    }).catch(() => setNotifPromptState('unknown'));
  }, []);

  const handleEnableNotifs = useCallback(() => {
    if (!household?.id || !session?.user.id) return;
    setNotifPromptState('enabled');
    void AsyncStorage.setItem(NOTIF_PROMPT_KEY, 'enabled');
    void registerPushToken(household.id, session.user.id).catch(() => {});
  }, [household?.id, session?.user.id]);

  const handleDismissNotifPrompt = useCallback(() => {
    setNotifPromptState('declined');
    void AsyncStorage.setItem(NOTIF_PROMPT_KEY, 'declined');
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } catch { Alert.alert('Refresh failed', 'Please try again.'); }
    setRefreshing(false);
  }, [load]);

  const openScanner = useCallback(() => {
    void hapticSelection();
    if (!canAdd) {
      Alert.alert('Still loading', 'Please try again in a moment.');
      return;
    }
    setShowScanner(true);
  }, [canAdd]);

  const handleAddScannedProduct = useCallback(async (product: BarcodeProduct, expiresAt: string | null): Promise<'added' | 'updated'> => {
    if (!householdId) throw new Error('Household not ready.');

    const existing = items.find((item) => item.name.trim().toLowerCase() === product.name.trim().toLowerCase());
    if (existing) {
      const previous = {
        is_low: existing.is_low,
        marked_low_by: existing.marked_low_by,
        got_it_by: existing.got_it_by,
      };
      updateItem(existing.id, { is_low: false, marked_low_by: null, got_it_by: session?.user.id ?? null });
      try {
        await markItemOkWithQueue(existing.id);
        // Update expiry if provided
        if (expiresAt) {
          updateItem(existing.id, { expires_at: expiresAt });
          await updateItemDetailsWithQueue(existing.id, { expires_at: expiresAt }, existing.updated_at ?? new Date().toISOString()).catch(() => {});
        }
        return 'updated';
      } catch {
        updateItem(existing.id, previous);
        throw new Error('Could not update item.');
      }
    }

    const { item } = await addItemWithQueue(householdId, product.name, product.category, session?.user.id ?? '', null, expiresAt);
    upsertItem(item);
    return 'added';
  }, [householdId, items, session?.user.id, updateItem, upsertItem]);

  const q = useMemo(() => query.toLowerCase().trim(), [query]);

  const queryFiltered = useMemo(
    () => (q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items),
    [items, q],
  );

  const selectedStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId) ?? null,
    [stores, selectedStoreId],
  );

  const filtered = useMemo(
    () => queryFiltered
      .filter((item) => !selectedStoreId || item.preferred_store_id === selectedStoreId)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [queryFiltered, selectedStoreId],
  );

  const sections = useMemo((): PantrySection[] => {
    const lowItems = filtered.filter((i) => i.is_low).sort((a, b) => a.name.localeCompare(b.name));
    const normalItems = filtered.filter((i) => !i.is_low).sort((a, b) => a.name.localeCompare(b.name));
    const result: PantrySection[] = [];

    if (lowItems.length > 0) {
      result.push({ title: 'Needs attention', data: lowItems, key: '__low__', count: lowItems.length, isLow: true });
    }

    if (sortMode === 'alpha') {
      result.push({
        title: selectedStore ? selectedStore.name : 'My Groceries',
        data: normalItems,
        key: '__all__',
        count: normalItems.length,
      });
    } else if (sortMode === 'category') {
      const byCat = new Map<string, Item[]>();
      normalItems.forEach((item) => {
        const cat = item.category
          ? item.category.charAt(0).toUpperCase() + item.category.slice(1)
          : 'Other';
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat)!.push(item);
      });
      [...byCat.keys()]
        .sort((a, b) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b))
        .forEach((cat) => {
          result.push({
            title: cat,
            data: byCat.get(cat)!,
            key: `cat-${cat}`,
            count: byCat.get(cat)!.length,
            emoji: getCategoryEmoji(cat),
          });
        });
    } else {
      // store grouping
      const byStore = new Map<string, Item[]>();
      normalItems.forEach((item) => {
        const st = stores.find((s) => s.id === item.preferred_store_id);
        const key = st?.name ?? 'No store set';
        if (!byStore.has(key)) byStore.set(key, []);
        byStore.get(key)!.push(item);
      });
      [...byStore.keys()]
        .sort((a, b) => a === 'No store set' ? 1 : b === 'No store set' ? -1 : a.localeCompare(b))
        .forEach((storeName) => {
          result.push({
            title: storeName,
            data: byStore.get(storeName)!,
            key: `store-${storeName}`,
            count: byStore.get(storeName)!.length,
            emoji: storeName === 'No store set' ? '📍' : '🏪',
          });
        });
    }

    return result;
  }, [filtered, sortMode, selectedStore, stores]);

  const storeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      if (item.preferred_store_id) {
        counts.set(item.preferred_store_id, (counts.get(item.preferred_store_id) ?? 0) + 1);
      }
    });
    return counts;
  }, [items]);

  const firstName = useMemo(
    () => getFirstName(session?.user.email ?? 'there', session?.user.user_metadata),
    [session?.user.email, session?.user.user_metadata],
  );

  const allStocked = items.length > 0 && items.every((i) => !i.is_low);

  const expiringItems = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return items
      .filter((i) => i.expires_at && new Date(i.expires_at).getTime() - now <= sevenDays)
      .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime());
  }, [items]);

  // Guard: don't call computeStreak while items is still empty (initial load).
  // Without this guard, the pre-load empty-items state sets allStocked=false
  // and computeStreak zeroes the streak + stamps today's date, so the real
  // load that follows can never increment past 0.
  useEffect(() => {
    if (loading) return;
    computeStreak(allStocked).then(setStreak).catch(() => {});
  }, [allStocked, loading]);

  useEffect(() => {
    if (selectedStoreId && !stores.some((store) => store.id === selectedStoreId)) {
      setSelectedStoreId(null);
    }
  }, [selectedStoreId, stores]);

  const handleResetAll = useCallback(async () => {
    const lowOnes = items.filter((i) => i.is_low);
    if (lowOnes.length === 0) return;
    void hapticSelection();
    // Optimistic update
    lowOnes.forEach((item) => updateItem(item.id, { is_low: false, marked_low_by: null, got_it_by: null }));
    try {
      await Promise.all(lowOnes.map((item) => markItemOkWithQueue(item.id)));
      void hapticSuccess();
    } catch {
      // Restore on failure
      lowOnes.forEach((item) => updateItem(item.id, { is_low: item.is_low, marked_low_by: item.marked_low_by, got_it_by: item.got_it_by }));
      void hapticError();
    }
  }, [items, updateItem]);

  const assignItemToStore = useCallback(async (item: Item, storeId: string | null) => {
    const previousStoreId = item.preferred_store_id;
    // Register the override BEFORE updating Zustand so the realtime echo
    // that arrives a few hundred ms later doesn't revert our change.
    recordLocalOverride(item.id, { preferred_store_id: storeId });
    updateItem(item.id, { preferred_store_id: storeId });
    void hapticSelection();
    try {
      const result = await setItemStoreWithQueue(item.id, storeId);
      if (!result.queued) void hapticSuccess();
    } catch {
      updateItem(item.id, { preferred_store_id: previousStoreId });
      void hapticError();
    }
  }, [updateItem]);


  const handleItemAdded = useCallback((item: Item) => {
    setQuery('');
    if (selectedStoreId && item.preferred_store_id !== selectedStoreId) {
      setSelectedStoreId(item.preferred_store_id ?? null);
    }
  }, [selectedStoreId]);

  const storePicker = useMemo(() => (
    <View style={styles.storeSection}>
      <View style={styles.storeSectionHeader}>
        <Text style={styles.storeSectionTitle}>Stores</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        style={styles.storeScroll}
        contentContainerStyle={styles.storeRow}
        scrollEventThrottle={64}
      >
        {stores.length === 0 ? (
          <View style={styles.emptyStoreTarget}>
            <Text style={styles.emptyStoreText}>Add stores to assign groceries.</Text>
          </View>
        ) : (
          <>
            <Pressable
              testID={pantryStoreTargetTestId('all-groceries')}
              style={({ pressed }) => [
                styles.storeTarget,
                !selectedStoreId && styles.storeTargetActive,
                pressed && styles.storeTargetPressed,
              ]}
              onPress={() => {
                void hapticSelection();
                setSelectedStoreId(null);
              }}
            >
              <View style={styles.allStoreIcon}>
                <Ionicons name="list-outline" size={18} color={!selectedStoreId ? colors.primary : colors.muted} />
              </View>
              <Text style={styles.storeTargetName} numberOfLines={1}>All groceries</Text>
              <Text style={styles.storeTargetCount}>{items.length}</Text>
            </Pressable>
            {stores.map((store: Store) => {
              const active = selectedStoreId === store.id;
              return (
                <Pressable
                  key={store.id}
                  testID={pantryStoreTargetTestId(store.name)}
                  style={({ pressed }) => [
                    styles.storeTarget,
                    active && styles.storeTargetActive,
                    pressed && styles.storeTargetPressed,
                  ]}
                  onPress={() => {
                    void hapticSelection();
                    setSelectedStoreId(active ? null : store.id);
                  }}
                >
                  <StoreLogo name={store.name} size={34} domain={store.brand_domain} logoUrl={store.logo_url} />
                  <Text style={styles.storeTargetName} numberOfLines={1}>{store.name}</Text>
                  <Text style={styles.storeTargetCount}>{storeCounts.get(store.id) ?? 0}</Text>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  ), [styles, colors, stores, selectedStoreId, items.length, storeCounts]);

  const sortLabels: Record<SortMode, string> = { alpha: 'A–Z', category: 'Category', store: 'Store' };
  const sortIcons: Record<SortMode, React.ComponentProps<typeof Ionicons>['name']> = {
    alpha: 'text-outline',
    category: 'grid-outline',
    store: 'storefront-outline',
  };

  const listHeader = useMemo(() => (
    <>
      {/* Greeting first */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Hi, {firstName} 👋</Text>
          <Text style={styles.householdSub}>{household?.name ?? 'Your pantry'}</Text>
        </View>
        <View style={styles.headerStats}>
          <SyncStatusPill />
          {streak > 0 && (
            <View style={styles.statsRow}>
              <ScalePressable
                profile="chip"
                style={styles.streakPill}
                onPress={() => Alert.alert(
                  `🔥 ${streak}-day streak!`,
                  'You\'ve kept your pantry fully stocked for ' + streak + (streak === 1 ? ' day' : ' days') + ' in a row. Keep it up!',
                )}
              >
                <Text style={styles.streakText}>🔥 {streak}</Text>
              </ScalePressable>
            </View>
          )}
        </View>
      </View>

      {/* Notification nudge below greeting */}
      {notifPromptState === 'unknown' && (
        <View style={styles.notifCard}>
          <View style={styles.notifCardLeft}>
            <View style={styles.notifIconWrap}>
              <Ionicons name="notifications-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.notifCardBody}>
              <Text style={styles.notifCardTitle}>Stay stocked up</Text>
              <Text style={styles.notifCardSub}>Get a nudge when something runs low.</Text>
            </View>
          </View>
          <View style={styles.notifCardActions}>
            <ScalePressable profile="chip" style={styles.notifDismiss} onPress={handleDismissNotifPrompt}>
              <Text style={styles.notifDismissText}>Not now</Text>
            </ScalePressable>
            <ScalePressable style={styles.notifEnable} onPress={handleEnableNotifs}>
              <Text style={styles.notifEnableText}>Enable</Text>
            </ScalePressable>
          </View>
        </View>
      )}

      {expiringItems.length > 0 && (
        <View style={styles.expiryCard}>
          <View style={styles.expiryCardHeader}>
            <Ionicons name="time-outline" size={15} color={colors.danger} />
            <Text style={styles.expiryCardTitle}>Expiring soon</Text>
            <View style={styles.expiryBadge}>
              <Text style={styles.expiryBadgeText}>{expiringItems.length}</Text>
            </View>
          </View>
          {expiringItems.slice(0, 4).map((item) => {
            const daysLeft = Math.ceil((new Date(item.expires_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const urgent = daysLeft <= 2;
            return (
              <View key={item.id} style={styles.expiryRow}>
                <Text style={styles.expiryItemName} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.expiryDays, urgent && styles.expiryDaysUrgent]}>
                  {daysLeft <= 0 ? 'Expired' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft}d`}
                </Text>
              </View>
            );
          })}
          {expiringItems.length > 4 && (
            <Text style={styles.expiryMore}>+{expiringItems.length - 4} more</Text>
          )}
        </View>
      )}

      {storePicker}

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={colors.muted} />
        <TextInput
          testID="pantry-search-input"
          style={styles.searchInput}
          placeholder="Search groceries..."
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        <Pressable
          testID="pantry-barcode-scan-button"
          accessibilityRole="button"
          accessibilityLabel="Scan barcode"
          hitSlop={8}
          style={({ pressed }) => [
            styles.searchAction,
            !canAdd && styles.searchActionDisabled,
            pressed && canAdd && styles.searchActionPressed,
          ]}
          onPress={openScanner}
          disabled={!canAdd}
        >
          <Ionicons name="barcode-outline" size={18} color={canAdd ? colors.primary : colors.muted} />
        </Pressable>
      </View>

      <View style={styles.masterHeader}>
        <Text style={styles.masterTitle} numberOfLines={1}>
          {selectedStore ? selectedStore.name : 'My Groceries'}
        </Text>
        <View style={styles.sortRow}>
          {(['alpha', 'category', 'store'] as SortMode[]).map((mode) => {
            const active = sortMode === mode;
            return (
              <Pressable
                key={mode}
                hitSlop={6}
                style={[styles.sortPill, active && styles.sortPillActive]}
                onPress={() => { void hapticSelection(); setSortMode(mode); }}
              >
                {mode !== 'alpha' && <Ionicons name={sortIcons[mode]} size={12} color={active ? colors.primary : colors.muted} />}
                <Text style={[styles.sortPillText, active && styles.sortPillTextActive]}>{sortLabels[mode]}</Text>
              </Pressable>
            );
          })}
          <Pressable
            hitSlop={6}
            style={styles.addChip}
            onPress={() => {
              void hapticSelection();
              if (!canAdd) { Alert.alert('Still loading', 'Please try again in a moment.'); return; }
              setShowAdd(true);
            }}
            disabled={!canAdd}
          >
            <Ionicons name="add" size={12} color={colors.muted} />
            <Text style={styles.addChipText}>Add</Text>
          </Pressable>
        </View>
      </View>
    </>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [firstName, household?.name, styles, colors, filtered.length, query, streak, notifPromptState, handleEnableNotifs, handleDismissNotifPrompt, selectedStore, canAdd, openScanner, storePicker, sortMode, expiringItems]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        extraData={items}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <SwipeableItemRow
            item={item}
            userId={session?.user.id ?? ''}
            onEditPress={setEditingItem}
            onLiftPress={setLiftedItem}
          />
        )}
        renderSectionHeader={({ section }) => {
          const s = section as unknown as PantrySection;
          if (s.isLow) {
            return (
              <View style={styles.needsAttentionHeader}>
                <Ionicons name="cart-outline" size={16} color={colors.warning} />
                <Text style={styles.needsAttentionTitle}>Grab These</Text>
                <View style={styles.needsAttentionBadge}>
                  <Text style={styles.needsAttentionBadgeText}>{s.count}</Text>
                </View>
                <Pressable
                  hitSlop={10}
                  style={({ pressed }) => [styles.resetAllBtn, pressed && { opacity: 0.65 }]}
                  onPress={handleResetAll}
                >
                  <Ionicons name="refresh-outline" size={11} color={colors.warning} />
                  <Text style={styles.resetAllText}>Reset all</Text>
                </Pressable>
                <Pressable
                  hitSlop={10}
                  style={({ pressed }) => [styles.shopBtn, pressed && { opacity: 0.65 }]}
                  onPress={() => { void hapticSelection(); router.push('/(main)/grocery'); }}
                >
                  <Ionicons name="cart-outline" size={11} color={colors.primary} />
                  <Text style={styles.shopBtnText}>Shop</Text>
                </Pressable>
              </View>
            );
          }
          if (sortMode === 'alpha') return null;
          return (
            <View style={styles.categorySectionHeader}>
              {s.emoji ? <Text style={styles.sectionEmoji}>{s.emoji}</Text> : null}
              <Text style={styles.categorySectionTitle}>{s.title}</Text>
              <Text style={styles.categorySectionCount}>{s.count}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            emoji={q ? '🔍' : '🌿'}
            title={q ? `No results for "${query}"` : selectedStore ? `Nothing for ${selectedStore.name}` : 'Nothing here yet'}
            subtitle={q ? 'Try a different search term.' : selectedStore ? 'Add a grocery to this store or return to the full list.' : 'Add the first item your household uses regularly.'}
            action={q
              ? undefined
              : {
                label: selectedStore ? `Add to ${selectedStore.name}` : 'Add first item',
                onPress: () => { void hapticSelection(); setShowAdd(true); },
              }}
          />
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
      />


      {showAdd && household?.id && (
        <AddItemModal
          householdId={household.id}
          userId={session?.user.id ?? ''}
          initialStoreId={selectedStoreId ?? undefined}
          onAdded={handleItemAdded}
          onClose={() => setShowAdd(false)}
        />
      )}

      <BarcodeScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onAddProduct={handleAddScannedProduct}
        onManualAdd={() => {
          setShowScanner(false);
          setShowAdd(true);
        }}
      />

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}

      <LiftAssignPanel
        item={liftedItem}
        stores={stores}
        visible={liftedItem !== null}
        onAssign={(storeId) => {
          if (liftedItem) void assignItemToStore(liftedItem, storeId);
          setLiftedItem(null);
        }}
        onClose={() => setLiftedItem(null)}
      />
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { paddingHorizontal: 16, paddingBottom: 120 },
    separator: { height: 8 },

    notifCard: {
      marginHorizontal: 0,
      marginTop: 14,
      marginBottom: 4,
      borderRadius: 20,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary + '33',
      padding: 14,
      gap: 10,
    },
    notifCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    notifIconWrap: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    notifCardBody: { flex: 1 },
    notifCardTitle: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.ink },
    notifCardSub: { fontSize: 13, color: colors.muted, fontFamily: fonts.body, marginTop: 1 },
    notifCardActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
    notifDismiss: {
      borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: colors.surface,
    },
    notifDismissText: { fontSize: 13, color: colors.muted, fontFamily: fonts.bodySemiBold },
    notifEnable: {
      borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8,
      backgroundColor: colors.primary,
    },
    notifEnableText: { fontSize: 13, color: colors.surface, fontFamily: fonts.bodySemiBold },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingTop: 12,
      paddingBottom: 12,
    },
    headerLeft: { flex: 1, gap: 2, paddingRight: 12 },
    headerStats: { flexDirection: 'column', alignItems: 'flex-end', gap: 6 },
    statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    streakPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: colors.warningSoft,
    },
    streakText: { fontSize: 13, fontFamily: fonts.monoMedium, color: colors.warning, fontVariant: ['tabular-nums'] },
    greeting: { fontSize: 26, fontFamily: fonts.displayExtraBoldItalic, color: colors.ink, letterSpacing: 0 },
    householdSub: { fontSize: 14, color: colors.muted, fontFamily: fonts.bodyMedium },

    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: 0,
      marginBottom: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      gap: 8,
    },
    searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.ink, fontFamily: fonts.body },
    searchAction: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    searchActionPressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
    searchActionDisabled: { backgroundColor: colors.faint },

    storeSection: { marginBottom: 14, marginHorizontal: -16 },
    storeSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      paddingHorizontal: 16,
    },
    storeSectionTitle: { fontSize: 22, fontFamily: fonts.displayItalic, color: colors.ink, letterSpacing: 0 },
    storeSectionHint: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.muted },
    storeScroll: { flexGrow: 0 },
    storeRow: { flexDirection: 'row', gap: 8, paddingLeft: 16, paddingRight: 16 },
    storeTarget: {
      width: 112,
      height: 96,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      gap: 5,
    },
    storeTargetActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    storeTargetPressed: { opacity: 0.86 },
    allStoreIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    storeTargetName: { fontSize: 12, lineHeight: 15, fontFamily: fonts.bodySemiBold, color: colors.ink },
    storeTargetCount: {
      alignSelf: 'flex-start',
      minWidth: 22,
      textAlign: 'center',
      borderRadius: 999,
      overflow: 'hidden',
      paddingHorizontal: 6,
      paddingVertical: 1,
      backgroundColor: colors.primarySoft,
      color: colors.primary,
      fontSize: 11,
      fontFamily: fonts.monoMedium,
      fontVariant: ['tabular-nums'],
    },
    emptyStoreTarget: {
      minHeight: 74,
      minWidth: 240,
      justifyContent: 'center',
      borderRadius: 18,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      paddingHorizontal: 16,
      backgroundColor: colors.surface,
    },
    emptyStoreText: { fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.muted },
    masterHeader: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 14,
    },
    masterTitle: { fontSize: 22, fontFamily: fonts.displayExtraBoldItalic, color: colors.ink, letterSpacing: 0 },

    // Sort toggle
    sortRow: {
      flexDirection: 'row',
      gap: 6,
    },
    sortPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sortPillActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    sortPillText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.muted },
    sortPillTextActive: { color: colors.primary },
    addChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    addChipText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.muted },

    // Section headers
    needsAttentionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingVertical: 10,
      paddingHorizontal: 2,
      backgroundColor: colors.background,
    },
    needsAttentionTitle: {
      flex: 1,
      fontSize: 15,
      fontFamily: fonts.bodySemiBold,
      color: colors.warning,
    },
    needsAttentionBadge: {
      backgroundColor: colors.warningSoft,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    needsAttentionBadgeText: {
      fontSize: 12,
      fontFamily: fonts.monoMedium,
      color: colors.warning,
      fontVariant: ['tabular-nums'],
    },
    resetAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: colors.warningSoft,
      borderWidth: 1,
      borderColor: colors.warning + '35',
    },
    resetAllText: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      color: colors.warning,
    },
    shopBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary + '35',
    },
    shopBtnText: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      color: colors.primary,
    },
    expiryCard: {
      marginTop: 14,
      marginBottom: 4,
      borderRadius: 20,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.danger + '33',
      padding: 14,
      gap: 8,
    },
    expiryCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginBottom: 2,
    },
    expiryCardTitle: {
      flex: 1,
      fontSize: 14,
      fontFamily: fonts.bodySemiBold,
      color: colors.ink,
    },
    expiryBadge: {
      backgroundColor: colors.danger + '22',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    expiryBadgeText: {
      fontSize: 11,
      fontFamily: fonts.monoMedium,
      color: colors.danger,
      fontVariant: ['tabular-nums'],
    },
    expiryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 3,
    },
    expiryItemName: {
      flex: 1,
      fontSize: 13,
      fontFamily: fonts.bodyMedium,
      color: colors.ink,
    },
    expiryDays: {
      fontSize: 12,
      fontFamily: fonts.monoMedium,
      color: colors.muted,
      fontVariant: ['tabular-nums'],
    },
    expiryDaysUrgent: {
      color: colors.danger,
    },
    expiryMore: {
      fontSize: 12,
      fontFamily: fonts.body,
      color: colors.muted,
      marginTop: 2,
    },
    categorySectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingVertical: 10,
      paddingHorizontal: 2,
      backgroundColor: colors.background,
    },
    sectionEmoji: { fontSize: 15 },
    categorySectionTitle: {
      flex: 1,
      fontSize: 22,
      fontFamily: fonts.displayItalic,
      color: colors.ink,
      letterSpacing: 0,
    },
    categorySectionCount: {
      fontSize: 12,
      fontFamily: fonts.monoMedium,
      color: colors.muted,
      fontVariant: ['tabular-nums'],
    },

    filterScroll: {
      marginBottom: 20,
      flexGrow: 0,
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingRight: 8,
    },
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      position: 'relative',
    },
    filterPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterPillEmoji: { fontSize: 14 },
    filterPillText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.ink },
    filterPillTextActive: { color: colors.surface },
    filterPillCount: {
      fontSize: 12,
      fontFamily: fonts.monoMedium,
      fontVariant: ['tabular-nums'],
      color: colors.muted,
      backgroundColor: colors.faint,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 1,
      minWidth: 20,
      textAlign: 'center',
    },
    filterPillCountActive: {
      color: colors.primary,
      backgroundColor: 'rgba(255,255,255,0.25)',
    },
    filterLowDot: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.warning,
    },

    section: { marginHorizontal: 0, marginBottom: 20 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    sectionIcon: { fontSize: 15 },
    sectionTitle: { fontSize: 17, fontFamily: fonts.displayItalic, color: colors.ink, flex: 1, letterSpacing: 0 },
    sectionBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 2,
    },
    sectionBadgeText: { fontSize: 12, fontFamily: fonts.monoMedium, color: colors.primary, fontVariant: ['tabular-nums'] },

    lowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      marginBottom: 8,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    lowCardEmoji: { fontSize: 26 },
    lowCardContent: { flex: 1 },
    lowCardName: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.ink },
    lowCardCat: { fontSize: 13, color: colors.muted, marginTop: 2, fontFamily: fonts.body },
    gotItBtn: {
      backgroundColor: colors.primary,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    gotItText: { color: colors.surface, fontSize: 13, fontFamily: fonts.bodySemiBold },

    listSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 0,
      paddingTop: 14,
      paddingBottom: 8,
      backgroundColor: colors.background,
    },
    listSectionEmoji: { fontSize: 15 },
    listSectionTitle: { fontSize: 20, fontFamily: fonts.displayItalic, color: colors.ink, flex: 1, letterSpacing: 0 },
    listSectionCount: { fontSize: 13, color: colors.muted, fontFamily: fonts.mono, fontVariant: ['tabular-nums'] },
    lowBadge: {
      backgroundColor: colors.warningSoft,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    lowBadgeText: { fontSize: 11, color: colors.warning, fontFamily: fonts.bodySemiBold },

    empty: {
      paddingTop: 48,
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 40,
    },
    emptyEmoji: { fontSize: 52 },
    emptyTitle: { fontSize: 20, fontFamily: fonts.display, color: colors.ink, textAlign: 'center' },
    emptySub: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22, fontFamily: fonts.body },

  });
}
