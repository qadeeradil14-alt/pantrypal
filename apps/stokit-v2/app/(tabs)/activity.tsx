import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { Card, PageTitle, StoreChip } from '../../components/shared/ui';
import { EmptyState } from '../../components/shared/EmptyState';
import { TripDetailSheet } from '../../components/receipts/TripDetailSheet';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import type { ActivityEvent, ActivityType, Store, Trip } from '../../types';
import { useTheme } from '../../hooks/useTheme';

const ICON_META: Record<ActivityType, { name: keyof typeof Ionicons.glyphMap; colorKey: keyof AppColors }> = {
  item_added: { name: 'add-circle', colorKey: 'success' },
  marked_low: { name: 'trending-down', colorKey: 'warning' },
  picked_up: { name: 'checkmark-circle', colorKey: 'success' },
  receipt_logged: { name: 'receipt', colorKey: 'primary' },
  store_added: { name: 'storefront', colorKey: 'info' },
  trip_completed: { name: 'flag', colorKey: 'primary' },
};

type FilterKey = 'all' | 'trips' | 'pantry';

const FILTERS: { key: FilterKey; label: string; types: ActivityType[] | null }[] = [
  { key: 'all', label: 'All', types: null },
  { key: 'trips', label: 'Trips', types: ['trip_completed'] },
  { key: 'pantry', label: 'Pantry', types: ['item_added', 'marked_low', 'picked_up'] },
];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const yd = new Date(now);
  yd.setDate(yd.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return 'Today';
  if (dayKey(d) === dayKey(yd)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ActivityScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const activity = useDurableStore((s) => s.activity);
  const stores = useDurableStore((s) => s.stores);
  const trips = useDurableStore((s) => s.trips);
  const storeById = (id?: string) => (id ? stores.find((s) => s.id === id) : undefined);
  const tripById = (id?: string) => (id ? trips.find((t) => t.id === id) : undefined);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  const filtered = useMemo(() => {
    const types = FILTERS.find((f) => f.key === filter)?.types ?? null;
    return types ? activity.filter((e) => types.includes(e.type)) : activity;
  }, [activity, filter]);

  // Group by day, newest sections first.
  const sections = useMemo(() => {
    const byDay = new Map<string, { label: string; ts: number; events: ActivityEvent[] }>();
    for (const e of filtered) {
      const key = dayKey(new Date(e.createdAt));
      if (!byDay.has(key)) {
        byDay.set(key, { label: dayLabel(e.createdAt), ts: e.createdAt, events: [] });
      }
      byDay.get(key)!.events.push(e);
    }
    return Array.from(byDay.values()).sort((a, b) => b.ts - a.ts);
  }, [filtered]);

  if (activity.length === 0) {
    return (
      <Screen>
        <PageTitle eyebrow="History" title="Activity" />
        <EmptyState
          icon="pulse-outline"
          title="Nothing here yet"
          body="As you add items, mark them low, shop, and log receipts, every action shows up here as a timeline."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageTitle eyebrow="History" title="Activity" />

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {sections.length === 0 ? (
        <Text style={styles.noneNote}>Nothing here for this filter.</Text>
      ) : (
        sections.map((section) => (
          <View key={section.label}>
            <Text style={styles.sectionTitle}>{section.label}</Text>
            {section.events.map((event) =>
              event.type === 'trip_completed' ? (
                <TripCard
                  key={event.id}
                  event={event}
                  styles={styles}
                  colors={colors}
                  onPress={() => setSelectedTrip(tripById(event.tripId) ?? null)}
                />
              ) : (
                <Card key={event.id} style={styles.eventCard}>
                  <EventRow event={event} store={storeById(event.storeId)} styles={styles} colors={colors} />
                </Card>
              ),
            )}
          </View>
        ))
      )}
      <TripDetailSheet trip={selectedTrip} onClose={() => setSelectedTrip(null)} />
    </Screen>
  );
}

function TripCard({ event, styles, colors, onPress }: { event: ActivityEvent; styles: any; colors: AppColors; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tripCard, pressed && { opacity: 0.75 }]}
      onPress={onPress}
    >
      <View style={styles.tripIcon}>
        <Ionicons name="flag" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tripTitle}>Shopping trip completed</Text>
        <Text style={styles.tripMessage}>{event.message.replace('Trip complete · ', '')}</Text>
        <Text style={styles.time}>{timeAgo(event.createdAt)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.primary} />
    </Pressable>
  );
}

function EventRow({ event, store, styles, colors }: { event: ActivityEvent; store?: Store; styles: any; colors: AppColors }) {
  const meta = ICON_META[event.type];
  return (
    <View style={styles.row}>
      {/* Real store chip when the event belongs to a store; generic icon otherwise. */}
      {store ? (
        <StoreChip store={store} size={38} />
      ) : (
        <View style={[styles.iconWrap, { borderColor: colors.border }]}>
          <Ionicons name={meta.name} size={18} color={colors[meta.colorKey]} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.message}>{event.message}</Text>
        <Text style={styles.time}>{timeAgo(event.createdAt)}</Text>
      </View>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    filterRow: { gap: spacing.sm, paddingBottom: spacing.lg },
    filterChip: {
      paddingHorizontal: spacing.lg,
      height: 34,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.inkSoft },
    filterTextActive: { color: colors.onPrimary },
    noneNote: {
      fontFamily: fonts.sans,
      fontSize: 14,
      color: colors.muted,
      textAlign: 'center',
      paddingVertical: spacing.huge,
    },
    sectionTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 12,
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
    eventCard: { marginBottom: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    message: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
    time: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 2 },

    // Prominent trip card
    tripCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.primarySoft,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.primary,
      padding: spacing.lg,
      marginBottom: spacing.sm,
    },
    tripIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tripTitle: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    tripMessage: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkSoft, marginTop: 3 },
  });
}
