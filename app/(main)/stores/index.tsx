import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHouseholdStore } from '../../../store/household';
import { useStoresStore } from '../../../store/stores';
import { useItemsStore } from '../../../store/items';
import { fetchStores, deleteStoreWithQueue, normalizeStoreName, extractAddressState, normalizeUSState, type Store } from '../../../lib/stores';
import { startGeofencing, stopGeofencing } from '../../../lib/geofencing';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../../../lib/haptics';
import { fonts, radii } from '../../../constants/theme';
import type { AppColors } from '../../../constants/theme';
import { useTheme } from '../../../hooks/useTheme';
import ScalePressable from '../../../components/ScalePressable';
import EmptyState from '../../../components/EmptyState';
import StoreLogo from '../../../components/StoreLogo';
import AddStoreModal from '../../../components/AddStoreModal';

function compactAddress(address: string, storeName: string): string {
  const raw = address.trim();
  if (!raw) return raw;

  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const storeKey = storeName.trim().toLowerCase();
  const deduped = parts.filter((part, idx) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    if (idx > 0 && key === storeKey) return false;
    return true;
  });

  const compact = deduped.slice(0, 4).join(', ');
  return compact || raw;
}

export default function StoresScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { household, status: householdStatus } = useHouseholdStore();
  const { stores, pinnedStoreIds, setStores, addStore: addToStore, removeStore, togglePin } = useStoresStore();
  const { items } = useItemsStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const householdId = household?.id ?? null;
  const canManageStores = !!householdId;

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const sortedStores = useMemo(() => {
    const pinned = stores.filter((s) => pinnedStoreIds.includes(s.id));
    const unpinned = stores.filter((s) => !pinnedStoreIds.includes(s.id));
    return [...pinned, ...unpinned];
  }, [stores, pinnedStoreIds]);

  /**
   * Detect the "home state" of this household by majority vote across all stores with addresses.
   * Any store whose state differs from the majority gets a ⚠️ warning badge.
   */
  const homeState = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const s of stores) {
      // Bucket by normalized 2-letter code so "VA" and "Virginia" count as one.
      const st = normalizeUSState(extractAddressState(s.address));
      if (st) freq[st] = (freq[st] ?? 0) + 1;
    }
    const entries = Object.entries(freq);
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }, [stores]);

  // Count pantry items assigned to each store
  const itemCountByStore = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      if (item.preferred_store_id) {
        counts[item.preferred_store_id] = (counts[item.preferred_store_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [items]);

  const load = useCallback(async () => {
    if (!householdId) {
      // Only clear stores once household is confirmed absent (loaded = true, household = null).
      // Without this guard, the Stores tab fires setStores([]) on every cold start because
      // useHouseholdStore is not persisted and always starts with household = null —
      // wiping the AsyncStorage-persisted store list before the household fetch completes.
      if (householdStatus === 'none') setStores([]);
      return;
    }
    const data = await fetchStores(householdId);
    setStores(data);
  }, [householdId, householdStatus, setStores]);

  useEffect(() => {
    load()
      .catch(() => {
        Alert.alert('Could not load stores', 'Please try again.');
      })
      .finally(() => setLoading(false));
  }, [load]);

  // Re-fetch when tab comes into focus (picks up changes from other devices)
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!householdId) setShowAdd(false);
  }, [householdId]);

  useEffect(() => {
    if (params.add !== '1' || !canManageStores) return;
    setShowAdd(true);
    router.setParams({ add: '' });
  }, [params.add, canManageStores, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }, [load]);

  async function handleDelete(store: Store) {
    Alert.alert(`Remove ${store.name}?`, 'This will also clear it from all items assigned here.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          void hapticWarning();
          if (!canManageStores) {
            Alert.alert('Household not ready', 'Please wait a moment and try again.');
            return;
          }
          try {
            setRemovingId(store.id);
            await deleteStoreWithQueue(store.id);
            removeStore(store.id);
            await stopGeofencing();
            const updated = stores.filter((s) => s.id !== store.id);
            if (updated.some((s) => s.latitude != null)) await startGeofencing(updated);
            void hapticSuccess();
          } catch (e: any) {
            Alert.alert('Could not remove store', e?.message ?? 'Please try again.');
            void hapticError();
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>Stores</Text>
          <Text style={styles.headerTitle} testID="stores-header">My Stores</Text>
        </View>
        <ScalePressable
          style={[styles.addBtn, !canManageStores && styles.addBtnDisabled]}
          onPress={() => {
            void hapticSelection();
            if (!canManageStores) {
              Alert.alert('Household not ready', 'Please wait a moment and try again.');
              return;
            }
            setShowAdd(true);
          }}
          disabled={!canManageStores}
        >
          <Ionicons name="add" size={20} color={colors.onPrimary} />
          <Text style={styles.addBtnText}>Add</Text>
        </ScalePressable>
      </View>

      <View style={styles.heroCard}>
        <View>
          <Text style={styles.heroNumber}>{stores.length}</Text>
          <Text style={styles.heroLabel}>{stores.length === 1 ? 'store saved' : 'stores saved'}</Text>
        </View>
        <View style={styles.heroBadge}>
          <Ionicons name="location-outline" size={18} color={colors.primary} />
          <Text style={styles.heroBadgeText}>
            {stores.filter((s) => s.latitude != null).length} with location
          </Text>
        </View>
      </View>

      {stores.length === 0 ? (
        <EmptyState
          emoji="🏪"
          title="No stores yet"
          subtitle="Add the stores you shop at. Include an address and the app will alert your partner the moment you arrive."
          action={canManageStores ? { label: 'Add your first store', onPress: () => { void hapticSelection(); setShowAdd(true); } } : undefined}
        />
      ) : (
        <FlatList
          data={sortedStores}
          keyExtractor={(s) => s.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item, index }) => {
            const itemCount = itemCountByStore[item.id] ?? 0;
            const isPinned = pinnedStoreIds.includes(item.id);
            const isFirstUnpinned = index === pinnedStoreIds.length && pinnedStoreIds.length > 0 && !isPinned;
            const storeState = normalizeUSState(extractAddressState(item.address));
            const isWrongState = !!homeState && !!storeState && storeState !== homeState;
            return (
              <>
                {isFirstUnpinned && (
                  <View style={styles.sectionDivider}>
                    <Text style={styles.sectionDividerText}>All stores</Text>
                  </View>
                )}
                <View style={styles.row}>
                  <StoreLogo name={item.name} size={40} domain={item.brand_domain} logoUrl={item.logo_url} />
                  <View style={styles.rowLeft}>
                    <View style={styles.storeNameRow}>
                      <Text style={styles.storeName}>{normalizeStoreName(item.name)}</Text>
                      {isPinned && (
                        <Ionicons name="bookmark" size={13} color={colors.primary} />
                      )}
                    </View>
                    {isWrongState && (
                      <View style={styles.wrongStateWarning}>
                        <Ionicons name="warning-outline" size={12} color={colors.warning} />
                        <Text style={styles.wrongStateText}>
                          Address looks wrong — {storeState} instead of {homeState}. Tap Remove to delete.
                        </Text>
                      </View>
                    )}
                    {item.address
                      ? (
                        <Text style={[styles.storeAddress, isWrongState && styles.storeAddressWrong]} numberOfLines={2} ellipsizeMode="tail">
                          {compactAddress(item.address, item.name)}
                        </Text>
                      )
                      : <Text style={styles.noAddress}>No address · geofencing off</Text>
                    }
                    {itemCount > 0 && (
                      <Text style={styles.itemCount}>{itemCount} {itemCount === 1 ? 'item' : 'items'} assigned</Text>
                    )}
                  </View>
                  <View style={styles.rowRight}>
                    <ScalePressable
                      profile="chip"
                      style={[styles.pinBtn, isPinned && styles.pinBtnActive]}
                      onPress={() => { void hapticSelection(); togglePin(item.id); }}
                    >
                      <View style={styles.pinBtnInner}>
                        <Ionicons name={isPinned ? 'bookmark' : 'bookmark-outline'} size={15} color={isPinned ? colors.primary : colors.muted} />
                      </View>
                    </ScalePressable>
                    {item.latitude != null && (
                      <ScalePressable
                        profile="chip"
                        style={styles.directionsBtn}
                        onPress={() => {
                          void hapticSelection();
                          const url = Platform.OS === 'ios'
                            ? `maps://?daddr=${item.latitude},${item.longitude}&dirflg=d`
                            : `google.navigation:q=${item.latitude},${item.longitude}`;
                          Linking.canOpenURL(url).then((can) => {
                            if (can) return Linking.openURL(url);
                            return Linking.openURL(`https://maps.apple.com/?daddr=${item.latitude},${item.longitude}&dirflg=d&t=m`);
                          }).catch(() => {});
                        }}
                      >
                        <Ionicons name="navigate" size={14} color={colors.primary} />
                        <Text style={styles.directionsBtnText}>Directions</Text>
                      </ScalePressable>
                    )}
                    <ScalePressable
                      profile="danger"
                      onPress={() => {
                        void hapticSelection();
                        handleDelete(item);
                      }}
                      style={styles.deleteBtn}
                      disabled={removingId === item.id}
                    >
                      <Text style={styles.deleteBtnText}>{removingId === item.id ? 'Removing…' : 'Remove'}</Text>
                    </ScalePressable>
                  </View>
                </View>
              </>
            );
          }}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={pinnedStoreIds.length > 0 ? (
            <View style={styles.sectionHeader}>
              <Ionicons name="bookmark" size={14} color={colors.primary} />
              <Text style={styles.sectionHeaderText}>Pinned</Text>
            </View>
          ) : null}
        />
      )}

      {showAdd && householdId && (
        <AddStoreModal
          householdId={householdId}
          existingStores={stores}
          onAdd={async (store) => {
            try {
              addToStore(store);
              await stopGeofencing();
              const all = [...stores, store];
              if (all.some((s) => s.latitude != null)) await startGeofencing(all);
              setShowAdd(false);
            } catch (e: any) {
              Alert.alert('Store saved, but geofencing failed', e?.message ?? 'Please check location permissions.');
            }
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    },
    headerLeft: { flex: 1, gap: 2 },
    eyebrow: { fontSize: 13, color: colors.primary, fontFamily: fonts.bodySemiBold },
    headerTitle: { fontSize: 26, fontFamily: fonts.displayExtraBoldItalic, color: colors.ink, letterSpacing: 0 },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 4, backgroundColor: colors.primary, borderRadius: 999,
      paddingHorizontal: 14, paddingVertical: 10,
    },
    addBtnDisabled: { backgroundColor: colors.disabled },
    addBtnText: { color: colors.onPrimary, fontSize: 15, fontFamily: fonts.bodySemiBold },
    heroCard: {
      marginHorizontal: 16, marginBottom: 12, borderRadius: radii.lg,
      backgroundColor: colors.surface, padding: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    heroNumber: { fontSize: 38, lineHeight: 42, fontFamily: fonts.monoMedium, color: colors.ink, fontVariant: ['tabular-nums'] },
    heroLabel: { fontSize: 14, color: colors.muted, fontFamily: fonts.bodySemiBold },
    heroBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 7,
      backgroundColor: colors.primarySoft, borderRadius: 999,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    heroBadgeText: { color: colors.primary, fontFamily: fonts.bodySemiBold, fontSize: 13 },
    list: { paddingHorizontal: 16, paddingBottom: 120 },
    separator: { height: 10 },
    row: {
      backgroundColor: colors.surface, borderRadius: radii.md, padding: 12,
      flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    rowLeft: { flex: 1, gap: 3 },
    storeName: { fontSize: 17, fontFamily: fonts.bodySemiBold, color: colors.ink },
    storeAddress: { fontSize: 13, color: colors.muted, lineHeight: 19, fontFamily: fonts.body },
    storeAddressWrong: { color: colors.warning },
    wrongStateWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 2 },
    wrongStateText: { flex: 1, fontSize: 12, color: colors.warning, fontFamily: fonts.bodySemiBold, lineHeight: 16 },
    noAddress: { fontSize: 13, color: colors.muted, fontFamily: fonts.bodyMedium },
    itemCount: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodyMedium },
    rowRight: { alignItems: 'flex-end', gap: 8 },
    geoPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5,
    },
    geoPillText: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodySemiBold },
    directionsBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
      backgroundColor: colors.primarySoft,
      borderWidth: 1, borderColor: colors.primary + '33',
    },
    directionsBtnText: { color: colors.primary, fontSize: 12, fontFamily: fonts.bodySemiBold },
    deleteBtn: { padding: 4 },
    deleteBtnText: { color: colors.danger, fontSize: 13, fontFamily: fonts.bodySemiBold },
    storeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    pinBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.faint },
    pinBtnInner: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    pinBtnActive: { backgroundColor: colors.primarySoft },
    sectionHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 4, paddingTop: 4, paddingBottom: 8,
    },
    sectionHeaderText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary, textTransform: 'uppercase' },
    sectionDivider: { paddingHorizontal: 4, paddingTop: 12, paddingBottom: 8 },
    sectionDividerText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: 'uppercase' },
  });
}
