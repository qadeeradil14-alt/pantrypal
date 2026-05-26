import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHouseholdStore } from '../../../store/household';
import { useStoresStore } from '../../../store/stores';
import { fetchStores, addStore, deleteStore, PRESET_STORES, type Store } from '../../../lib/stores';
import { startGeofencing, stopGeofencing } from '../../../lib/geofencing';
import { colors, radii, shadow } from '../../../constants/theme';

function compactAddress(address: string, storeName: string): string {
  const raw = address.trim();
  if (!raw) return raw;

  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  // Remove repeated chunks and repeated store name fragments.
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
  const { household } = useHouseholdStore();
  const { stores, setStores, addStore: addToStore, removeStore } = useStoresStore();
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const householdId = household?.id ?? null;
  const canManageStores = !!householdId;

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
          if (!canManageStores) {
            Alert.alert('Household not ready', 'Please wait a moment and try again.');
            return;
          }
          try {
            setRemovingId(store.id);
            await deleteStore(store.id);
            removeStore(store.id);
            await stopGeofencing();
            const updated = stores.filter((s) => s.id !== store.id);
            if (updated.some((s) => s.latitude != null)) await startGeofencing(updated);
          } catch (e: any) {
            Alert.alert('Could not remove store', e?.message ?? 'Please try again.');
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
          <Text style={styles.eyebrow}>Store alerts</Text>
          <Text style={styles.headerTitle}>My Stores</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, !canManageStores && styles.addBtnDisabled]}
          onPress={() => {
            if (!canManageStores) {
              Alert.alert('Household not ready', 'Please wait a moment and try again.');
              return;
            }
            setShowAdd(true);
          }}
          disabled={!canManageStores}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={20} color={colors.surface} />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
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
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="storefront-outline" size={58} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No stores yet</Text>
          <Text style={styles.emptySub}>
            Add the stores you shop at. Include an address and the app will alert your partner the moment you arrive.
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, !canManageStores && styles.emptyBtnDisabled]}
            onPress={() => {
              if (!canManageStores) {
                Alert.alert('Household not ready', 'Please wait a moment and try again.');
                return;
              }
              setShowAdd(true);
            }}
            disabled={!canManageStores}
          >
            <Text style={styles.emptyBtnText}>Add your first store</Text>
          </TouchableOpacity>
        </View>
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
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  style={styles.deleteBtn}
                  disabled={removingId === item.id}
                >
                  <Text style={styles.deleteBtnText}>{removingId === item.id ? 'Removing…' : 'Remove'}</Text>
                </TouchableOpacity>
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
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const existingNames = existingStores.map((s) => s.name.toLowerCase());
  const presets = PRESET_STORES.filter((p) => !existingNames.includes(p.toLowerCase()));

  async function handleSave(storeName: string, storeAddress?: string) {
    setSaving(true);
    setError('');
    try {
      const store = await addStore(householdId, storeName, storeAddress);
      onAdd(store);
    } catch (e: any) {
      setError(e.message ?? 'Could not add store.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Add a store</Text>
          <Text style={styles.sheetSubtitle}>Save places your household shops often.</Text>

          {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}

          <Text style={styles.label}>Quick add</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsRow}>
            {presets.map((p) => (
              <TouchableOpacity key={p} style={styles.presetChip} onPress={() => handleSave(p)} disabled={saving}>
                <Text style={styles.presetChipText}>{p}</Text>
              </TouchableOpacity>
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

          <TouchableOpacity
            style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
            onPress={() => handleSave(name.trim(), address.trim() || undefined)}
            disabled={!name.trim() || saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Add store</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
  },
  headerLeft: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 13, color: colors.primary, fontWeight: '800' },
  headerTitle: { fontSize: 30, fontWeight: '900', color: colors.ink },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, backgroundColor: colors.primary, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  addBtnDisabled: { backgroundColor: colors.disabled },
  addBtnText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  heroCard: {
    marginHorizontal: 16, marginBottom: 14, borderRadius: radii.xl,
    backgroundColor: colors.surfaceWarm, padding: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.faint, ...shadow,
  },
  heroNumber: { fontSize: 44, lineHeight: 48, fontWeight: '900', color: colors.ink },
  heroLabel: { fontSize: 14, color: colors.muted, fontWeight: '700' },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: colors.surface, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  heroBadgeText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  separator: { height: 10 },
  row: {
    backgroundColor: colors.surface, borderRadius: radii.lg, padding: 14,
    borderWidth: 1, borderColor: colors.faint,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  storeIcon: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceWarm, flexShrink: 0,
  },
  storeIconActive: { backgroundColor: colors.primarySoft },
  rowLeft: { flex: 1, gap: 4 },
  storeName: { fontSize: 17, fontWeight: '800', color: colors.ink },
  storeAddress: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  noAddress: { fontSize: 13, color: colors.low, fontWeight: '600' },
  rowRight: { alignItems: 'flex-end', gap: 8 },
  geoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5,
  },
  geoPillText: { fontSize: 12, color: colors.primary, fontWeight: '800' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIconWrap: { backgroundColor: colors.primarySoft, borderRadius: radii.xl, padding: 16, marginBottom: 8 },
  emptyTitle: { fontSize: 22, fontWeight: '900', color: colors.ink },
  emptySub: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
  emptyBtnDisabled: { backgroundColor: colors.disabled },
  emptyBtnText: { color: colors.surface, fontSize: 16, fontWeight: '800' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43,33,24,0.42)' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 24, paddingBottom: 40, ...shadow },
  handle: { width: 36, height: 4, backgroundColor: colors.faint, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  sheetSubtitle: { fontSize: 14, color: colors.muted, marginBottom: 18 },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radii.sm, padding: 12, marginBottom: 12 },
  error: { color: colors.dangerText, fontSize: 14 },
  label: { fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', marginBottom: 8 },
  presetsRow: { marginBottom: 20 },
  presetChip: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: colors.primarySoft },
  presetChipText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  input: { borderWidth: 1, borderColor: colors.faint, borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 12, color: colors.ink, backgroundColor: colors.surface },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  saveBtnDisabled: { backgroundColor: colors.disabled },
  saveBtnText: { color: colors.surface, fontSize: 17, fontWeight: '800' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: colors.muted, fontSize: 16, fontWeight: '600' },
});
