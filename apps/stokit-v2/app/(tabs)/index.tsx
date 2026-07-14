import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  LayoutAnimation,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Logo } from '../../components/shared/Logo';
import { EmptyState } from '../../components/shared/EmptyState';
import { MemberAvatars } from '../../components/shared/MemberAvatars';
import { SummaryCard } from '../../components/shared/SummaryCard';
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
import type { PantryItem, } from '../../types';
import type { RecipeSuggestion, RawMealData } from '../../core/services/recipes';
import { ItemAvatar } from '../../components/shared/ItemAvatar';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function PantryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const items = useDurableStore((state) => state.items);
  const stores = useDurableStore((state) => state.stores);
  const setItemStatus = useDurableStore((state) => state.setItemStatus);
  const deleteItem = useDurableStore((state) => state.deleteItem);
  const addItem = useDurableStore((state) => state.addItem);
  const household = useHouseholdStore((s) => s.household);
  const members = useHouseholdStore((s) => s.members);
  const [addVisible, setAddVisible] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showAtHome, setShowAtHome] = useState(false);
  const [actionItem, setActionItem] = useState<PantryItem | null>(null);
  const [pickerItem, setPickerItem] = useState<PantryItem | null>(null);
  const [recipes, setRecipes] = useState<RecipeSuggestion[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSuggestion | null>(null);
  const rawMealsRef = useRef<RawMealData[]>([]);
  const rawMealsKeyRef = useRef('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const dashboardSectionY = useRef(0);

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

  const shoppingCount = listItems.length;
  const pantryCount = atHomeItems.length;
  const expiringCount = useMemo(
    () => listItems.filter((item) => item.status === 'expiring').length,
    [listItems],
  );
  const storeCount = useMemo(
    () => new Set(listItems.filter((item) => item.storeId).map((item) => item.storeId)).size,
    [listItems],
  );

  // Filtered views based on search query
  const query = searchQuery.trim().toLowerCase();
  const filteredListItems = useMemo(
    () => query ? listItems.filter((i) => i.name.toLowerCase().includes(query)) : listItems,
    [listItems, query],
  );
  const filteredAtHomeItems = useMemo(
    () => query ? atHomeItems.filter((i) => i.name.toLowerCase().includes(query)) : atHomeItems,
    [atHomeItems, query],
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
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    addItem({ name: catalogItem.name, quantity: 1, unit: catalogItem.defaultUnit, storeId: null, status: 'low' });
    setSearchQuery('');
    Keyboard.dismiss();
  };

  const handleAddCustom = () => {
    if (!searchQuery.trim()) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    addItem({ name: searchQuery.trim(), quantity: 1, unit: 'unit', storeId: null, status: 'low' });
    setSearchQuery('');
    Keyboard.dismiss();
  };

  const animatedSetStatus = (id: string, status: 'stocked' | 'low') => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItemStatus(id, status);
  };

  const animatedDelete = (id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    deleteItem(id);
  };

  // One-time prompt: if the user has a solo personal household (created automatically
  // on sign-up), offer to join a shared household. Only fires once per install.
  useEffect(() => {
    if (!household?.isPersonal) return;
    AsyncStorage.getItem('stokit:v2:onboarding:join-shown').then((seen) => {
      if (!seen) setJoinVisible(true);
    });
  }, [household?.isPersonal]);

  useEffect(() => {
    let active = true;
    if (atHomeItems.length === 0) { setRecipes([]); return; }
    const recipeKey = atHomeItems
      .map((item) => `${item.id}:${item.updatedAt}`)
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
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          {/* Top row: logo + sync pill + settings */}
          <View style={styles.topRow}>
            <View style={styles.wordmark}>
              <Logo size={28} color={colors.ink} />
              <Text style={styles.wordmarkText}>Stokit</Text>
            </View>
            <View style={styles.topRowRight}>
              <MemberAvatars members={members} onPress={() => router.push('/household')} />
              <Pressable onPress={() => router.push('/settings')} style={styles.settings} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                <Ionicons name="settings-outline" size={24} color={colors.primary} />
              </Pressable>
            </View>
          </View>
          {/* Greeting — 20px below the logo row */}
          <Text style={styles.title}>{greeting}</Text>
          <Text style={styles.tagline}>
            {items.length === 0 ? 'Add your first item to get started' : "Here's your household at a glance"}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <SummaryCard
            icon="cart"
            tone="surface"
            label="Shopping list"
            value={shoppingCount}
            sublabel={storeCount > 0 ? `${storeCount} store${storeCount === 1 ? '' : 's'} assigned` : 'No stores assigned'}
            badge={expiringCount > 0 ? { label: `${expiringCount} expiring`, tone: 'danger' } : undefined}
            onPress={() => router.push('/shopping')}
          />
          <SummaryCard
            icon="home"
            tone="surface"
            label="At home"
            value={pantryCount}
            sublabel={pantryCount === 1 ? '1 item stocked' : `${pantryCount} items stocked`}
            onPress={() => {
              setShowMore(true);
              setShowAtHome(true);
              requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ y: dashboardSectionY.current, animated: true });
              });
            }}
          />
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={query ? colors.primary : colors.muted} style={{ marginRight: 8 }} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search or add anything…"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            clearButtonMode="while-editing"
            onSubmitEditing={handleAddCustom}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add item"
            accessibilityHint="Opens the add item form"
            hitSlop={4}
            onPress={() => setAddVisible(true)}
            style={styles.searchAddButton}
          >
            <Ionicons name="add" size={22} color={colors.onPrimary} />
          </Pressable>
        </View>

        {query ? (
          <View style={styles.catalogDropdown}>
            {catalogSuggestions.length > 0 && (
              <>
                {catalogSuggestions.map((c, i) => (
                  <View key={c.id}>
                    {i > 0 && <View style={styles.divider} />}
                    <Pressable
                      style={({ pressed }) => [styles.catalogRow, pressed && styles.pressed]}
                      onPress={() => handleAddFromCatalog(c)}
                    >
                      <ItemAvatar name={c.name} size={40} />
                      <View style={styles.catalogCopy}>
                        <Text style={styles.catalogName}>{c.name}</Text>
                        <Text style={styles.catalogCategory}>{c.category}</Text>
                      </View>
                      <View style={styles.catalogAddBtn}>
                        <Ionicons name="add" size={20} color={colors.primary} />
                      </View>
                    </Pressable>
                  </View>
                ))}
                {(filteredListItems.length > 0 || filteredAtHomeItems.length > 0) && (
                  <View style={[styles.divider, { marginLeft: 0, marginTop: 4 }]} />
                )}
              </>
            )}
            {filteredListItems.map((item) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [styles.catalogRow, pressed && styles.pressed]}
                onPress={() => { setSearchQuery(''); Keyboard.dismiss(); setActionItem(item); }}
              >
                <ItemAvatar name={item.name} size={40} />
                <View style={styles.catalogCopy}>
                  <Text style={styles.catalogName}>{item.name}</Text>
                  <Text style={styles.catalogCategory}>On your list</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
            {filteredAtHomeItems.map((item) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [styles.catalogRow, pressed && styles.pressed]}
                onPress={() => { setSearchQuery(''); Keyboard.dismiss(); setActionItem(item); }}
              >
                <ItemAvatar name={item.name} size={40} />
                <View style={styles.catalogCopy}>
                  <Text style={styles.catalogName}>{item.name}</Text>
                  <Text style={styles.catalogCategory}>At home</Text>
                </View>
                <Pressable
                  onPress={() => { setSearchQuery(''); Keyboard.dismiss(); setItemStatus(item.id, 'low'); }}
                  hitSlop={8}
                  style={styles.catalogListButton}
                >
                  <Ionicons name="cart-outline" size={15} color={colors.primary} />
                  <Text style={styles.catalogListButtonText}>Add</Text>
                </Pressable>
              </Pressable>
            ))}
            {catalogSuggestions.length === 0 && filteredListItems.length === 0 && filteredAtHomeItems.length === 0 && (
              <Pressable
                style={({ pressed }) => [styles.catalogRow, pressed && styles.pressed]}
                onPress={handleAddCustom}
              >
                <View style={[styles.catalogAddBtn, { backgroundColor: colors.primarySoft, width: 40, height: 40, borderRadius: 12 }]}>
                  <Ionicons name="add" size={22} color={colors.primary} />
                </View>
                <View style={styles.catalogCopy}>
                  <Text style={styles.catalogName}>Add "{searchQuery.trim()}"</Text>
                  <Text style={styles.catalogCategory}>Custom item</Text>
                </View>
              </Pressable>
            )}
          </View>
        ) : null}

        <SectionTitle title="On your list" />
        {filteredListItems.length ? (
          <View style={styles.list}>
            {filteredListItems.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <SimpleItemRow
                item={item}
                store={storeById(item.storeId)}
                onPress={() => { setSearchQuery(''); Keyboard.dismiss(); setActionItem(item); }}
                action="cart"
                onSwipeLeft={() => animatedDelete(item.id)}
              />
            </View>
            ))}
          </View>
        ) : (
          <EmptyState
            icon={query ? 'search-outline' : 'cart-outline'}
            title={query ? 'No results' : 'Your list is empty'}
            body={query ? `No items match "${searchQuery}"` : 'Use the search bar above to add your first item.'}
          />
        )}

        <Pressable
          onLayout={(event) => { dashboardSectionY.current = event.nativeEvent.layout.y; }}
          onPress={() => setShowMore((value) => !value)}
          style={({ pressed }) => [styles.moreHeader, pressed && styles.pressed]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.moreTitle}>Home dashboard</Text>
            <Text style={styles.moreSubtitle}>Household and pantry status</Text>
          </View>
          <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
        </Pressable>

        {showMore ? (
          <View style={styles.dashboardSection}>
            <HouseholdBanner />
            {atHomeItems.length > 0 ? (
              <UseItOrLoseItWidget
                items={atHomeItems}
                onUsed={(item) => animatedDelete(item.id)}
                onRestock={(item) => animatedSetStatus(item.id, 'low')}
              />
            ) : null}
            <Pressable
              onPress={() => setShowAtHome((value) => !value)}
              style={({ pressed }) => [styles.atHomeHeader, pressed && styles.pressed]}
            >
              <View>
                <Text style={styles.atHomeTitle}>Pantry status</Text>
                <Text style={styles.atHomeCount}>{atHomeItems.length} item{atHomeItems.length === 1 ? '' : 's'}</Text>
              </View>
              <Ionicons name={showAtHome ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
            </Pressable>
            {showAtHome ? (
              filteredAtHomeItems.length ? (
                <View style={styles.list}>
                  {filteredAtHomeItems.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <SimpleItemRow
                      item={item}
                      store={storeById(item.storeId)}
                      onPress={() => { setSearchQuery(''); Keyboard.dismiss(); setActionItem(item); }}
                      action="Add to list"
                      onAction={() => { setSearchQuery(''); Keyboard.dismiss(); animatedSetStatus(item.id, 'low'); }}
                      onSwipeLeft={() => animatedDelete(item.id)}
                      onSwipeRight={() => animatedSetStatus(item.id, 'low')}
                    />
                  </View>
                  ))}
                </View>
              ) : (
                <EmptyState
                  icon="home-outline"
                  title="Nothing at home yet"
                  body="Items you mark stocked will show up here."
                />
              )
            ) : null}
            <RecipeSuggestionsCard recipes={recipes} onPress={setSelectedRecipe} />
          </View>
        ) : null}
        <View style={{ height: spacing.xl }} />
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
        <Ionicons name="people-outline" size={17} color={colors.primary} />
        <Text style={householdStyles.title}>{household.name}</Text>
        <Text style={householdStyles.count}>{members.length} member{members.length !== 1 ? 's' : ''}</Text>
      </View>
      {members.slice(0, 4).map((member, index) => (
        <View key={member.id}>
          {index > 0 ? <View style={householdStyles.divider} /> : null}
          <View style={householdStyles.memberRow}>
            <Text style={householdStyles.memberName} numberOfLines={1}>{member.displayName}</Text>
            <Text style={householdStyles.memberRole}>{member.role === 'owner' ? 'Owner' : 'Member'}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function stylesHousehold(colors: AppColors) {
  return StyleSheet.create({
    card: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radii.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
    title: { flex: 1, fontFamily: fonts.sansSemibold, color: colors.ink, fontSize: 15 },
    count: { fontFamily: fonts.mono, color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
    divider: { height: 1, backgroundColor: colors.borderSoft },
    memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 8 },
    memberName: { flex: 1, fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 14 },
    memberRole: { fontFamily: fonts.sansSemibold, color: colors.muted, fontSize: 12 },
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
          <Text style={{ fontFamily: fonts.sans, color: colors.warning, fontSize: 12, marginTop: 1, opacity: 0.8 }}>{ageLabel} — use it or add to your list?</Text>
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
          <Text style={{ fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.warning }}>Add to list</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.sectionTitleRow}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} style={s.sectionActionButton}>
          <Text style={s.sectionAction}>{action}</Text>
          {action === 'View all' ? <Ionicons name="chevron-forward" size={17} color={colors.primary} /> : null}
        </Pressable>
      ) : null}
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
}: {
  item: PantryItem;
  store?: { name: string };
  action?: string;
  onPress: () => void;
  onAction?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
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
      <Pressable onPress={onPress} style={s.itemRow}>
        <ItemAvatar name={item.name} size={44} />
        <View style={s.itemCopy}>
          <Text style={s.itemName}>{item.name}</Text>
          <Text style={s.itemMeta}>
            ×{item.quantity}{store ? ` · ${store.name}` : ''}
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
    </Swipeable>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    safe:             { flex: 1, backgroundColor: c.background },
    scroll:           { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
    header:           { flexDirection: 'column', paddingBottom: spacing.xxl },
    topRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    topRowRight:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
    wordmark:         { flexDirection: 'row', alignItems: 'center', gap: 7 },
    wordmarkText:     { fontFamily: fonts.sansSemibold, fontSize: 18, color: c.ink, letterSpacing: -0.3 },
    greeting:         { fontFamily: fonts.sans, fontSize: 14, color: c.muted, marginBottom: 2 },
    title:            { fontFamily: fonts.serifItalic, fontSize: 28, lineHeight: 34, color: c.ink, marginBottom: spacing.xs },
    tagline:          { fontFamily: fonts.sans, fontSize: 15, color: c.muted, fontVariant: ['tabular-nums'] },
    settings:         { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', ...shadow.card },
    pressed:          { opacity: 0.76 },
    atHomeHeader:      { marginBottom: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.borderSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    atHomeTitle:       { fontFamily: fonts.serifItalic, fontSize: 20, lineHeight: 26, color: c.ink },
    atHomeCount:       { fontFamily: fonts.sans, fontSize: 13, color: c.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
    moreHeader:        { marginTop: spacing.xl, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: c.borderSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    moreTitle:         { fontFamily: fonts.serifItalic, fontSize: 20, lineHeight: 26, color: c.ink },
    moreSubtitle:      { fontFamily: fonts.sans, fontSize: 13, color: c.muted, marginTop: 2 },
    dashboardSection:  { backgroundColor: c.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: c.borderSoft, padding: spacing.lg, ...shadow.card },
    summaryRow:       { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
    searchBar:        { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: radii.md, borderWidth: 1, borderColor: c.border, paddingLeft: spacing.md, paddingRight: 6, paddingVertical: 6, marginTop: spacing.sm, marginBottom: spacing.xs, minHeight: 52 },
    searchInput:      { flex: 1, minHeight: 40, fontFamily: fonts.sans, fontSize: 15, color: c.ink, padding: 0 },
    searchAddButton:  { width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.sm },
    catalogDropdown:  { backgroundColor: c.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.md, marginBottom: spacing.md, overflow: 'hidden', ...shadow.card },
    catalogRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, minHeight: 60 },
    catalogCopy:      { flex: 1 },
    catalogName:      { fontFamily: fonts.sansMedium, fontSize: 16, color: c.ink },
    catalogCategory:  { fontFamily: fonts.sans, fontSize: 12, color: c.muted, marginTop: 1 },
    catalogAddBtn:    { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    catalogListButton:{ minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.surface },
    catalogListButtonText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: c.primary },
    sectionTitleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
    sectionTitle:     { fontFamily: fonts.serifItalic, fontSize: 20, lineHeight: 26, color: c.ink },
    sectionActionButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: spacing.xs },
    sectionAction:    { fontFamily: fonts.sansSemibold, fontSize: 14, color: c.primary },
    list:             { backgroundColor: c.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: c.borderSoft, paddingHorizontal: spacing.md, overflow: 'hidden', ...shadow.card },
    divider:          { height: 1, backgroundColor: c.borderSoft, marginLeft: 50 },
    itemRow:          { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
    itemIcon:         { width: 44, height: 44, borderRadius: 13, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    itemEmoji:        { fontSize: 23 },
    itemCopy:         { flex: 1 },
    itemName:         { fontFamily: fonts.sansMedium, fontSize: 17, color: c.ink },
    itemMeta:         { fontFamily: fonts.mono, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 3, fontVariant: ['tabular-nums'] },
    itemAction:       { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 3 },
    itemCartAction:   { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 0, backgroundColor: c.surface },
    itemActionText:   { fontFamily: fonts.sansSemibold, fontSize: 12, color: c.primary },
    swipeActionLeft:  { backgroundColor: c.success, justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 20, flex: 1 },
    swipeActionRight: { backgroundColor: c.danger, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20, flex: 1 },
  });
}
