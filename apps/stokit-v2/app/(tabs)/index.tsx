import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Logo } from '../../components/shared/Logo';
import { EmptyState } from '../../components/shared/EmptyState';
import { AddItemSheet } from '../../components/pantry/AddItemSheet';
import { ItemActionSheet } from '../../components/pantry/ItemActionSheet';
import { StorePickerSheet } from '../../components/pantry/StorePickerSheet';
import { JoinHouseholdSheet } from '../../components/household/JoinHouseholdSheet';
import { fonts, radii, shadow, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useHouseholdStore } from '../../store/household-store';
import { useTheme } from '../../hooks/useTheme';
import { classifyItem } from '../../core/services/itemClassifier';
import { searchPantryCatalog } from '../../constants/catalogSearch';
import type { PantryCatalogItem } from '../../constants/pantryCatalog';
import { fetchRawRecipes, reEvaluateRecipes } from '../../core/services/recipes';
import { RecipeSuggestionsCard } from '../../components/recipes/RecipeSuggestionsCard';
import { RecipeDetailSheet } from '../../components/recipes/RecipeDetailSheet';
import type { PantryItem, Store } from '../../types';
import { StoreChip } from '../../components/shared/ui';
import type { RecipeSuggestion, RawMealData } from '../../core/services/recipes';
import { ItemAvatar } from '../../components/shared/ItemAvatar';
import * as Updates from 'expo-updates';
import { OTA_SEQ } from '../../constants/version';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function relativeDayLabel(ts: number): string {
  const days = Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export default function PantryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const items = useDurableStore((state) => state.items);
  const stores = useDurableStore((state) => state.stores);
  const setItemStatus = useDurableStore((state) => state.setItemStatus);
  const deleteItem = useDurableStore((state) => state.deleteItem);
  const addItem = useDurableStore((state) => state.addItem);
  const updateItem = useDurableStore((state) => state.updateItem);
  const household = useHouseholdStore((s) => s.household);
  const members = useHouseholdStore((s) => s.members);
  const [addVisible, setAddVisible] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [actionItem, setActionItem] = useState<PantryItem | null>(null);
  const [pickerItem, setPickerItem] = useState<PantryItem | null>(null);
  const [recipes, setRecipes] = useState<RecipeSuggestion[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSuggestion | null>(null);
  const rawMealsRef = useRef<RawMealData[]>([]);
  const rawMealsKeyRef = useRef('');
  const [searchQuery, setSearchQuery] = useState('');

  const myName = members.find((m) => m.isMe)?.displayName ?? '';
  const firstName = (myName === 'Me' || myName === '') ? '' : myName.split(' ')[0];
  const greeting = `${getGreeting()}${firstName ? `, ${firstName}` : ''} 👋`;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const storeById = (id: string | null) => id ? stores.find((store) => store.id === id) : undefined;
  const listItems = useMemo(
    () => items.filter((item) => item.status === 'low' || item.status === 'expiring'),
    [items],
  );

  const atHomeItems = useMemo(
    () => items.filter((item) => item.status === 'stocked'),
    [items],
  );

  // Filtered views based on search query
  const query = searchQuery.trim().toLowerCase();
  const filteredListItems = useMemo(
    () => query ? listItems.filter((i) => i.name.toLowerCase().includes(query)) : listItems,
    [listItems, query],
  );
  const itemNameSet = useMemo(
    () => new Set(items.map((i) => i.name.toLowerCase())),
    [items],
  );
  const catalogSuggestions = useMemo((): PantryCatalogItem[] => {
    if (!query) return [];
    return searchPantryCatalog(query, 10)
      .filter((c) => !itemNameSet.has(c.name.toLowerCase()))
      .slice(0, 6);
  }, [query, itemNameSet]);

  const handleAddFromCatalog = (catalogItem: PantryCatalogItem) => {
    addItem({ name: catalogItem.name, quantity: 1, unit: catalogItem.defaultUnit, storeId: null, status: 'low' });
    setSearchQuery('');
    Keyboard.dismiss();
  };

  const handleAddCustom = () => {
    if (!searchQuery.trim()) return;
    addItem({ name: searchQuery.trim(), quantity: 1, unit: 'unit', storeId: null, status: 'low' });
    setSearchQuery('');
    Keyboard.dismiss();
  };

  const frequentBuys = useMemo(() => {
    if (query) return [];
    return [...atHomeItems]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 10);
  }, [atHomeItems, query]);

  // One-time prompt: if the user has a solo personal household (created automatically
  // on sign-up), offer to join a shared household. Only fires once per install.
  // Suppressed when a pending join is already queued (_layout.tsx will apply it).
  useEffect(() => {
    if (!household?.isPersonal) return;
    void (async () => {
      const [seen, pendingJoin] = await Promise.all([
        AsyncStorage.getItem('stokit:v2:onboarding:join-shown'),
        AsyncStorage.getItem('stokit:v2:pending-join'),
      ]);
      if (!seen && !pendingJoin) setJoinVisible(true);
    })();
  }, [household?.isPersonal]);

  useEffect(() => {
    let active = true;
    if (atHomeItems.length === 0) { setRecipes([]); return; }
    const recipeKey = atHomeItems
      .map((item) => item.name.trim().toLowerCase())
      .sort()
      .join('|');

    if (rawMealsRef.current.length > 0 && rawMealsKeyRef.current === recipeKey) {
      // Re-evaluate locally — same recipes, updated have/missing flags, no API call
      const updated = reEvaluateRecipes(rawMealsRef.current, atHomeItems);
      setRecipes(updated);
      // Keep open sheet in sync
      setSelectedRecipe((prev) => {
        if (!prev) return null;
        return updated.find((r) => r.id === prev.id) ?? null;
      });
    } else {
      // First load: fetch raw data from TheMealDB
      fetchRawRecipes(atHomeItems).then((raws) => {
        if (!active) return;
        rawMealsRef.current = raws;
        rawMealsKeyRef.current = recipeKey;
        setRecipes(reEvaluateRecipes(raws, atHomeItems));
      });
    }

    return () => { active = false; };
  }, [atHomeItems]);

  const totalCount = items.length;
  const lowCount = items.filter((item) => item.status === 'low').length;
  const expiringCount = items.filter((item) => item.status === 'expiring').length;
  const pantryHealth = Math.max(0, Math.min(100, 100 - (lowCount * 5) - (expiringCount * 10)));
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => b.createdAt - a.createdAt),
    [items],
  );
  const recentItems = showMore ? sortedItems : sortedItems.slice(0, 3);
  const recipeCards = recipes.slice(0, 5);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.topRow}>
            <View style={styles.wordmark}>
              <Logo size={28} color={colors.ink} />
              <Text style={styles.wordmarkText}>Stokit</Text>
            </View>
            <View style={styles.topRowRight}>
              <View style={styles.syncPill}>
                <Text style={styles.syncPillText}>
                  {Updates.updateId ? `v${OTA_SEQ}` : 'dev'}
                </Text>
              </View>
              <Pressable onPress={() => router.push('/settings')} style={styles.settings}>
                <Ionicons name="settings-outline" size={25} color={colors.primary} />
              </Pressable>
            </View>
          </View>
          <Text style={styles.title}>{greeting}</Text>
          <Text style={styles.tagline}>Here's what's happening in your household.</Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Pantry status</Text>
          </View>
          <View style={styles.healthCard}>
            <View>
              <Text style={styles.healthLabel}>Pantry Health</Text>
              <Text style={styles.healthSubtitle}>Based on stock and freshness</Text>
            </View>
            <Text style={styles.healthScore}>{pantryHealth}%</Text>
          </View>
          <View style={styles.statGrid}>
            <StatTile icon="cube-outline" value={totalCount} label="Total items" tone="green" styles={styles} />
            <StatTile icon="hourglass-outline" value={lowCount} label="Low stock" tone="gold" styles={styles} />
            <StatTile icon="warning-outline" value={expiringCount} label="Expiring soon" tone="rose" styles={styles} />
          </View>
        </View>

        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Cook with what you have</Text>
          <Pressable onPress={() => recipeCards[0] && setSelectedRecipe(recipeCards[0])} style={styles.linkButton}>
            <Text style={styles.linkText}>See ideas</Text>
            <Ionicons name="chevron-forward" size={15} color="#0B6B28" />
          </Pressable>
        </View>
        {recipeCards.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipeScroll}>
            {recipeCards.map((recipe) => (
              <Pressable
                key={recipe.id}
                onPress={() => setSelectedRecipe(recipe)}
                style={({ pressed }) => [styles.recipeCard, pressed && styles.pressed]}
              >
                {recipe.imageUrl ? (
                  <View style={styles.recipeImageWrap}>
                    <Image source={{ uri: recipe.imageUrl }} style={styles.recipeImage} resizeMode="cover" />
                  </View>
                ) : (
                  <View style={styles.recipeImageWrap}>
                    <Ionicons name="restaurant-outline" size={26} color="#0B6B28" />
                  </View>
                )}
                <Text style={styles.recipeName} numberOfLines={1}>{recipe.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.recipeEmpty}>
            <Ionicons name="restaurant-outline" size={20} color="#0B6B28" />
            <Text style={styles.recipeEmptyText}>Stock a few pantry items to unlock recipe ideas.</Text>
          </View>
        )}

        <View style={styles.bottomActions}>
          <Pressable onPress={() => setAddVisible(true)} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
            <Ionicons name="add" size={20} color="#0B6B28" />
            <Text style={styles.secondaryActionText}>Add item</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/shopping')} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
            <Ionicons name="cart" size={19} color="#FFF" />
            <Text style={styles.primaryActionText}>Plan shopping</Text>
          </Pressable>
        </View>

        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{showMore ? 'All items' : 'Recently added'}</Text>
          {totalCount > 3 && (
            <Pressable onPress={() => setShowMore((v) => !v)} style={styles.linkButton}>
              <Text style={styles.linkText}>{showMore ? 'Show less' : 'View all'}</Text>
              <Ionicons name={showMore ? 'chevron-up' : 'chevron-forward'} size={15} color="#0B6B28" />
            </Pressable>
          )}
        </View>
        <View style={styles.list}>
          {recentItems.length ? recentItems.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <Pressable
                onPress={() => { setSearchQuery(''); Keyboard.dismiss(); setActionItem(item); }}
                style={({ pressed }) => [styles.recentRow, pressed && styles.pressed]}
              >
                <ItemAvatar name={item.name} size={44} />
                <View style={styles.itemCopy}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>{relativeDayLabel(item.createdAt)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.inkSoft} />
              </Pressable>
            </View>
          )) : (
            <EmptyState
              icon="leaf-outline"
              title="Nothing in your pantry yet"
              body="Add your first item to start your dashboard."
            />
          )}
        </View>

        <View style={styles.dashboardSection}>
          <HouseholdBanner />
        </View>
        <View style={{ height: 110 }} />
      </ScrollView>

      <AddItemSheet
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        defaultStatus="low"
        quickAdd
        title="Add something to buy"
        subtitle="Select everything you need, then add it all at once."
      />
      <ItemActionSheet item={actionItem} store={storeById(actionItem?.storeId ?? null)} onClose={() => setActionItem(null)} onAssignStore={setPickerItem} />
      <StorePickerSheet item={pickerItem} onClose={() => setPickerItem(null)} />

      <JoinHouseholdSheet
        visible={joinVisible}
        onClose={() => {
          setJoinVisible(false);
          void AsyncStorage.setItem('stokit:v2:onboarding:join-shown', '1');
        }}
      />
      <RecipeDetailSheet
        recipe={selectedRecipe}
        onClose={() => setSelectedRecipe(null)}
        onAddMissing={(ingredients) => {
          ingredients.forEach((name) => addItem({ name, quantity: 1, unit: 'unit', storeId: null, status: 'low' }));
          setSelectedRecipe(null);
        }}
      />
    </SafeAreaView>
  );
}

