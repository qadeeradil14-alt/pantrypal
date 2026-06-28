import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { Button, StoreChip } from '../shared/ui';
import { ItemAvatar } from '../shared/ItemAvatar';
import { fonts, spacing } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useTheme } from '../../hooks/useTheme';
import type { PantryItem } from '../../types';

/**
 * Shows newly-added items so the user can assign each to a store.
 * Uses one sheet for bulk assignment, individual item selection, and store choice.
 */
export function IndividualAssignSheet({
  visible,
  onClose,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  items: PantryItem[];
}) {
  const stores = useDurableStore((s) => s.stores);
  const liveItems = useDurableStore((s) => s.items);
  const updateItem = useDurableStore((s) => s.updateItem);
  const { colors } = useTheme();
  const [mode, setMode] = useState<'bulk' | 'individual' | 'item'>('bulk');
  const [pickingItem, setPickingItem] = useState<PantryItem | null>(null);

  useEffect(() => {
    if (!visible) {
      setMode('bulk');
      setPickingItem(null);
    }
  }, [visible]);

  const title = mode === 'item' ? 'Assign store' : 'Assign stores';
  const liveBatch = items.map((item) => liveItems.find((i) => i.id === item.id) ?? item);
  const assignAll = (storeId: string) => {
    liveBatch.forEach((item) => updateItem(item.id, { storeId }));
    setMode('individual');
  };
  const assignOne = (storeId: string | null) => {
    if (!pickingItem) return;
    updateItem(pickingItem.id, { storeId });
    setPickingItem(null);
    setMode('individual');
  };

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={mode === 'item' ? () => { setPickingItem(null); setMode('individual'); } : onClose}
    >
      {mode === 'bulk' ? (
        <>
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted, marginBottom: spacing.lg }}>
            Optional: assign all {items.length} item{items.length === 1 ? '' : 's'} to one store.
          </Text>
          {stores.map((store) => (
            <Pressable
              key={store.id}
              onPress={() => assignAll(store.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.md,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <StoreChip store={store} size={36} />
              <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink }}>{store.name}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.faintText} />
            </Pressable>
          ))}
          <Button
            label="Assign to individual stores"
            variant="subtle"
            onPress={() => setMode('individual')}
            style={{ marginTop: spacing.md }}
          />
        </>
      ) : mode === 'individual' ? (
        <>
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted, marginBottom: spacing.lg }}>
            Tap any item to choose its store.
          </Text>
          {liveBatch.map((item, idx) => {
          const store = item.storeId ? stores.find((s) => s.id === item.storeId) : undefined;
          return (
            <View key={item.id}>
              {idx > 0 && <View style={{ height: 1, backgroundColor: colors.borderSoft }} />}
              <Pressable
                onPress={() => {
                  setPickingItem(item);
                  setMode('item');
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <ItemAvatar name={item.name} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink }}>
                    {item.name}
                  </Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: store ? colors.primary : colors.muted, marginTop: 2 }}>
                    {store ? store.name : 'Tap to assign a store'}
                  </Text>
                </View>
                {store
                  ? <StoreChip store={store} size={28} />
                  : <Ionicons name="chevron-forward" size={16} color={colors.faintText} />
                }
              </Pressable>
            </View>
          );
        })}
        <Button label="Done" onPress={onClose} style={{ marginTop: spacing.lg }} />
      </>
      ) : (
        <>
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted, marginBottom: spacing.lg }}>
            Where do you buy {pickingItem?.name}?
          </Text>
          {stores.map((store) => {
            const active = pickingItem?.storeId === store.id;
            return (
              <Pressable
                key={store.id}
                onPress={() => assignOne(store.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <StoreChip store={store} size={36} />
                <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink }}>{store.name}</Text>
                <Ionicons name={active ? 'checkmark-circle' : 'chevron-forward'} size={18} color={active ? colors.primary : colors.faintText} />
              </Pressable>
            );
          })}
          {pickingItem?.storeId ? (
            <Pressable
              onPress={() => assignOne(null)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.md,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name="close" size={20} color={colors.muted} />
              <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.muted }}>Remove from store</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
