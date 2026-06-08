import React, { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/shared/Screen';
import { Card, PageTitle, Pill, StoreChip } from '../../components/shared/ui';
import { EmptyState } from '../../components/shared/EmptyState';
import { TripDetailSheet } from '../../components/receipts/TripDetailSheet';
import { fonts, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import type { Receipt, Trip } from '../../types';
import { useTheme } from '../../hooks/useTheme';

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export default function ReceiptsScreen() {
  const { colors } = useTheme();
  const receipts = useDurableStore((s) => s.receipts);
  const stores = useDurableStore((s) => s.stores);
  const trips = useDurableStore((s) => s.trips);
  const storeById = (id: string) => stores.find((s) => s.id === id);
  const tripById = (id: string) => trips.find((t) => t.id === id);
  const [detailTrip, setDetailTrip] = useState<Trip | null>(null);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Group receipts by trip, newest first.
  const grouped = useMemo(() => {
    const byTrip = new Map<string, Receipt[]>();
    for (const r of receipts) {
      const list = byTrip.get(r.tripId) ?? [];
      list.push(r);
      byTrip.set(r.tripId, list);
    }
    return Array.from(byTrip.entries()).sort((a, b) => {
      const ta = a[1][0]?.createdAt ?? 0;
      const tb = b[1][0]?.createdAt ?? 0;
      return tb - ta;
    });
  }, [receipts]);

  const total = receipts
    .filter((r) => r.status !== 'skipped')
    .reduce((n, r) => n + r.amount, 0);

  if (receipts.length === 0) {
    return (
      <Screen>
        <PageTitle eyebrow="Spending" title="Receipts" />
        <EmptyState
          icon="receipt-outline"
          title="No receipts yet"
          body="When you finish shopping a store, log what you spent. Receipts are grouped by trip and store here."
          steps={[
            'Complete a shopping trip',
            'Save or upload a receipt per store',
            'Track spending over time',
          ]}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageTitle eyebrow="Spending" title="Receipts" />
      <Card style={styles.totalCard}>
        <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        <Text style={styles.totalLabel}>
          across {trips.length} trip{trips.length === 1 ? '' : 's'}
        </Text>
      </Card>

      {grouped.map(([tripId, list]) => {
        const tripTotal = list
          .filter((r) => r.status !== 'skipped')
          .reduce((n, r) => n + r.amount, 0);
        const trip = tripById(tripId);
        const storeCount = trip ? trip.storeIdsVisited.length : list.length;
        const itemCount = trip ? trip.itemsBought : 0;
        return (
          <View key={tripId}>
            {/* Trip header card — one trip, not loose receipts */}
            <Pressable
              onPress={() => trip && setDetailTrip(trip)}
              style={({ pressed }) => [styles.tripHeader, pressed && trip ? { opacity: 0.85 } : null]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.tripTitle}>Shopping Trip</Text>
                <Text style={styles.tripMeta}>
                  {fmtDate(list[0]?.createdAt ?? Date.now())} · {storeCount} store{storeCount === 1 ? '' : 's'}
                  {itemCount > 0 ? ` · ${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}
                </Text>
              </View>
              <View style={styles.tripRight}>
                <Text style={styles.tripTotal}>${tripTotal.toFixed(2)}</Text>
                {trip ? (
                  <View style={styles.tripChevron}>
                    <Pill label="Completed" tone="stocked" />
                    <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                  </View>
                ) : null}
              </View>
            </Pressable>
            <Card style={{ gap: spacing.md }}>
              {list.map((r, idx) => {
                const store = storeById(r.storeId);
                return (
                  <View key={r.id}>
                    {idx > 0 && <View style={styles.divider} />}
                    <View style={styles.row}>
                      <StoreChip
                        name={store?.name ?? '?'}
                        emoji={store?.logoEmoji}
                        color={store?.logoColor}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.storeName}>{store?.name ?? 'Store'}</Text>
                        <ReceiptStatusPill status={r.status} />
                      </View>
                      <Text style={styles.amount}>
                        {r.status === 'skipped' ? '—' : `$${r.amount.toFixed(2)}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}

      <TripDetailSheet trip={detailTrip} onClose={() => setDetailTrip(null)} />
    </Screen>
  );
}

function ReceiptStatusPill({ status }: { status: Receipt['status'] }) {
  if (status === 'logged') return <Pill label="Logged" tone="stocked" />;
  if (status === 'photo_pending') return <Pill label="Photo later" tone="low" />;
  return <Pill label="Skipped" tone="muted" />;
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    tripHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },
    tripTitle: { fontFamily: fonts.serifItalic, fontSize: 20, color: colors.ink },
    tripMeta: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 3 },
    tripRight: { alignItems: 'flex-end', gap: 4 },
    tripTotal: { fontFamily: fonts.monoMedium, fontSize: 18, color: colors.primary },
    tripChevron: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    totalCard: { alignItems: 'center', paddingVertical: spacing.xl },
    totalValue: { fontFamily: fonts.mono, fontSize: 44, color: colors.primary },
    totalLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, marginTop: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    divider: { height: 1, backgroundColor: colors.borderSoft, marginBottom: spacing.md },
    storeName: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink, marginBottom: 4 },
    amount: { fontFamily: fonts.monoMedium, fontSize: 16, color: colors.ink },
  });
}
