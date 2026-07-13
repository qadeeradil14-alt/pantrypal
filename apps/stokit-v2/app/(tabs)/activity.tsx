import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { Card, PageTitle, StoreChip } from '../../components/shared/ui';
import { EmptyState } from '../../components/shared/EmptyState';
import { TripDetailSheet } from '../../components/receipts/TripDetailSheet';
import { fonts, radii, shadow, spacing, type AppColors } from '../../theme';
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

const FILTERS: { key: FilterKey; label: string; icon: keyof typeof Ionicons.glyphMap; types: ActivityType[] | null }[] = [
  { key: 'all', label: 'All', icon: 'apps-outline', types: null },
  { key: 'trips', label: 'Trips', icon: 'navigate-outline', types: ['trip_completed'] },
  { key: 'pantry', label: 'Pantry', icon: 'basket-outline', types: ['item_added', 'marked_low', 'picked_up'] },
];

const EVENT_LABELS: Record<ActivityType, string> = {
  item_added: 'Added to pantry',
  marked_low: 'Needs restock',
  picked_up: 'Picked up',
  receipt_logged: 'Receipt saved',
  store_added: 'Store added',
  trip_completed: 'Trip completed',
};

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

  const overview = useMemo(() => ({
    trips: activity.filter((event) => event.type === 'trip_completed').length,
    receipts: activity.filter((event) => event.type === 'receipt_logged').length,
  }), [activity]);

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

      <Card style={styles.overviewCard}>
        <View style={styles.overviewHeader}>
          <View style={styles.overviewIcon}>
            <Ionicons name="pulse" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.overviewEyebrow}>YOUR HOUSEHOLD</Text>
            <Text style={styles.overviewTitle}>Recent activity</Text>
          </View>
          <Text style={styles.overviewTotal}>{activity.length}</Text>
        </View>
        <View style={styles.overviewStats}>
          <View style={styles.overviewStat}>
            <Text style={styles.overviewStatValue}>{overview.trips}</Text>
            <Text style={styles.overviewStatLabel}>Trips</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewStat}>
            <Text style={styles.overviewStatValue}>{overview.receipts}</Text>
            <Text style={styles.overviewStatLabel}>Receipts</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewStat}>
            <Text style={styles.overviewStatValue}>{activity.length}</Text>
            <Text style={styles.overviewStatLabel}>Updates</Text>
          </View>
        </View>
      </Card>

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
              <Ionicons name={f.icon} size={15} color={active ? colors.onPrimary : colors.muted} />
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {sections.length === 0 ? (
        <EmptyState
          icon={filter === 'trips' ? 'navigate-outline' : 'basket-outline'}
          title={filter === 'trips' ? 'No trips yet' : 'No pantry activity'}
          body={filter === 'trips'
            ? 'Completed shopping trips will appear here with their receipt details.'
            : 'Pantry updates will appear here as items are added, restocked, and picked up.'}
        />
      ) : (
        sections.map((section) => (
          <View key={section.label} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.label}</Text>
              <Text style={styles.sectionCount}>{section.events.length}</Text>
            </View>
            <Card style={styles.timelineCard}>
              {section.events.map((event, index) => (
                <View key={event.id}>
                  {index > 0 ? <View style={styles.eventDivider} /> : null}
                  {event.type === 'trip_completed' ? (
                    <TripCard
                      event={event}
                      styles={styles}
                      colors={colors}
                      onPress={() => setSelectedTrip(tripById(event.tripId) ?? null)}
                    />
                  ) : (
                    <EventRow event={event} store={storeById(event.storeId)} styles={styles} colors={colors} />
                  )}
                </View>
              ))}
            </Card>
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
        <Ionicons name="navigate" size={20} color={colors.onPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.eventLabel}>TRIP COMPLETED</Text>
        <Text style={styles.tripTitle}>Shopping trip completed</Text>
        <Text style={styles.tripMessage}>{event.message.replace('Trip complete · ', '')}</Text>
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={12} color={colors.muted} />
          <Text style={styles.time}>{timeAgo(event.createdAt)}</Text>
        </View>
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
        <Text style={[styles.eventLabel, { color: colors[meta.colorKey] }]}>{EVENT_LABELS[event.type].toUpperCase()}</Text>
        <Text style={styles.message}>{event.message}</Text>
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={12} color={colors.muted} />
          <Text style={styles.time}>{timeAgo(event.createdAt)}</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    overviewCard: {
      padding: spacing.xl,
      borderColor: colors.primary + '24',
      backgroundColor: colors.backgroundElevated,
      marginBottom: spacing.lg,
    },
    overviewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    overviewIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overviewEyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, color: colors.primary, letterSpacing: 1.1 },
    overviewTitle: { fontFamily: fonts.serifItalic, fontSize: 22, color: colors.ink, marginTop: 2 },
    overviewTotal: { fontFamily: fonts.monoMedium, fontSize: 28, color: colors.primary, fontVariant: ['tabular-nums'] },
    overviewStats: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    overviewStat: { flex: 1, alignItems: 'center' },
    overviewStatValue: { fontFamily: fonts.monoMedium, fontSize: 20, color: colors.ink, fontVariant: ['tabular-nums'] },
    overviewStatLabel: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.muted, marginTop: 2 },
    overviewDivider: { width: 1, height: 30, backgroundColor: colors.border },
    filterRow: { gap: spacing.sm, paddingBottom: spacing.md },
    filterChip: {
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: spacing.lg,
      height: 38,
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
    section: { marginTop: spacing.lg },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
    sectionTitle: {
      flex: 1,
      fontFamily: fonts.serifItalic,
      fontSize: 20,
      color: colors.ink,
    },
    sectionCount: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surfaceRaised,
      textAlign: 'center',
      paddingTop: 6,
      fontFamily: fonts.monoMedium,
      fontSize: 11,
      color: colors.muted,
      fontVariant: ['tabular-nums'],
    },
    timelineCard: { paddingVertical: spacing.xs },
    eventDivider: { height: 1, backgroundColor: colors.borderSoft, marginLeft: 50 + spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 72, paddingVertical: spacing.md },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 0.8, color: colors.primary, marginBottom: 3 },
    message: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
    time: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, fontVariant: ['tabular-nums'] },

    tripCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.primarySoft,
      borderRadius: radii.md,
      padding: spacing.md,
      marginVertical: spacing.xs,
      ...shadow.card,
    },
    tripIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tripTitle: { fontFamily: fonts.sansSemibold, fontSize: 16, lineHeight: 21, color: colors.ink },
    tripMessage: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkSoft, marginTop: 3, fontVariant: ['tabular-nums'] },
  });
}
