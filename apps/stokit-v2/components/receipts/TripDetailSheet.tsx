/**
 * TripDetailSheet — the full receipt for one shopping trip.
 *
 * Opened by tapping a trip card in the Receipts tab. Shows trip-level totals
 * (spent, stores, items, duration) and a per-store breakdown (amount, items
 * bought, skipped). Read-only over committed durable `Trip` data.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Sheet } from '../shared/Sheet';
import { Pill, StoreChip } from '../shared/ui';
import { ItemAvatar } from '../shared/ItemAvatar';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useDurableStore } from '../../store/durable-store';
import type { Trip } from '../../types';
import { UNASSIGNED_STORE_ID, UNASSIGNED_STORE_NAME } from '../../constants/shopping';
import { storedReceiptItems } from '../../core/services/receiptHistory';

const ITEMS_PREVIEW_LIMIT = 4;

type PurchasedItemRow = { id: string; itemName: string; price: number };

export function TripDetailSheet({
  trip,
  onClose,
}: {
  trip: Trip | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const stores = useDurableStore((s) => s.stores);
  const receipts = useDurableStore((s) => s.receipts);
  const updateReceipt = useDurableStore((s) => s.updateReceipt);
  const priceHistory = useDurableStore((s) => s.priceHistory);
  const [expandedStores, setExpandedStores] = useState<Record<string, boolean>>({});

  const itemsByStore = useMemo(() => {
    const grouped = new Map<string, PurchasedItemRow[]>();
    const addItem = (storeId: string, row: PurchasedItemRow) => {
      const list = grouped.get(storeId) ?? [];
      list.push(row);
      grouped.set(storeId, list);
    };
    if (!trip) return grouped;

    // Trips recorded before purchasedItems existed: fall back to the old
    // priceHistory-window heuristic so older trip receipts don't go blank.
    if (!trip.purchasedItems || trip.purchasedItems.length === 0) {
      const entries = priceHistory.filter(
        (p) => p.paidAt >= trip.startedAt && p.paidAt <= trip.completedAt,
      );
      const byName = new Map<string, typeof entries[0]>();
      for (const e of entries) {
        const existing = byName.get(e.itemName);
        if (!existing || e.price > existing.price) byName.set(e.itemName, e);
      }
      for (const e of byName.values()) addItem(e.storeId, { id: e.id, itemName: e.itemName, price: e.price });
    } else {
      // Every item actually picked during the trip, with a logged price
      // attached if one exists for that item/store within the trip window.
      const pricesInWindow = priceHistory.filter(
        (p) => p.paidAt >= trip.startedAt && p.paidAt <= trip.completedAt,
      );
      for (const item of trip.purchasedItems) {
        const logged = pricesInWindow.find(
          (p) => p.itemId === item.itemId && p.storeId === item.storeId,
        );
        addItem(item.storeId, { id: item.itemId, itemName: item.name, price: logged?.price ?? item.price });
      }
    }

    for (const list of grouped.values()) list.sort((a, b) => a.itemName.localeCompare(b.itemName));
    return grouped;
  }, [trip, priceHistory]);

  const storeById = (id: string) => id === UNASSIGNED_STORE_ID
    ? { id, name: UNASSIGNED_STORE_NAME, logoEmoji: '🛒', logoColor: colors.primary, createdAt: 0, updatedAt: 0 }
    : stores.find((s) => s.id === id);

  if (!trip) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;

  const durationMin = Math.round(trip.duration / 60_000);
  const durationStr =
    durationMin < 60 ? `${durationMin} min` : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;

  return (
    <Sheet visible={!!trip} title="Trip receipt" onClose={onClose}>
      {/* Header total */}
      <View style={styles.totalBox}>
        <Text style={styles.totalValue}>${trip.totalSpent.toFixed(2)}</Text>
        <Text style={styles.totalLabel}>total spent</Text>
      </View>

      {/* Stat grid */}
      <View style={styles.statRow}>
        <Stat value={trip.storeIdsVisited.length} label="Stops" />
        <Stat value={trip.itemsBought} label="Bought" />
        {(trip.itemsOutOfStock ?? 0) > 0 && <Stat value={trip.itemsOutOfStock} label="Out of stock" />}
        {trip.itemsRemaining > 0 && <Stat value={trip.itemsRemaining} label="Remaining" />}
        <Stat value={durationStr} label="Duration" />
      </View>

      {/* Per-store breakdown, with that store's purchased items listed underneath */}
      <Text style={styles.sectionTitle}>Store breakdown</Text>
      {trip.breakdown.map((b) => {
        const store = storeById(b.storeId);
        const receipt = b.receiptId ? receipts.find((r) => r.id === b.receiptId) : null;
        const canAddPhoto = !b.skipped && receipt && receipt.status === 'skipped';
        const savedReceiptItems = storedReceiptItems(receipt);
        const storeItems = savedReceiptItems.length > 0 ? savedReceiptItems : itemsByStore.get(b.storeId) ?? [];
        const expanded = expandedStores[b.storeId] ?? false;
        const visibleItems = expanded ? storeItems : storeItems.slice(0, ITEMS_PREVIEW_LIMIT);
        const hiddenCount = storeItems.length - visibleItems.length;

        async function pickReceiptPhoto() {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Allow photo library access to attach a receipt photo.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            updateReceipt(receipt!.id, { imageUri: result.assets[0].uri, status: 'photo_pending' });
          }
        }

        return (
          <View key={b.storeId} style={styles.storeBlock}>
            <View style={[styles.storeRow, b.skipped && { opacity: 0.6 }]}>
              <StoreChip store={store} name={store?.name ?? '?'} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.storeName}>{store?.name ?? 'Store'}</Text>
                <Text style={styles.storeMeta}>
                  {b.skipped
                    ? 'Skipped'
                    : `${b.itemsBought} item${b.itemsBought === 1 ? '' : 's'} bought`}
                </Text>
              </View>
              {b.skipped ? (
                <Pill label="Skipped" tone="muted" />
              ) : canAddPhoto ? (
                <Pressable onPress={() => { void pickReceiptPhoto(); }} style={styles.addPhotoBtn}>
                  <Ionicons name="camera-outline" size={14} color={colors.primary} />
                  <Text style={styles.addPhotoText}>Add photo</Text>
                </Pressable>
              ) : receipt?.imageUri ? (
                <View style={styles.receiptAmount}>
                  <Ionicons name="image-outline" size={20} color={colors.success} />
                  <Text style={styles.storeAmount}>
                    {b.amount > 0 ? `$${b.amount.toFixed(2)}` : '—'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.storeAmount}>
                  {b.amount > 0 ? `$${b.amount.toFixed(2)}` : '—'}
                </Text>
              )}
            </View>

            {!b.skipped && visibleItems.length > 0 && (
              <View style={styles.storeItemsList}>
                {visibleItems.map((entry) => (
                  <View key={entry.id} style={styles.itemRow}>
                    <ItemAvatar name={entry.itemName} size={28} />
                    <Text style={styles.itemName}>{entry.itemName}</Text>
                    {entry.price > 0 ? (
                      <Text style={styles.itemPrice}>${entry.price.toFixed(2)}</Text>
                    ) : (
                      <Text style={styles.itemPriceMuted}>—</Text>
                    )}
                  </View>
                ))}
                {hiddenCount > 0 && (
                  <Pressable
                    onPress={() => setExpandedStores((prev) => ({ ...prev, [b.storeId]: true }))}
                    style={styles.showMoreBtn}
                  >
                    <Text style={styles.showMoreText}>Show {hiddenCount} more</Text>
                  </Pressable>
                )}
                {expanded && storeItems.length > ITEMS_PREVIEW_LIMIT && (
                  <Pressable
                    onPress={() => setExpandedStores((prev) => ({ ...prev, [b.storeId]: false }))}
                    style={styles.showMoreBtn}
                  >
                    <Text style={styles.showMoreText}>Show less</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}

      {/* Time footer */}
      <View style={styles.timeRow}>
        <Ionicons name="time-outline" size={14} color={colors.muted} />
        <Text style={styles.timeText}>
          {new Date(trip.startedAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          {'  '}
          {new Date(trip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {' → '}
          {new Date(trip.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </Sheet>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    totalBox: { alignItems: 'center', paddingBottom: spacing.lg },
    totalValue: { fontFamily: fonts.monoMedium, fontSize: 44, lineHeight: 56, minHeight: 56, color: colors.primary, fontVariant: ['tabular-nums'] },
    totalLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, marginTop: 2 },
    statRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.xl,
    },
    stat: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      paddingVertical: spacing.md,
      gap: 2,
    },
    statVal: { fontFamily: fonts.mono, fontSize: 18, color: colors.ink, fontVariant: ['tabular-nums'] },
    statLbl: { fontFamily: fonts.sans, fontSize: 10, color: colors.muted, textAlign: 'center' },
    sectionTitle: {
      fontFamily: fonts.serifItalic,
      fontSize: 21,
      color: colors.ink,
      marginBottom: spacing.md,
    },
    storeBlock: {
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    storeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    storeName: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    storeMeta: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
    storeAmount: { fontFamily: fonts.monoMedium, fontSize: 16, color: colors.ink, fontVariant: ['tabular-nums'] },
    receiptAmount: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    addPhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    addPhotoText: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.primary },
    storeItemsList: {
      paddingLeft: 52,
      paddingBottom: spacing.sm,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 6,
    },
    showMoreBtn: { paddingVertical: 6 },
    showMoreText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.primary },
    itemName: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
    itemPrice: { fontFamily: fonts.monoMedium, fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'] },
    itemPriceMuted: { fontFamily: fonts.mono, fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: spacing.xl,
    },
    timeText: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'] },
  });
}
