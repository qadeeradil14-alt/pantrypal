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
import { normalizeStoreName } from '../../../lib/stores';
import { getItemEmoji } from '../../../constants/itemEmojis';
import { useTheme } from '../../../hooks/useTheme';
import { fonts, type AppColors } from '../../../constants/theme';
import EmptyState from '../../../components/EmptyState';
import ScalePressable from '../../../components/ScalePressable';
import AppIcon from '../../../components/AppIcon';
import StoreLogo from '../../../components/StoreLogo';

interface ActivitySection {
  title: string;
  data: ActivityEvent[];
  total: number;
}

const SECTION_PREVIEW_LIMIT = 6;

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dateLabel(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const todayKey = localDayKey(now);
  const yd = new Date(now);
  yd.setDate(yd.getDate() - 1);
  const yesterdayKey = localDayKey(yd);
  const dKey = localDayKey(d);
  if (dKey === todayKey) return 'Today';
  if (dKey === yesterdayKey) return 'Yesterday';
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

function useStoreLogo(event: ActivityEvent): boolean {
  return !!event.storeName && (event.type === 'picked_up' || event.type === 'store_arrival');
}

function useAppIconAvatar(event: ActivityEvent): boolean {
  if (useStoreLogo(event)) return false;
  if (event.type === 'marked_low') return true;
  if (event.type === 'picked_up' && !event.storeName) return true;
  return !event.actorName?.trim();
}

function eventDescription(event: ActivityEvent, isSelf: boolean): string {
  const actor = isSelf ? 'You' : (event.actorName ?? 'Someone');
  const store = event.storeName ? normalizeStoreName(event.storeName) : null;
  switch (event.type) {
    case 'picked_up': return `${actor} picked up ${event.itemName}${store ? ` at ${store}` : ''}`;
    case 'marked_low': return `${actor} marked ${event.itemName} as low`;
    case 'store_arrival': return `${actor} arrived at ${store ?? event.storeName ?? 'a store'}`;
    default: return '';
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
    const byDay = new Map<string, { evs: ActivityEvent[]; newestMs: number }>();
    for (const ev of events) {
      const label = dateLabel(ev.updatedAt);
      const ms = new Date(ev.updatedAt).getTime();
      if (!byDay.has(label)) byDay.set(label, { evs: [], newestMs: 0 });
      const bucket = byDay.get(label)!;
      bucket.evs.push(ev);
      if (ms > bucket.newestMs) bucket.newestMs = ms;
    }
    return [...byDay.entries()]
      .sort(([, a], [, b]) => b.newestMs - a.newestMs)
      .map(([title, { evs }]) => ({
        title,
        data: expandedDays.has(title) ? evs : evs.slice(0, SECTION_PREVIEW_LIMIT),
        total: evs.length,
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
            <View style={[styles.avatar, useStoreLogo(ev) ? styles.avatarStoreLogo : (ev.isSelf && styles.avatarSelf)]}>
              {useStoreLogo(ev) ? (
                <View style={styles.storeLogoClip}>
                  <StoreLogo
                    name={ev.storeName!}
                    size={36}
                    domain={ev.storeBrandDomain}
                    logoUrl={ev.storeLogoUrl}
                    fallbackToAppIcon
                  />
                </View>
              ) : useAppIconAvatar(ev) ? (
                <AppIcon size={28} />
              ) : (
                <Text style={[styles.avatarText, ev.isSelf && styles.avatarTextSelf]}>
                  {actorInitials(ev)}
                </Text>
              )}
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowDesc} numberOfLines={2} ellipsizeMode="tail">
                {ev.itemName ? `${getItemEmoji(ev.itemName, null)} ` : ''}{eventDescription(ev, ev.isSelf)}
              </Text>
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
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.faint,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    storeLogoClip: {
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ scale: 0.92 }],
    },
    avatarStoreLogo: { backgroundColor: 'transparent' },
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
