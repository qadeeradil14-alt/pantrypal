/**
 * TripDetailSheet — the full receipt for one shopping trip.
 *
 * Opened by tapping a trip card in the Receipts tab. Shows trip-level totals
 * (spent, stores, items, duration) and a per-store breakdown (amount, items
 * bought, skipped). Read-only over committed durable `Trip` data.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { Pill, StoreChip } from '../shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useDurableStore } from '../../store/durable-store';
import type { Trip } from '../../types';

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
  const storeById = (id: string) => stores.find((s) => s.id === id);

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
        <Stat value={trip.storeIdsVisited.length} label="Stores" />
        <Stat value={trip.itemsBought} label="Items bought" />
        {trip.itemsRemaining > 0 && <Stat value={trip.itemsRemaining} label="Remaining" />}
        <Stat value={durationStr} label="Duration" />
      </View>

      {/* Per-store breakdown */}
      <Text style={styles.sectionTitle}>Store breakdown</Text>
      {trip.breakdown.map((b) => {
        const store = storeById(b.storeId);
        return (
          <View key={b.storeId} style={[styles.storeRow, b.skipped && { opacity: 0.6 }]}>
            <StoreChip name={store?.name ?? '?'} emoji={store?.logoEmoji} color={store?.logoColor} size={40} />
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
            ) : (
              <Text style={styles.storeAmount}>
                {b.amount > 0 ? `$${b.amount.toFixed(2)}` : '—'}
              </Text>
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
    totalValue: { fontFamily: fonts.mono, fontSize: 48, color: colors.primary },
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
    statVal: { fontFamily: fonts.mono, fontSize: 18, color: colors.ink },
    statLbl: { fontFamily: fonts.sans, fontSize: 10, color: colors.muted, textAlign: 'center' },
    sectionTitle: {
      fontFamily: fonts.serifItalic,
      fontSize: 18,
      color: colors.ink,
      marginBottom: spacing.md,
    },
    storeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    storeName: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    storeMeta: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 2 },
    storeAmount: { fontFamily: fonts.monoMedium, fontSize: 16, color: colors.ink },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: spacing.xl,
    },
    timeText: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  });
}
