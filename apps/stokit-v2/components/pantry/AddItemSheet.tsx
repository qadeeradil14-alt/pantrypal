import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { ChipSelect } from '../shared/Field';
import { Button } from '../shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import type { PantryItem, PantryStatus, Unit } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import {
  PANTRY_CATALOG,
  PANTRY_CATEGORIES,
  type PantryCatalogCategory,
  type PantryCatalogItem,
} from '../../constants/pantryCatalog';
import { ItemAvatar } from '../shared/ItemAvatar';
import {
  CATALOG_SEARCH_LIMIT,
  getExtendedCatalogSize,
  hasExactCatalogMatch,
  searchPantryCatalog,
} from '../../constants/catalogSearch';

interface SelectedItem {
  catalog: PantryCatalogItem;
  quantity: number;
  unit: Unit;
  status: PantryStatus;
  storeId: string | null;
}

export function AddItemSheet({
  visible,
  onClose,
  defaultStatus = 'stocked',
  defaultStoreId = null,
  title = 'Add to pantry',
  subtitle = 'Select multiple items and add them all at once.',
  hideStorePicker = false,
  quickAdd = false,
  onItemsAdded,
}: {
  visible: boolean;
  onClose: () => void;
  defaultStatus?: PantryStatus;
  defaultStoreId?: string | null;
  title?: string;
  subtitle?: string;
  hideStorePicker?: boolean;
  quickAdd?: boolean;
  onItemsAdded?: (items: PantryItem[]) => void;
}) {
  const { colors } = useTheme();
  const stores = useDurableStore((s) => s.stores);
  const items = useDurableStore((s) => s.items);
  const addItem = useDurableStore((s) => s.addItem);
  const updateItem = useDurableStore((s) => s.updateItem);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<typeof PANTRY_CATEGORIES[number]>('Produce');
  const [selected, setSelected] = useState<Record<string, SelectedItem>>({});
  const [bulkStoreId, setBulkStoreId] = useState<string | null>(defaultStoreId);
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [showCatalog, setShowCatalog] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const committingRef = useRef(false);
  const itemInputRef = useRef<TextInput>(null);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const reset = () => {
    setQuery('');
    setCategory('Produce');
    setSelected({});
    setBulkStoreId(defaultStoreId);
    setDraftQuantity(1);
    setShowCatalog(false);
  };

  useEffect(() => {
    if (!visible) return;
    setIsCommitting(false);
    committingRef.current = false;
  }, [visible]);

  const commitItems = (chosen: SelectedItem[]) => {
    if (!chosen.length || committingRef.current) return;
    committingRef.current = true;
    setIsCommitting(true);
    const addedItems: PantryItem[] = [];
    chosen.forEach(({ catalog, quantity, unit, status, storeId }) => {
      const existing = quickAdd
        ? items.find((item) => item.name.trim().toLowerCase() === catalog.name.trim().toLowerCase())
        : undefined;
      const effectiveStoreId = storeId ?? bulkStoreId;
      const item = existing
        ? {
            ...existing,
            status,
            storeId: effectiveStoreId ?? existing.storeId,
            updatedAt: Date.now(),
          }
        : addItem({ name: catalog.name, quantity, unit, status, storeId: effectiveStoreId });
      if (existing) updateItem(existing.id, { status: item.status, storeId: item.storeId });
      addedItems.push(item);
    });
    reset();
    onClose();
    if (onItemsAdded) onItemsAdded(addedItems);
  };

  const submit = () => {
    commitItems(Object.values(selected));
  };

  const close = () => {
    reset();
    onClose();
  };

  const storeOptions = stores.map((s) => ({ value: s.id, label: s.name }));
  const selectedItems = Object.values(selected);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const filteredCatalog = useMemo(
    () => normalizedQuery
      ? searchPantryCatalog(normalizedQuery)
      : PANTRY_CATALOG.filter((catalogItem) => catalogItem.category === category),
    [category, normalizedQuery],
  );

  const exactMatch = useMemo(
    () => normalizedQuery ? hasExactCatalogMatch(normalizedQuery) : false,
    [normalizedQuery],
  );

  const toggle = (catalogItem: PantryCatalogItem) => {
    setSelected((current) => {
      if (current[catalogItem.id]) {
        const next = { ...current };
        delete next[catalogItem.id];
        return next;
      }
      return {
        ...current,
        [catalogItem.id]: {
          catalog: catalogItem,
          quantity: 1,
          unit: catalogItem.defaultUnit ?? 'unit',
          status: defaultStatus,
          storeId: bulkStoreId,
        },
      };
    });
  };

  const updateSelected = (id: string, patch: Partial<Omit<SelectedItem, 'catalog'>>) => {
    setSelected((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

  const applyBulkStore = (storeId: string | null) => {
    setBulkStoreId(storeId);
    setSelected((current) => {
      const next = { ...current };
      for (const k of Object.keys(next)) next[k] = { ...next[k], storeId };
      return next;
    });
  };

  const addCustomItem = () => {
    const name = query.trim();
    if (!name) return;
    const custom: PantryCatalogItem = {
      id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      category: 'Other',
      icon: '📦',
      defaultUnit: 'unit',
    };
    toggle(custom);
  };

  const submitDraftItem = () => {
    const name = query.trim();
    if (!name) return;
    const custom: PantryCatalogItem = {
      id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      category: 'Other',
      icon: '📦',
      defaultUnit: 'unit',
    };
    commitItems([{
      catalog: custom,
      quantity: draftQuantity,
      unit: custom.defaultUnit,
      status: defaultStatus,
      storeId: bulkStoreId,
    }]);
  };

  const bulkStoreName = bulkStoreId ? stores.find((s) => s.id === bulkStoreId)?.name : null;
  const itemWord = selectedItems.length === 1 ? 'item' : 'items';
  const submitLabel = selectedItems.length === 0
    ? bulkStoreName
      ? `Add to ${bulkStoreName}`
      : 'Add'
    : bulkStoreName
      ? `Add ${selectedItems.length} ${itemWord} to ${bulkStoreName}`
      : `Add ${selectedItems.length} ${itemWord}`;
  const canSubmit = selectedItems.length > 0 || query.trim().length > 0;
  // Typing always surfaces matching catalog items live — the manual toggle is
  // only needed to browse the catalog before typing anything.
  const showResults = showCatalog || normalizedQuery.length > 0;

  return (
    <Sheet visible={visible} title={title} onClose={close} minHeight="78%">
      <Pressable style={styles.formGroup} onPress={() => itemInputRef.current?.focus()}>
        <Text style={styles.fieldLabel}>Item</Text>
        <TextInput
          ref={itemInputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="What do you need?"
          placeholderTextColor={colors.muted}
          style={styles.itemInput}
          returnKeyType="done"
          onSubmitEditing={addCustomItem}
        />
      </Pressable>

      {!normalizedQuery ? (
        <Pressable onPress={() => setShowCatalog((current) => !current)} style={styles.catalogToggle}>
          <Ionicons name={showCatalog ? 'chevron-up' : 'search'} size={16} color={colors.primary} />
          <Text style={styles.catalogToggleText}>{showCatalog ? 'Hide catalog' : 'Browse catalog'}</Text>
        </Pressable>
      ) : null}

      {showResults ? (
        <>
          {!normalizedQuery ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
              {PANTRY_CATEGORIES.map((option) => {
                const active = category === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setCategory(option)}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                  >
                    <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{option}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <View style={styles.catalogHeader}>
            <Text style={styles.sectionTitle}>{normalizedQuery ? 'Search results' : 'Catalog'}</Text>
            <Text style={styles.count}>
              {normalizedQuery && filteredCatalog.length === CATALOG_SEARCH_LIMIT
                ? `Top ${CATALOG_SEARCH_LIMIT} of ${getExtendedCatalogSize().toLocaleString()}+`
                : `${filteredCatalog.length} items`}
            </Text>
          </View>
          {filteredCatalog.length ? (
            <View style={styles.catalogGrid}>
              {filteredCatalog.map((catalogItem) => {
                const active = !!selected[catalogItem.id];
                return (
                  <Pressable
                    key={catalogItem.id}
                    onPress={() => toggle(catalogItem)}
                    style={[styles.catalogItem, active && styles.catalogItemActive]}
                  >
                    <ItemAvatar name={catalogItem.name} icon={catalogItem.icon} size={40} />
                    <View style={styles.catalogText}>
                      <Text style={styles.catalogName} numberOfLines={1}>{catalogItem.name}</Text>
                      <Text style={styles.catalogCategory} numberOfLines={1}>{catalogItem.category}</Text>
                    </View>
                    <MaterialCommunityIcons
                      name={active ? 'check-circle' : 'plus-circle-outline'}
                      size={20}
                      color={active ? colors.primary : colors.muted}
                    />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptySearch}>
              <Ionicons name="search-outline" size={26} color={colors.muted} />
              <Text style={styles.emptyTitle}>No catalog matches</Text>
              <Text style={styles.hint}>Try another search or add this as a custom item.</Text>
            </View>
          )}
        </>
      ) : null}

      {showResults && query.trim().length >= 3 && !exactMatch ? (
        <Button
          label={`Add “${query.trim()}” as custom item`}
          variant="subtle"
          onPress={addCustomItem}
          style={styles.customButton}
        />
      ) : null}

      {!hideStorePicker && storeOptions.length ? (
        <ChipSelect
          label="Store"
          options={storeOptions}
          value={bulkStoreId}
          onChange={applyBulkStore}
        />
      ) : bulkStoreName ? (
        <View style={styles.storeSummary}>
          <Text style={styles.fieldLabel}>Store</Text>
          <Text style={styles.storeSummaryText}>{bulkStoreName}</Text>
        </View>
      ) : null}

      {selectedItems.length ? (
        <>
          <View style={styles.selectedHeader}>
            <Text style={styles.sectionTitle}>Selected items</Text>
            <Text style={styles.selectedCount}>{selectedItems.length}</Text>
          </View>
          {selectedItems.map(({ catalog, quantity, storeId }) => (
            <View key={catalog.id} style={styles.selectedCard}>
              <View style={styles.selectedTop}>
                <ItemAvatar name={catalog.name} icon={catalog.icon} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedName}>{catalog.name}</Text>
                  <Text style={styles.catalogCategory}>{catalog.category}</Text>
                </View>
                <Pressable onPress={() => toggle(catalog)} hitSlop={8} style={styles.remove}>
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                </Pressable>
                <View style={styles.quantity}>
                  <Pressable
                    onPress={() => updateSelected(catalog.id, { quantity: Math.max(1, quantity - 1) })}
                    hitSlop={6}
                    style={styles.quantityButton}
                  >
                    <Ionicons name="remove" size={16} color={colors.ink} />
                  </Pressable>
                  <Text style={styles.quantityValue}>×{quantity}</Text>
                  <Pressable
                    onPress={() => updateSelected(catalog.id, { quantity: quantity + 1 })}
                    hitSlop={6}
                    style={styles.quantityButton}
                  >
                    <Ionicons name="add" size={16} color={colors.ink} />
                  </Pressable>
                </View>
              </View>
              {!hideStorePicker && storeOptions.length ? (
                <ChipSelect
                  label="Buy at store"
                  options={storeOptions}
                  value={storeId}
                  onChange={(value) => updateSelected(catalog.id, { storeId: value })}
                />
              ) : null}
            </View>
          ))}
        </>
      ) : null}

      <Button
        label={submitLabel}
        onPress={selectedItems.length ? submit : submitDraftItem}
        disabled={!canSubmit || isCommitting}
        style={styles.submit}
      />
    </Sheet>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    formGroup: {
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    fieldLabel: {
      fontFamily: fonts.sansSemibold,
      fontSize: 13,
      color: colors.ink,
    },
    itemInput: {
      minHeight: 48,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: 16,
    },
    quantityControl: {
      width: 132,
      height: 40,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.sm,
    },
    draftQuantityValue: {
      minWidth: 34,
      textAlign: 'center',
      fontFamily: fonts.mono,
      fontSize: 14,
      color: colors.ink,
    },
    storeSummary: {
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    storeSummaryText: {
      minHeight: 44,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontFamily: fonts.sansSemibold,
      fontSize: 14,
      color: colors.ink,
    },
    catalogToggle: {
      minHeight: 42,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceRaised,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    catalogToggleText: {
      fontFamily: fonts.sansSemibold,
      fontSize: 13,
      color: colors.primary,
    },
    search: {
      height: 48,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    searchInput: {
      flex: 1,
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: 14,
    },
    categories: { gap: spacing.sm, paddingBottom: spacing.md },
    categoryChip: {
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    categoryChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    categoryChipText: { color: colors.muted, fontFamily: fonts.sansSemibold, fontSize: 12 },
    categoryChipTextActive: { color: colors.onPrimary },
    catalogHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    sectionTitle: { fontFamily: fonts.serifItalic, fontSize: 20, color: colors.ink },
    count: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
    catalogGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    catalogItem: {
      width: '48.5%',
      minHeight: 64,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    catalogItemActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    catalogIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catalogEmoji: { fontSize: 19 },
    catalogText: { flex: 1, minWidth: 0 },
    catalogName: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.ink },
    catalogCategory: { fontFamily: fonts.sans, fontSize: 10, color: colors.muted, marginTop: 2 },
    emptySearch: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
      marginBottom: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    customButton: { marginBottom: spacing.md },
    emptyTitle: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.ink },
    hint: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
    selectedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    selectedCount: {
      minWidth: 24,
      textAlign: 'center',
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.primarySoft,
      color: colors.primary,
      fontFamily: fonts.mono,
      fontSize: 11,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    selectedCard: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    selectedTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
    selectedEmoji: { fontSize: 25 },
    selectedName: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    remove: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.dangerSoft,
    },
    quantity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    quantityButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quantityValue: {
      minWidth: 28,
      textAlign: 'center',
      fontFamily: fonts.mono,
      fontSize: 12,
      color: colors.ink,
    },
    submit: { marginTop: spacing.md, marginBottom: spacing.sm },
  });
}
