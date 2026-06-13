import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '../../components/shared/Logo';
import { AddItemSheet } from '../../components/pantry/AddItemSheet';
import { ItemActionSheet } from '../../components/pantry/ItemActionSheet';
import { StorePickerSheet } from '../../components/pantry/StorePickerSheet';
import { fonts, radii, shadow, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useHouseholdStore } from '../../store/household-store';
import { useTheme } from '../../hooks/useTheme';
import { classifyItem } from '../../core/services/itemClassifier';
import { suggestRecipes } from '../../core/services/recipes';
import { RecipeSuggestionsCard } from '../../components/recipes/RecipeSuggestionsCard';
import type { PantryItem } from '../../types';
import type { RecipeSuggestion } from '../../core/services/recipes';
import { ItemAvatar } from '../../components/shared/ItemAvatar';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const SHOPPING_BAG = require('../../assets/shopping-mission-bag.png');
const SHOPPING_CART = require('../../assets/shopping-cart-full.png');
const PANTRY_BIN = require('../../assets/pantry-bin-full.png');
export default function PantryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const items = useDurableStore((state) => state.items);
  const stores = useDurableStore((state) => state.stores);
  const setItemStatus = useDurableStore((state) => state.setItemStatus);
  const deleteItem = useDurableStore((state) => state.deleteItem);
  const members = useHouseholdStore((s) => s.members);
  const [addVisible, setAddVisible] = useState(false);
  const [showAtHome, setShowAtHome] = useState(false);
  const [actionItem, setActionItem] = useState<PantryItem | null>(null);
  const [pickerItem, setPickerItem] = useState<PantryItem | null>(null);
  const [recipes, setRecipes] = useState<RecipeSuggestion[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const myName = members.find((m) => m.isMe)?.displayName ?? '';
  const firstName = myName.split(' ')[0] || '';
  const greeting = `${getGreeting()}${firstName ? `, ${firstName}` : ''} 👋`;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isDark } = useTheme();

  const storeById = (id: string | null) => id ? stores.find((store) => store.id === id) : undefined;
  const listItems = useMemo(
    () => items.filter((item) => item.status === 'low' || item.status === 'expiring'),
    [items],
  );

  const readyItems = useMemo(
    () => listItems.filter((item) => item.storeId),
    [listItems],
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
  const showSearch = items.length > 4;

  const frequentBuys = useMemo(() => {
    if (query) return [];
    return [...atHomeItems]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 10);
  }, [atHomeItems, query]);

  useEffect(() => {
    let active = true;
    if (atHomeItems.length > 0) {
      suggestRecipes(atHomeItems).then(res => {
        if (active) setRecipes(res);
      });
    } else {
      setRecipes([]);
    }
    return () => { active = false; };
  }, [atHomeItems]);
  const previewItems = filteredListItems.slice(0, 3);
  const readyStores = new Set(readyItems.map((item) => item.storeId));
  const shoppingHelper = listItems.length === 0
    ? 'Add items to build your shopping list'
    : readyItems.length === 0
      ? 'Assign stores and start shopping'
      : readyItems.length < listItems.length
        ? `Shop ${readyItems.length} ready · assign ${listItems.length - readyItems.length} more`
        : `Shop ${readyItems.length} item${readyItems.length === 1 ? '' : 's'} at ${readyStores.size === 1 ? storeById(readyItems[0].storeId)?.name ?? 'your store' : `${readyStores.size} stores`}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <Logo size={42} color={colors.ink} accent={colors.primary} />
              <Text style={styles.title}>Pantry</Text>
            </View>
            <Text style={styles.tagline}>What do you want to do?</Text>
          </View>
          <Pressable onPress={() => router.push('/settings')} style={styles.settings}>
            <Ionicons name="settings-outline" size={25} color={colors.primary} />
          </Pressable>
        </View>

        <LivePartnerBanner />
        
        {atHomeItems.length > 0 && (
          <UseItOrLoseItWidget
            items={atHomeItems}
            onUsed={(item) => deleteItem(item.id)}
            onRestock={(item) => setItemStatus(item.id, 'low')}
          />
        )}

        <ActionCard
          title="Add something to buy"
          subtitle="Put it on your shopping list"
          icon="cart-outline"
          color={colors.primary}
          background={colors.primarySoft}
          image={SHOPPING_BAG}
          showPlus
          onPress={() => setAddVisible(true)}
        />
        <ActionCard
          title="Start shopping"
          subtitle={
            readyItems.length
              ? `${readyItems.length} ready across ${new Set(readyItems.map((i) => i.storeId)).size} store${new Set(readyItems.map((i) => i.storeId)).size === 1 ? '' : 's'}`
              : listItems.length
                ? `${listItems.length} item${listItems.length === 1 ? '' : 's'} to assign to stores`
                : 'Your list is empty'
          }
          icon="cart"
          color={colors.success}
          background={colors.successSoft}
          image={SHOPPING_CART}
          tint={isDark ? colors.surface : '#F8FBF5'}
          onPress={() => router.push('/shopping')}
        />
        <ActionCard
          title="See what I have"
          subtitle={`${atHomeItems.length} item${atHomeItems.length === 1 ? '' : 's'} at home`}
          icon="file-tray-stacked-outline"
          color={isDark ? '#C4A0D8' : '#6D527B'}
          background={isDark ? '#2D1E35' : '#F0E7F2'}
          image={PANTRY_BIN}
          tint={isDark ? colors.surface : '#FCF7FC'}
          onPress={() => setShowAtHome((value) => !value)}
        />

        <RecipeSuggestionsCard recipes={recipes} />

        {showSearch && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.muted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search items…"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
        )}

        {frequentBuys.length > 0 && !showAtHome && (
          <View style={styles.frequentSection}>
            <Text style={styles.frequentTitle}>Frequent buys</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frequentScroll}>
              {frequentBuys.map((fb) => {
                const isActioned = listItems.some(i => i.id === fb.id);
                return (
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
                );
              })}
            </ScrollView>
          </View>
        )}

        <SectionTitle
          title={showAtHome ? 'Items at home' : 'On your list'}
          action={showAtHome ? 'Close' : 'View all'}
          onAction={showAtHome ? () => setShowAtHome(false) : () => router.push('/shopping')}
        />
        <View style={styles.list}>
          {(showAtHome ? filteredAtHomeItems : previewItems).length ? (showAtHome ? filteredAtHomeItems : previewItems).map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <SimpleItemRow
                item={item}
                store={storeById(item.storeId)}
                onPress={() => setActionItem(item)}
                action={showAtHome ? 'Add to list' : 'cart'}
                onAction={showAtHome ? () => setItemStatus(item.id, 'low') : undefined}
                onSwipeLeft={() => deleteItem(item.id)}
                onSwipeRight={showAtHome ? () => setItemStatus(item.id, 'low') : undefined}
              />
            </View>
          )) : (
            <View style={styles.empty}>
              <Ionicons
                name={showAtHome ? 'file-tray-stacked-outline' : 'cart-outline'}
                size={28}
                color={colors.muted}
              />
              <Text style={styles.emptyTitle}>
                {query
                  ? 'No results'
                  : showAtHome ? 'Nothing at home yet' : 'Your list is empty'}
              </Text>
              <Text style={styles.emptyText}>
                {query
                  ? `No items match "${searchQuery}"`
                  : showAtHome ? 'Add items you already have.' : 'Tap "Add something to buy" to get started.'}
              </Text>
            </View>
          )}
        </View>
        <View style={{ height: 110 }} />
      </ScrollView>

      <AddItemSheet
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        defaultStatus="low"
        title="Add something to buy"
        subtitle="Choose items for your shopping list."
      />
      <ItemActionSheet item={actionItem} store={storeById(actionItem?.storeId ?? null)} onClose={() => setActionItem(null)} onAssignStore={setPickerItem} />
      <StorePickerSheet item={pickerItem} onClose={() => setPickerItem(null)} />
    </SafeAreaView>
  );
}

function LivePartnerBanner() {
  const { colors } = useTheme();
  
  // Simulated pulsing animation
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
      ])
    ).start();
  }, []);

  return (
    <Pressable style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.successSoft, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.successSoft }}>
      <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success, marginRight: 10, opacity: pulseAnim }} />
      <Text style={{ flex: 1, fontFamily: fonts.sansMedium, color: colors.success, fontSize: 14 }}>Sana is shopping at Aldi right now</Text>
      <Ionicons name="chevron-forward" color={colors.success} size={16} />
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
  const ageLabel = daysOld < 1 ? 'added today' : daysOld === 1 ? '1 day in your pantry' : `${daysOld} days in your pantry`;

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

function ActionCard({
  title,
  subtitle,
  icon,
  color,
  background,
  image,
  showPlus,
  tint,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
  image?: number;
  showPlus?: boolean;
  tint?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.actionCard, tint ? { backgroundColor: tint } : null, pressed && s.pressed]}
    >
      <View style={[s.actionIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={34} color={color} />
        {showPlus ? (
          <View style={s.plusBadge}>
            <Ionicons name="add" size={23} color={colors.primary} />
          </View>
        ) : null}
      </View>
      <View style={s.actionCopy}>
        <Text style={s.actionTitle}>{title}</Text>
        <Text style={s.actionSubtitle}>{subtitle}</Text>
      </View>
      <View style={s.actionMedia}>
        {image ? (
          <View style={s.actionImageContainer}>
            <Image source={image} style={s.actionImage} />
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={22} color={colors.muted} />
      </View>
    </Pressable>
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
            {item.quantity} {item.unit}{store ? ` · ${store.name}` : ''}
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
    header:           { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.xl },
    greeting:         { fontFamily: fonts.sans, fontSize: 14, color: c.muted, marginBottom: 2 },
    title:            { fontFamily: fonts.serifItalic, fontSize: 49, lineHeight: 53, color: c.ink },
    tagline:          { fontFamily: fonts.sans, fontSize: 16, color: c.muted, marginTop: 8 },
    settings:         { width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginTop: 8, ...shadow.card },
    actionCard:       { minHeight: 128, marginBottom: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, overflow: 'hidden', ...shadow.card },
    actionIcon:       { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
    plusBadge:        { position: 'absolute', right: 5, top: 5, width: 24, height: 24, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderSoft, alignItems: 'center', justifyContent: 'center' },
    actionCopy:       { flex: 1, zIndex: 2 },
    actionTitle:      { fontFamily: fonts.sansSemibold, fontSize: 19, lineHeight: 24, color: c.ink },
    actionSubtitle:   { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: c.muted, marginTop: spacing.xs },
    actionMedia:      { width: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
    actionImageContainer: {
      width: 72,
      height: 72,
      borderRadius: 18,
      backgroundColor: c.surfaceRaised,
      borderWidth: 1,
      borderColor: c.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    actionImage:      { width: 60, height: 60, resizeMode: 'contain', opacity: 0.95 },
    pressed:          { opacity: 0.76 },
    searchBar:        { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: radii.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: spacing.sm, marginBottom: spacing.xs },
    searchInput:      { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: c.ink, padding: 0 },
    sectionTitleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm },
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
    itemMeta:         { fontFamily: fonts.mono, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 3 },
    itemAction:       { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 3 },
    itemCartAction:   { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 0, backgroundColor: c.surface },
    itemActionText:   { fontFamily: fonts.sansSemibold, fontSize: 12, color: c.primary },
    empty:            { minHeight: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
    emptyTitle:       { fontFamily: fonts.sansSemibold, fontSize: 17, color: c.ink, marginTop: spacing.sm },
    emptyText:        { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: c.muted, textAlign: 'center', marginTop: spacing.xs },
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