function HouseholdBanner() {
  const { colors } = useTheme();
  const household = useHouseholdStore((s) => s.household);
  const members = useHouseholdStore((s) => s.members);
  const householdStyles = useMemo(() => stylesHousehold(colors), [colors]);

  if (!household || members.length === 0) return null;

  return (
      <View style={householdStyles.card}>
        <View style={householdStyles.header}>
        <Ionicons name="people-outline" size={15} color="#0B6B28" />
        <Text style={householdStyles.title}>{household.name}</Text>
        <Text style={householdStyles.count}>{members.length} member{members.length !== 1 ? 's' : ''}</Text>
      </View>
      {members.slice(0, 4).map((member, index) => (
        <View key={member.id}>
          {index > 0 ? <View style={householdStyles.divider} /> : null}
          <View style={householdStyles.memberRow}>
            <Text style={householdStyles.memberName} numberOfLines={1}>{member.isMe ? 'You' : member.displayName}</Text>
            <Text style={householdStyles.memberRole}>{member.role === 'owner' ? 'Owner' : 'Member'}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function stylesHousehold(colors: AppColors) {
  return StyleSheet.create({
    card: { backgroundColor: '#FBFCF8', padding: spacing.sm, borderRadius: radii.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: '#E5E8E1' },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
    title: { flex: 1, fontFamily: fonts.sansSemibold, color: colors.ink, fontSize: 14 },
    count: { fontFamily: fonts.mono, color: colors.muted, fontSize: 11, fontVariant: ['tabular-nums'] },
    divider: { height: 1, backgroundColor: colors.borderSoft },
    memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 6 },
    memberName: { flex: 1, fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 13 },
    memberRole: { fontFamily: fonts.sansSemibold, color: colors.muted, fontSize: 11 },
  });
}

function UseItOrLoseItWidget({ items, onUsed, onRestock }: {
  items: PantryItem[];
  onUsed: (item: PantryItem) => void;
  onRestock: (item: PantryItem) => void;
}) {
  const { colors } = useTheme();

  const oldest = useMemo(() => {
    if (items.length === 0) return null;
    return [...items].sort((a, b) => a.createdAt - b.createdAt)[0];
  }, [items]);

  if (!oldest) return null;

  const daysOld = Math.floor((Date.now() - oldest.createdAt) / (1000 * 60 * 60 * 24));
  if (daysOld < 5) return null;

  const ageLabel = daysOld === 1 ? '1 day in your pantry' : `${daysOld} days in your pantry`;

  return (
    <View style={{ backgroundColor: colors.warningSoft, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.warningSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.warning + '2E', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name="alert-circle-outline" size={22} color={colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.sansSemibold, color: colors.warning, fontSize: 15 }}>{oldest.name}</Text>
          <Text style={{ fontFamily: fonts.sans, color: colors.warning, fontSize: 12, marginTop: 1, opacity: 0.8 }}>{ageLabel} — use it or restock?</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          onPress={() => onUsed(oldest)}
          style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: radii.md, backgroundColor: colors.warning + '2E', opacity: pressed ? 0.7 : 1 })}
        >
          <Ionicons name="checkmark" size={15} color={colors.warning} />
          <Text style={{ fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.warning }}>Used it</Text>
        </Pressable>
        <Pressable
          onPress={() => onRestock(oldest)}
          style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: radii.md, backgroundColor: colors.warning + '2E', opacity: pressed ? 0.7 : 1 })}
        >
          <Ionicons name="cart-outline" size={15} color={colors.warning} />
          <Text style={{ fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.warning }}>Need more</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatTile({ icon, value, label, tone, styles }: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  tone: 'green' | 'gold' | 'rose';
  styles: ReturnType<typeof makeStyles>;
}) {
  const toneStyle = tone === 'green' ? styles.statGreen : tone === 'gold' ? styles.statGold : styles.statRose;
  const iconStyle = tone === 'green' ? styles.statIconGreen : tone === 'gold' ? styles.statIconGold : styles.statIconRose;
  return (
    <View style={[styles.statTile, toneStyle]}>
      <View style={[styles.statIcon, iconStyle]}>
        <Ionicons name={icon} size={14} color="#064E1F" />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.sectionTitleRow}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Pressable onPress={onAction} style={s.sectionActionButton}>
        <Text style={s.sectionAction}>{action}</Text>
        {action === 'View all' ? <Ionicons name="chevron-forward" size={17} color={colors.primary} /> : null}
      </Pressable>
    </View>
  );
}

