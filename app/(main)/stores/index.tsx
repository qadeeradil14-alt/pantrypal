import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  Alert, ActivityIndicator, TextInput, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHouseholdStore } from '../../../store/household';
import { useStoresStore } from '../../../store/stores';
import { fetchStores, addStoreWithQueue, deleteStoreWithQueue, PRESET_STORES, type Store } from '../../../lib/stores';
import { startGeofencing, stopGeofencing } from '../../../lib/geofencing';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../../../lib/haptics';
import { fonts, radii, shadow } from '../../../constants/theme';
import type { AppColors } from '../../../constants/theme';
import { useTheme } from '../../../hooks/useTheme';
import ScalePressable from '../../../components/ScalePressable';
import EmptyState from '../../../components/EmptyState';

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
  const { household } = useHouseholdStore();
  const { stores, setStores, addStore: addToStore, removeStore } = useStoresStore();
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const householdId = household?.id ?? null;
  const canManageStores = !!householdId;

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const load = useCallback(async () => {
    if (!householdId) {
      setStores([]);
      return;
    }
    const data = await fetchStores(householdId);
    setStores(data);
  }, [householdId, setStores]);

  useEffect(() => {
    load()
      .catch(() => {
        Alert.alert('Could not load stores', 'Please try again.');
      })
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!householdId) setShowAdd(false);
  }, [householdId]);

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
          <Text style={styles.headerTitle}>My Stores</Text>
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
          <Ionicons name="add" size={20} color={colors.surface} />
          <Text style={styles.addBtnText}>Add</Text>
        </ScalePressable>
      </View>

      <View style={styles.heroCard}>
        <View>
          <Text style={styles.heroNumber}>{stores.length}</Text>
          <Text style={styles.heroLabel}>{stores.length === 1 ? 'store saved' : 'stores saved'}</Text>
        </View>
        <View style={styles.heroBadge}>
          <Ionicons name="navigate-outline" size={18} color={colors.primary} />
          <Text style={styles.heroBadgeText}>
            {stores.filter((s) => s.latitude != null).length} active
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
          data={stores}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={[styles.storeIcon, item.latitude != null && styles.storeIconActive]}>
                <Ionicons
                  name={item.latitude != null ? 'navigate' : 'storefront-outline'}
                  size={18}
                  color={item.latitude != null ? colors.primary : colors.muted}
                />
              </View>
              <View style={styles.rowLeft}>
                <Text style={styles.storeName}>{item.name}</Text>
                {item.address
                  ? (
                    <Text style={styles.storeAddress} numberOfLines={2} ellipsizeMode="tail">
                      {compactAddress(item.address, item.name)}
                    </Text>
                  )
                  : <Text style={styles.noAddress}>No address — geofencing inactive</Text>
                }
              </View>
              <View style={styles.rowRight}>
                {item.latitude != null && (
                  <View style={styles.geoPill}>
                    <Ionicons name="location" size={13} color={colors.primary} />
                    <Text style={styles.geoPillText}>Active</Text>
                  </View>
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
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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

function AddStoreModal({
  householdId, existingStores, onAdd, onClose,
}: {
  householdId: string;
  existingStores: Store[];
  onAdd: (store: Store) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const existingNames = existingStores.map((s) => s.name.toLowerCase());
  const presets = PRESET_STORES.filter((p) => !existingNames.includes(p.toLowerCase()));

  async function handleSave(storeName: string, storeAddress?: string) {
    setSaving(true);
    setError('');
    try {
      const { store, queued } = await addStoreWithQueue(householdId, storeName, storeAddress);
      onAdd(store);
      if (queued) {
        setError('Saved offline — will sync when you’re back online.');
      }
      void hapticSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Could not add store.');
      void hapticError();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Add store</Text>
          <Text style={styles.sheetSubtitle}>Save places your household shops often.</Text>

          {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}

          <Text style={styles.label}>Quick add</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsRow} contentContainerStyle={styles.presetsContent}>
            {presets.map((p) => (
              <ScalePressable
                key={p}
                profile="chip"
                style={styles.presetChip}
                onPress={() => {
                  void hapticSelection();
                  handleSave(p);
                }}
                disabled={saving}
              >
                <Text style={styles.presetChipText}>{p}</Text>
              </ScalePressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Custom store</Text>
          <TextInput
            style={styles.input}
            placeholder="Store name"
            value={name}
            onChangeText={setName}
            placeholderTextColor={colors.placeholder}
          />
          <TextInput
            style={styles.input}
            placeholder="Address (optional — enables geofencing)"
            value={address}
            onChangeText={setAddress}
            placeholderTextColor={colors.placeholder}
          />

          <ScalePressable
            style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
            onPress={() => {
              void hapticSelection();
              handleSave(name.trim(), address.trim() || undefined);
            }}
            disabled={!name.trim() || saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Add store</Text>
            }
          </ScalePressable>

          <ScalePressable
            style={styles.cancelBtn}
            profile="chip"
            onPress={() => {
              void hapticSelection();
              onClose();
            }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </ScalePressable>
        </View>
      </View>
    </Modal>
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
    eyebrow: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodySemiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
    headerTitle: { fontSize: 26, fontFamily: fonts.displayExtraBold, color: colors.ink, letterSpacing: 0 },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 4, backgroundColor: colors.primary, borderRadius: 999,
      paddingHorizontal: 14, paddingVertical: 10,
    },
    addBtnDisabled: { backgroundColor: colors.disabled },
    addBtnText: { color: colors.surface, fontSize: 15, fontFamily: fonts.bodySemiBold },
    heroCard: {
      marginHorizontal: 16, marginBottom: 12, borderRadius: radii.lg,
      backgroundColor: colors.surface, padding: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderWidth: 1, borderColor: colors.border, ...shadow,
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
      borderWidth: 1, borderColor: colors.border,
      flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    storeIcon: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.surfaceWarm, flexShrink: 0,
    },
    storeIconActive: { backgroundColor: colors.primarySoft },
    rowLeft: { flex: 1, gap: 4 },
    storeName: { fontSize: 17, fontFamily: fonts.bodySemiBold, color: colors.ink },
    storeAddress: { fontSize: 13, color: colors.muted, lineHeight: 19, fontFamily: fonts.body },
    noAddress: { fontSize: 13, color: colors.low, fontFamily: fonts.bodyMedium },
    rowRight: { alignItems: 'flex-end', gap: 8 },
    geoPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5,
    },
    geoPillText: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodySemiBold },
    deleteBtn: { padding: 4 },
    deleteBtnText: { color: colors.danger, fontSize: 13, fontFamily: fonts.bodySemiBold },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
    emptyIconWrap: { backgroundColor: colors.primarySoft, borderRadius: radii.xl, padding: 16, marginBottom: 8 },
    emptyTitle: { fontSize: 24, fontFamily: fonts.display, color: colors.ink, letterSpacing: 0 },
    emptySub: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 24, fontFamily: fonts.body },
    emptyBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
    emptyBtnDisabled: { backgroundColor: colors.disabled },
    emptyBtnText: { color: colors.surface, fontSize: 16, fontFamily: fonts.bodySemiBold },
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 23, 0.36)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, ...shadow },
    handle: { width: 36, height: 4, backgroundColor: colors.faint, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
    sheetTitle: { fontSize: 22, fontFamily: fonts.displayItalic, color: colors.ink, marginBottom: 4, letterSpacing: 0 },
    sheetSubtitle: { fontSize: 14, color: colors.muted, marginBottom: 18, fontFamily: fonts.body },
    errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radii.sm, padding: 12, marginBottom: 12 },
    error: { color: colors.dangerText, fontSize: 14 },
    label: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: 'uppercase', marginBottom: 8 },
    presetsRow: { marginBottom: 20 },
    presetsContent: { paddingRight: 10 },
    presetChip: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: colors.primarySoft },
    presetChipText: { color: colors.primary, fontSize: 14, fontFamily: fonts.bodySemiBold },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16, marginBottom: 12, color: colors.ink, backgroundColor: colors.background, fontFamily: fonts.body },
    saveBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
    saveBtnDisabled: { backgroundColor: colors.disabled },
    saveBtnText: { color: colors.surface, fontSize: 17, fontFamily: fonts.bodySemiBold },
    cancelBtn: { paddingVertical: 12, alignItems: 'center' },
    cancelText: { color: colors.muted, fontSize: 16, fontFamily: fonts.bodySemiBold },
  });
}
