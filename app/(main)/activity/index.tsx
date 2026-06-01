import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, SectionList, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHouseholdStore } from '../../../store/household';
import { useAuthStore } from '../../../store/auth';
import { fetchAllActivity, formatActivityTime, type ActivityEvent } from '../../../lib/activity';
import { useTheme } from '../../../hooks/useTheme';
import { fonts, type AppColors } from '../../../constants/theme';
import EmptyState from '../../../components/EmptyState';

interface ActivitySection {
  title: string;
  data: ActivityEvent[];
}

function dateLabel(isoString: string): string {
  const d = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function actorInitials(event: ActivityEvent): string {
  if (event.actorName) {
    const parts = event.actorName.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return '?';
}

function eventDescription(event: ActivityEvent, isSelf: boolean): string {
  const actor = isSelf ? 'You' : (event.actorName ?? 'Someone');
  switch (event.type) {
    case 'picked_up': return `${actor} picked up ${event.itemName}`;
    case 'marked_low': return `${actor} marked ${event.itemName} as low`;
    case 'store_arrival': return `${actor} arrived at ${event.storeName}`;
    default: return '';
  }
}

function eventIcon(type: ActivityEvent['type']): string {
  switch (type) {
    case 'picked_up': return '✓';
    case 'marked_low': return '↓';
    case 'store_arrival': return '🛒';
    default: return '·';
  }
}

export default function ActivityScreen() {
  const { colors } = useTheme();
  const { household } = useHouseholdStore();
  const { session } = useAuthStore();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const load = useCallback(async () => {
    if (!household?.id || !session?.user.id) { setEvents([]); return; }
    const data = await fetchAllActivity(household.id, session.user.id, 40);
    setEvents(data);
  }, [household?.id, session?.user.id]);

  useFocusEffect(useCallback(() => {
    void load().finally(() => setLoading(false));
  }, [load]));

  const sections = useMemo((): ActivitySection[] => {
    const byDay = new Map<string, ActivityEvent[]>();
    for (const ev of events) {
      const label = dateLabel(ev.updatedAt);
      if (!byDay.has(label)) byDay.set(label, []);
      byDay.get(label)!.push(ev);
    }
    return [...byDay.entries()].map(([title, data]) => ({ title, data }));
  }, [events]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(ev) => ev.id}
        ListHeaderComponent={(
          <View style={styles.titleRow}>
            <Text style={styles.title}>Activity</Text>
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item: ev }) => (
          <View style={styles.row}>
            <View style={[styles.avatar, ev.isSelf && styles.avatarSelf]}>
              <Text style={[styles.avatarText, ev.isSelf && styles.avatarTextSelf]}>
                {ev.type === 'store_arrival' ? eventIcon(ev.type) : actorInitials(ev)}
              </Text>
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowDesc}>{eventDescription(ev, ev.isSelf)}</Text>
              <Text style={styles.rowTime}>{formatActivityTime(ev.updatedAt)}</Text>
            </View>
            {ev.type !== 'store_arrival' && (
              <View style={[
                styles.typePill,
                ev.type === 'picked_up' && styles.typePillSuccess,
                ev.type === 'marked_low' && styles.typePillWarning,
              ]}>
                <Text style={[
                  styles.typePillText,
                  ev.type === 'picked_up' && styles.typePillTextSuccess,
                  ev.type === 'marked_low' && styles.typePillTextWarning,
                ]}>
                  {ev.type === 'picked_up' ? 'Got it' : 'Low'}
                </Text>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={(
          <EmptyState
            emoji="🕐"
            title="No activity yet"
            subtitle="Household actions from the last 48 hours will appear here."
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { paddingHorizontal: 16, paddingBottom: 120 },
    titleRow: { paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: 26, fontFamily: fonts.displayExtraBoldItalic, color: colors.ink, letterSpacing: 0 },
    sectionHeader: {
      paddingTop: 20, paddingBottom: 8, paddingHorizontal: 2,
      backgroundColor: colors.background,
    },
    sectionTitle: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    separator: { height: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.faint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarSelf: { backgroundColor: colors.primarySoft },
    avatarText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.muted },
    avatarTextSelf: { color: colors.primary },
    rowContent: { flex: 1, gap: 3 },
    rowDesc: { fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.ink, lineHeight: 19 },
    rowTime: { fontSize: 12, fontFamily: fonts.mono, color: colors.muted, fontVariant: ['tabular-nums'] },
    typePill: {
      borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
      backgroundColor: colors.faint,
    },
    typePillSuccess: { backgroundColor: colors.successSoft },
    typePillWarning: { backgroundColor: colors.warningSoft },
    typePillText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.muted },
    typePillTextSuccess: { color: colors.success },
    typePillTextWarning: { color: colors.warning },
  });
}