function SimpleItemRow({
  item,
  store,
  action,
  onPress,
  onAction,
  onSwipeLeft,
  onSwipeRight,
  storeOptions,
  onAssignStore,
}: {
  item: PantryItem;
  store?: { name: string };
  action?: string;
  onPress: () => void;
  onAction?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  storeOptions?: Store[];
  onAssignStore?: (storeId: string) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const renderLeftActions = () => {
    if (!onSwipeRight) return null;
    return (
      <View style={s.swipeActionLeft}>
        <Ionicons name="cart-outline" size={24} color="#FFF" />
      </View>
    );
  };

  const renderRightActions = () => {
    if (!onSwipeLeft) return null;
    return (
      <View style={s.swipeActionRight}>
        <Ionicons name="trash-outline" size={24} color="#FFF" />
      </View>
    );
  };

  return (
    <Swipeable
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={(dir) => {
        if (dir === 'left' && onSwipeRight) onSwipeRight();
        if (dir === 'right' && onSwipeLeft) onSwipeLeft();
      }}
      containerStyle={{ overflow: 'hidden' }}
    >
      <View>
        <Pressable onPress={onPress} style={s.itemRow}>
          <ItemAvatar name={item.name} size={44} />
          <View style={s.itemCopy}>
            <Text style={s.itemName}>{item.name}</Text>
            <Text style={s.itemMeta}>
              {item.quantity > 1 ? `×${item.quantity}${store ? ' · ' : ''}` : ''}{store?.name ?? ''}
            </Text>
          </View>
          {action ? (
            <Pressable onPress={onAction ?? onPress} style={[s.itemAction, action === 'cart' && s.itemCartAction]}>
              <Ionicons name={action === 'cart' ? 'cart-outline' : 'add'} size={action === 'cart' ? 23 : 17} color={colors.primary} />
              {action === 'cart' ? null : <Text style={s.itemActionText}>{action}</Text>}
            </Pressable>
          ) : (
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          )}
        </Pressable>
        {!item.storeId && storeOptions && storeOptions.length > 0 && onAssignStore ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storeChipRow}>
            {storeOptions.map((st) => (
              <Pressable key={st.id} onPress={() => onAssignStore(st.id)} style={s.storeChipBtn}>
                <StoreChip store={st} size={32} />
                <Text style={s.storeChipName} numberOfLines={1}>{st.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Swipeable>
  );
}

function makeStyles(c: AppColors) {
  const green = '#0B6B28';
  const greenSoft = '#EEF7EC';
  const greenLine = '#CFE7D1';
  return StyleSheet.create({
    safe:             { flex: 1, backgroundColor: '#FFFDF8' },
    scroll:           { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
    header:           { flexDirection: 'column', paddingBottom: 28 },
    topRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    topRowRight:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
    wordmark:         { flexDirection: 'row', alignItems: 'center', gap: 7 },
    wordmarkText:     { fontFamily: fonts.sansSemibold, fontSize: 18, color: green },
    syncPill:         { backgroundColor: greenSoft, borderWidth: 1, borderColor: greenLine, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    syncPillText:     { fontFamily: fonts.mono, fontSize: 10, color: green, fontVariant: ['tabular-nums'] },
    greeting:         { fontFamily: fonts.sans, fontSize: 14, color: c.muted, marginBottom: 2 },
    title:            { fontFamily: fonts.serifItalic, fontSize: 29, lineHeight: 35, color: c.ink, marginBottom: 4 },
    tagline:          { fontFamily: fonts.sans, fontSize: 15, color: c.muted, fontVariant: ['tabular-nums'] },
    settings:         { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: greenLine, alignItems: 'center', justifyContent: 'center', ...shadow.card },
    pressed:          { opacity: 0.76 },
    statusCard:       { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E5E8E1', padding: spacing.md, marginBottom: spacing.lg, ...shadow.card },
    cardHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
    cardTitle:        { fontFamily: fonts.sansSemibold, fontSize: 16, color: c.ink },
    linkButton:       { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4 },
    disabledLinkButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, opacity: 0.45 },
    linkText:         { fontFamily: fonts.sansSemibold, fontSize: 13, color: green },
    healthCard:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radii.md, backgroundColor: greenSoft, borderWidth: 1, borderColor: greenLine, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md },
    healthLabel:      { fontFamily: fonts.sansSemibold, fontSize: 14, color: green },
    healthSubtitle:   { fontFamily: fonts.sans, fontSize: 12, color: c.muted, marginTop: 2 },
    healthScore:      { fontFamily: fonts.monoMedium, fontSize: 27, color: green, fontVariant: ['tabular-nums'] },
    statGrid:         { flexDirection: 'row', gap: spacing.sm },
    statTile:         { flex: 1, minHeight: 86, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
    statGreen:        { backgroundColor: '#EAF5E3' },
    statGold:         { backgroundColor: '#FFF3D5' },
    statRose:         { backgroundColor: '#FFE6DF' },
    statIcon:         { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    statIconGreen:    { backgroundColor: '#D7EDCD' },
    statIconGold:     { backgroundColor: '#FFE5A3' },
    statIconRose:     { backgroundColor: '#FFCFC2' },
    statValue:        { fontFamily: fonts.monoMedium, fontSize: 24, lineHeight: 28, color: c.ink, fontVariant: ['tabular-nums'] },
    statLabel:        { fontFamily: fonts.sansMedium, fontSize: 12, color: c.ink, marginTop: 2, textAlign: 'center' },
    recipeScroll:     { gap: spacing.md, paddingRight: spacing.xl, paddingBottom: spacing.sm },
    recipeCard:       { width: 118 },
    recipeImageWrap:  { width: '100%', height: 76, borderRadius: 13, overflow: 'hidden', backgroundColor: greenSoft, borderWidth: 1, borderColor: greenLine, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
    recipeImage:      { width: '100%', height: '100%' },
    recipeName:       { fontFamily: fonts.sansSemibold, fontSize: 13, color: c.ink },
    recipeEmpty:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: greenSoft, borderRadius: radii.md, padding: spacing.md, borderWidth: 1, borderColor: greenLine, marginBottom: spacing.md },
    recipeEmptyText:  { flex: 1, fontFamily: fonts.sansMedium, fontSize: 13, color: green },
    recentRow:        { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
    bottomActions:    { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.lg },
    secondaryAction:  { flex: 1, minHeight: 54, borderRadius: radii.md, backgroundColor: greenSoft, borderWidth: 1, borderColor: greenLine, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, ...shadow.card },
    secondaryActionText: { fontFamily: fonts.sansSemibold, fontSize: 16, color: green },
    primaryAction:    { flex: 1, minHeight: 54, borderRadius: radii.md, backgroundColor: green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, ...shadow.card },
    primaryActionText:{ fontFamily: fonts.sansSemibold, fontSize: 16, color: '#FFFFFF' },
    atHomeHeader:      { marginBottom: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.borderSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    atHomeTitle:       { fontFamily: fonts.sansSemibold, fontSize: 19, color: c.ink },
    atHomeCount:       { fontFamily: fonts.sans, fontSize: 13, color: c.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
    moreHeader:        { marginTop: spacing.xl, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    moreTitle:         { fontFamily: fonts.sansSemibold, fontSize: 18, color: c.ink },
    moreSubtitle:      { fontFamily: fonts.sans, fontSize: 13, color: c.muted, marginTop: 2 },
    dashboardSection:  { marginTop: spacing.md },
    searchBar:        { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: radii.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: spacing.sm, marginBottom: spacing.xs },
    searchInput:      { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: c.ink, padding: 0 },
    searchAddBtn:     { width: 32, height: 32, borderRadius: radii.pill, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.sm, flexShrink: 0 },
    catalogDropdown:  { backgroundColor: c.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.md, marginBottom: spacing.md, overflow: 'hidden', ...shadow.card },
    catalogRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, minHeight: 60 },
    catalogCopy:      { flex: 1 },
    catalogName:      { fontFamily: fonts.sansMedium, fontSize: 16, color: c.ink },
    catalogCategory:  { fontFamily: fonts.sans, fontSize: 12, color: c.muted, marginTop: 1 },
    catalogAddBtn:    { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    sectionTitleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.sm },
    sectionTitle:     { fontFamily: fonts.sansSemibold, fontSize: 18, color: c.ink },
    sectionActionButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: spacing.xs },
    sectionAction:    { fontFamily: fonts.sansSemibold, fontSize: 14, color: c.primary },
    list:             { backgroundColor: '#FFFFFF', borderRadius: radii.lg, borderWidth: 1, borderColor: '#E5E8E1', paddingHorizontal: spacing.md, overflow: 'hidden', ...shadow.card },
    divider:          { height: 1, backgroundColor: c.borderSoft, marginLeft: 50 },
    itemRow:          { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
    itemIcon:         { width: 44, height: 44, borderRadius: 13, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    itemEmoji:        { fontSize: 23 },
    itemCopy:         { flex: 1 },
    itemName:         { fontFamily: fonts.sansMedium, fontSize: 17, color: c.ink },
    itemMeta:         { fontFamily: fonts.mono, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 3, fontVariant: ['tabular-nums'] },
    itemAction:       { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 3 },
    itemCartAction:   { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 0, backgroundColor: c.surface },
    storeChipRow:     { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    storeChipBtn:     { alignItems: 'center', gap: 4, minWidth: 52 },
    storeChipName:    { fontFamily: fonts.sans, fontSize: 10, color: c.muted, maxWidth: 60, textAlign: 'center' },
    itemActionText:   { fontFamily: fonts.sansSemibold, fontSize: 12, color: c.primary },
    frequentSection:  { marginTop: spacing.md, marginBottom: spacing.sm },
    frequentTitle:    { fontFamily: fonts.sansSemibold, fontSize: 15, color: c.muted, marginBottom: spacing.sm, paddingHorizontal: 4 },
    frequentScroll:   { gap: spacing.md, paddingRight: spacing.xl },
    frequentItem:     { width: 70, alignItems: 'center', gap: 6 },
    frequentName:     { fontFamily: fonts.sansMedium, fontSize: 12, color: c.ink, textAlign: 'center' },
    frequentAddBtn:   { position: 'absolute', top: 0, right: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    swipeActionLeft:  { backgroundColor: c.success, justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 20, flex: 1 },
    swipeActionRight: { backgroundColor: c.danger, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20, flex: 1 },
    searchActionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radii.sm, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    searchActionText: { fontFamily: fonts.sansSemibold, fontSize: 11, color: c.primary },
    searchStatePill:  { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.sm, backgroundColor: c.primarySoft },
    searchStatePillText: { fontFamily: fonts.sansSemibold, fontSize: 11, color: c.primary },
  });
}
