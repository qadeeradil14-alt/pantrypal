import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, Image, SectionList, StyleSheet,
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
import ScalePressable from '../../../components/ScalePressable';

interface ActivitySection {
  title: string;
  data: ActivityEvent[];
  total: number;
}

const SECTION_PREVIEW_LIMIT = 6;
const APP_ICON = require('../../../assets/icon.png');

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
  return '';
}

function useAppIconAvatar(event: ActivityEvent): boolean {
  if (event.type === 'store_arrival') return false;
  return !event.actorName?.trim();
}

function eventDescription(event: ActivityEvent, isSelf: boolean): string {
  const actor = isSelf ? 'You' : (event.actorName ?? 'Someone');
  switch (event.type) {
    case 'picked_up': return `${actor} picked up ${event.itemName}${event.storeName ? ` at ${event.storeName}` : ''}`;
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
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());

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
    return [...byDay.entries()].map(([title, data]) => ({
      title,
      data: expandedDays.has(title) ? data : data.slice(0, SECTION_PREVIEW_LIMIT),
      total: data.length,
    }));
  }, [events, expandedDays]);

  const toggleDay = useCallback((title: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

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
        renderSectionFooter={({ section }) => {
          if (section.total <= SECTION_PREVIEW_LIMIT) return null;
          const expanded = expandedDays.has(section.title);
          return (
            <ScalePressable
              profile="chip"
              style={styles.seeMore}
              onPress={() => toggleDay(section.title)}
            >
              <Text style={styles.seeMoreText}>
                {expanded ? 'Show less' : `See ${section.total - SECTION_PREVIEW_LIMIT} more`}
              </Text>
            </ScalePressable>
          );
        }}
        renderItem={({ item: ev }) => (
          <View style={styles.row}>
            <View style={[styles.avatar, ev.isSelf && styles.avatarSelf]}>
              {ev.type === 'store_arrival' ? (
                <Text style={[styles.avatarText, ev.isSelf && styles.avatarTextSelf]}>
                  {eventIcon(ev.type)}
                </Text>
              ) : useAppIconAvatar(ev) ? (
                <Image source={APP_ICON} style={styles.avatarLogo} resizeMode="cover" />
              ) : (
                <Text style={[styles.avatarText, ev.isSelf && styles.avatarTextSelf]}>
                  {actorInitials(ev)}
                </Text>
              )}
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
    seeMore: {
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 2,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.primarySoft,
    },
    seeMoreText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.primary },
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
    avatarLogo: { width: 38, height: 38, borderRadius: 19 },
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
