import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PantryItem, Store } from '../../types';
import { useDurableStore } from '../../store/durable-store';
import { useTheme } from '../../hooks/useTheme';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { Button, StoreChip } from '../shared/ui';
import { Sheet } from '../shared/Sheet';
import { Stepper, TextField } from '../shared/Field';
import { StorePickerSheet } from '../pantry/StorePickerSheet';

export function ShoppingItemEditSheet({
  item,
  store,
  onClose,
}: {
  item: PantryItem | null;
  store?: Store;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const updateItem = useDurableStore((state) => state.updateItem);
  const deleteItem = useDurableStore((state) => state.deleteItem);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [choosingStore, setChoosingStore] = useState(false);
  const occurrenceItem = item && store
    ? { ...item, storeId: store.id }
    : item;

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setQuantity(item.quantity);
  }, [item?.id, item?.name, item?.quantity]);

  const save = () => {
    if (!item) return;
    const nextName = name.trim();
    if (!nextName) return;
    updateItem(item.id, { name: nextName, quantity });
    onClose();
  };

  const confirmDelete = () => {
    if (!item) return;
    Alert.alert(
      'Delete this item?',
      `${item.name} will be removed for everyone in this household.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteItem(item.id);
            onClose();
          },
        },
      ],
    );
  };

  return (
    <>
      <Sheet
        visible={Boolean(item) && !choosingStore}
        title="Edit item"
        onClose={onClose}
        minHeight="68%"
      >
        <TextField
          label="Item name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <Stepper
          label="Quantity"
          value={quantity}
          min={1}
          onChange={setQuantity}
        />
        <Pressable
          onPress={() => setChoosingStore(true)}
          style={({ pressed }) => [styles.storeRow, pressed && { opacity: 0.72 }]}
        >
          {store ? (
            <StoreChip store={store} size={40} />
          ) : (
            <View style={styles.storeFallback}>
              <Ionicons name="storefront-outline" size={20} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.storeLabel}>Store</Text>
            <Text style={styles.storeName}>{store?.name ?? 'Choose a store'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
        <View style={styles.actionRow}>
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete item"
            style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.72 }]}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </Pressable>
          <Button
            label="Save changes"
            disabled={!name.trim()}
            onPress={save}
            style={{ flex: 1 }}
          />
        </View>
      </Sheet>
      <StorePickerSheet
        item={occurrenceItem}
        visible={Boolean(item) && choosingStore}
        title="Change store"
        onClose={() => setChoosingStore(false)}
      />
    </>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    storeRow: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
    storeFallback: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    storeLabel: {
      fontFamily: fonts.mono,
      fontSize: 10,
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    storeName: {
      fontFamily: fonts.sansSemibold,
      fontSize: 15,
      color: colors.ink,
      marginTop: 2,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    deleteButton: {
      width: 54,
      height: 54,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
  });
}
