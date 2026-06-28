import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
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
import { IndividualAssignSheet } from '../../components/pantry/IndividualAssignSheet';
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
import * as Updates from 'expo-updates';
import { OTA_SEQ } from '../../constants/version';

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
  const [addedBatch, setAddedBatch] = useState<PantryItem[]>([]);
  const [showIndividualAssign, setShowIndividualAssign] = useState(false);
  const openingIndividualAssignRef = useRef(false);
  const [recipes, setRecipes] = useState<RecipeSuggestion[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSuggestion | null>(null);
  const rawMealsRef = useRef<RawMealData[]>([]);
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
  useEffect(() => {
    if (!household?.isPersonal) return;
    AsyncStorage.getItem('stokit:v2:onboarding:join-shown').then((seen) => {
      if (!seen) setJoinVisible(true);
    });
  }, [household?.isPersonal]);

  useEffect(() => {
    let active = true;
    if (atHomeItems.length === 0) { setRecipes([]); return; }

    if (rawMealsRef.current.length > 0) {
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
        setRecipes(reEvaluateRecipes(raws, atHomeItems));
      });
    }

    return () => { active = false; };
  }, [atHomeItems]);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          {/* Top row: logo + sync pill + settings */}
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
          {/* Greeting — 20px below the logo row */}
          <Text style={styles.title}>{greeting}</Text>
          <Text style={styles.tagline}>
            {items.length === 0
              ? 'Add your first item to get started'
              : listItems.length > 0
                ? `${items.length} item${items.length === 1 ? '' : 's'} · ${listItems.length} running low`
                : `${items.length} item${items.length === 1 ? '' : 's'} · well stocked`}
          </Text>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={query ? colors.primary : colors.muted} style={{ marginRight: 8 }} />
          <TextInput
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
            onPress={() => setAddVisible(true)}
            style={({ pressed }) => [styles.searchAddBtn, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={20} color={colors.onPrimary} />
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
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
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

        <SectionTitle
          title="On your list"
          action="Shop"
          onAction={() => router.push('/shopping')}
        />
        <View style={styles.list}>
          {filteredListItems.length ? filteredListItems.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <SimpleItemRow
                item={item}
                store={storeById(item.storeId)}
                onPress={() => { setSearchQuery(''); Keyboard.dismiss(); setActionItem(item); }}
                action="cart"
                onSwipeLeft={() => deleteItem(item.id)}
              />
            </View>
          )) : (
            <EmptyState
              icon={query ? 'search-outline' : 'cart-outline'}
              title={query ? 'No results' : 'Your list is empty'}
              body={query ? `No items match "${searchQuery}"` : 'Use the search bar above to add your first item.'}
            />
          )}
        </View>

        <Pressable
          onPress={() => setShowMore((value) => !value)}
          style={({ pressed }) => [styles.moreHeader, pressed && styles.pressed]}
        >
          <Text style={styles.moreTitle}>More for you</Text>
          <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
        </Pressable>

        {showMore ? (
          <>
            <HouseholdBanner />
            {atHomeItems.length > 0 ? (
              <UseItOrLoseItWidget
                items={atHomeItems}
                onUsed={(item) => deleteItem(item.id)}
                onRestock={(item) => setItemStatus(item.id, 'low')}
              />
            ) : null}
            <Pressable
              onPress={() => setShowAtHome((value) => !value)}
              style={({ pressed }) => [styles.atHomeHeader, pressed && styles.pressed]}
            >
              <View>
                <Text style={styles.atHomeTitle}>At home</Text>
                <Text style={styles.atHomeCount}>{atHomeItems.length} item{atHomeItems.length === 1 ? '' : 's'}</Text>
              </View>
              <Ionicons name={showAtHome ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
            </Pressable>
            {showAtHome ? (
              <View style={styles.list}>
                {filteredAtHomeItems.length ? filteredAtHomeItems.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <SimpleItemRow
                      item={item}
                      store={storeById(item.storeId)}
                      onPress={() => { setSearchQuery(''); Keyboard.dismiss(); setActionItem(item); }}
                      action="Add to list"
                      onAction={() => { setSearchQuery(''); Keyboard.dismiss(); setItemStatus(item.id, 'low'); }}
                      onSwipeLeft={() => deleteItem(item.id)}
                      onSwipeRight={() => setItemStatus(item.id, 'low')}
                    />
                  </View>
                )) : (
                  <EmptyState
                    icon="home-outline"
                    title="Nothing at home yet"
                    body="Items you mark stocked will show up here."
                  />
                )}
              </View>
            ) : null}
            <RecipeSuggestionsCard recipes={recipes} onPress={setSelectedRecipe} />
            {frequentBuys.length > 0 ? (
              <View style={styles.frequentSection}>
                <Text style={styles.frequentTitle}>Recently added</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frequentScroll}>
                  {frequentBuys.map((fb) => (
                    <Pressable
                      key={fb.id}
                      style={({ pressed }) => [styles.frequentItem, pressed && { opacity: 0.7 }]}
                      onPress={() => setItemStatus(fb.id, 'low')}
                    >
                      <ItemAvatar name={fb.name} size={48} />
                      <Text style={styles.frequentName} numberOfLines={1}>{fb.name}</Text>
                      <View style={styles.frequentAddBtn}>
                        <Ionicons name="add" size={14} color={colors.primary} />
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </>
        ) : null}
        <View style={{ height: 110 }} />
      </ScrollView>

      <AddItemSheet
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        defaultStatus="low"
        quickAdd
        title="Add something to buy"
        subtitle="Select everything you need, then add it all at once."
        onItemsAdded={setAddedBatch}
      />
      <ItemActionSheet item={actionItem} store={storeById(actionItem?.storeId ?? null)} onClose={() => setActionItem(null)} onAssignStore={setPickerItem} />
      <StorePickerSheet item={pickerItem} onClose={() => setPickerItem(null)} />
      <StorePickerSheet
        visible={addedBatch.length > 0}
        onClose={() => {
          if (openingIndividualAssignRef.current) {
            openingIndividualAssignRef.current = false;
            return;
          }
          setAddedBatch([]);
        }}
        title={`${addedBatch.length} item${addedBatch.length === 1 ? '' : 's'} added`}
        subtitle="Optional: assign the whole batch to one store."
        onSelect={(storeId) => {
          addedBatch.forEach((item) => useDurableStore.getState().updateItem(item.id, { storeId }));
          setAddedBatch([]);
        }}
        secondaryActionLabel="Assign to individual stores"
        onSecondaryAction={() => {
          openingIndividualAssignRef.current = true;
          setShowIndividualAssign(true);
        }}
      />
      <IndividualAssignSheet
        visible={showIndividualAssign}
        onClose={() => { setShowIndividualAssign(false); setAddedBatch([]); }}
        items={addedBatch}
      />
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
  const router = useRouter();

  // Only show when the user is actually in a household with others
  const otherMembers = members.filter((m) => !m.isMe);
  if (!household || otherMembers.length === 0) return null;

  return (
    <Pressable
      onPress={() => router.push('/settings')}
      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primarySoft, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.primary + '30' }}
    >
      <Ionicons name="people-outline" size={16} color={colors.primary} style={{ marginRight: 8 }} />
      <Text style={{ flex: 1, fontFamily: fonts.sansMedium, color: colors.primary, fontSize: 14 }}>
        {household.name} · {members.length} member{members.length !== 1 ? 's' : ''}
      </Text>
      <Ionicons name="chevron-forward" color={colors.primary} size={16} />
    </Pressable>
  );
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
    header:           { flexDirection: 'column', paddingBottom: 28 },
    topRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    topRowRight:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
    wordmark:         { flexDirection: 'row', alignItems: 'center', gap: 7 },
    wordmarkText:     { fontFamily: fonts.sansSemibold, fontSize: 18, color: c.ink, letterSpacing: -0.3 },
    syncPill:         { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
    syncPillText:     { fontFamily: fonts.mono, fontSize: 10, color: c.muted, fontVariant: ['tabular-nums'] },
    greeting:         { fontFamily: fonts.sans, fontSize: 14, color: c.muted, marginBottom: 2 },
    title:            { fontFamily: fonts.serifItalic, fontSize: 25, lineHeight: 30, color: c.ink, marginBottom: 4 },
    tagline:          { fontFamily: fonts.sans, fontSize: 15, color: c.muted, fontVariant: ['tabular-nums'] },
    settings:         { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', ...shadow.card },
    pressed:          { opacity: 0.76 },
    atHomeHeader:      { marginBottom: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    atHomeTitle:       { fontFamily: fonts.sansSemibold, fontSize: 19, color: c.ink },
    atHomeCount:       { fontFamily: fonts.sans, fontSize: 13, color: c.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
    moreHeader:        { marginTop: spacing.xl, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    moreTitle:         { fontFamily: fonts.sansSemibold, fontSize: 18, color: c.ink },
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
    sectionTitle:     { fontFamily: fonts.sansSemibold, fontSize: 22, color: c.ink },
    sectionActionButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: spacing.xs },
    sectionAction:    { fontFamily: fonts.sansSemibold, fontSize: 14, color: c.primary },
    list:             { backgroundColor: c.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.md, overflow: 'hidden', ...shadow.card },
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
    frequentSection:  { marginTop: spacing.md, marginBottom: spacing.sm },
    frequentTitle:    { fontFamily: fonts.sansSemibold, fontSize: 15, color: c.muted, marginBottom: spacing.sm, paddingHorizontal: 4 },
    frequentScroll:   { gap: spacing.md, paddingRight: spacing.xl },
    frequentItem:     { width: 70, alignItems: 'center', gap: 6 },
    frequentName:     { fontFamily: fonts.sansMedium, fontSize: 12, color: c.ink, textAlign: 'center' },
    frequentAddBtn:   { position: 'absolute', top: 0, right: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    swipeActionLeft:  { backgroundColor: c.success, justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 20, flex: 1 },
    swipeActionRight: { backgroundColor: c.danger, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20, flex: 1 },
  });
}
