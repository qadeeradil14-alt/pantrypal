import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { StoreChip } from '../shared/ui';
import { StorePickerSheet } from './StorePickerSheet';
import { ItemAvatar } from '../shared/ItemAvatar';
import { fonts, spacing } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useTheme } from '../../hooks/useTheme';
import type { PantryItem } from '../../types';

/**
 * Shows newly-added items so the user can assign each to a store.
 * Consistent with the shopping plan screen: tap a row → StorePickerSheet.
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
  const { colors } = useTheme();
  // pendingItem closes the outer sheet; pickingItem opens StorePickerSheet after dismiss animation.
  const [pendingItem, setPendingItem] = useState<PantryItem | null>(null);
  const [pickingItem, setPickingItem] = useState<PantryItem | null>(null);

  useEffect(() => {
    if (!visible) { setPendingItem(null); setPickingItem(null); }
  }, [visible]);

  useEffect(() => {
    if (!pendingItem) return;
    const t = setTimeout(() => setPickingItem(pendingItem), 350);
    return () => clearTimeout(t);
  }, [pendingItem]);

  return (
    <>
      <Sheet visible={visible && !pendingItem} title="Assign stores" onClose={onClose}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted, marginBottom: spacing.lg }}>
          Tap any item to choose its store.
        </Text>
        {items.map((item, idx) => {
          const live = liveItems.find((i) => i.id === item.id) ?? item;
          const store = live.storeId ? stores.find((s) => s.id === live.storeId) : undefined;
          return (
            <View key={item.id}>
              {idx > 0 && <View style={{ height: 1, backgroundColor: colors.borderSoft }} />}
              <Pressable
                onPress={() => setPendingItem(live)}
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
                  ? <StoreChip name={store.name} emoji={store.logoEmoji} color={store.logoColor} size={28} />
                  : <Ionicons name="chevron-forward" size={16} color={colors.faintText} />
                }
              </Pressable>
            </View>
          );
        })}
      </Sheet>

      <StorePickerSheet
        item={pickingItem}
        title="Assign store"
        onClose={() => { setPickingItem(null); setPendingItem(null); }}
      />
    </>
  );
}
