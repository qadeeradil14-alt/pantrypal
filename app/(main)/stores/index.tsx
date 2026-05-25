import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHouseholdStore } from '../../../store/household';
import { useStoresStore } from '../../../store/stores';
import { fetchStores, addStore, deleteStore, PRESET_STORES, type Store } from '../../../lib/stores';
import { startGeofencing, stopGeofencing } from '../../../lib/geofencing';

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
    return <View style={styles.centered}><ActivityIndicator size="large" color="'#16A34A'" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Stores</Text>
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
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {stores.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🏪</Text>
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
                    <Text style={styles.geoPillText}>📍 Active</Text>
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

          {error ? <Text style={styles.error}>{error}</Text> : null}

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
            placeholderTextColor="#aaa"
          />
          <TextInput
            style={styles.input}
            placeholder="Address (optional — enables geofencing)"
            value={address}
            onChangeText={setAddress}
            placeholderTextColor="#aaa"
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
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },
  addBtn: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnDisabled: { backgroundColor: '#D1D5DB' },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  list: { padding: 16, gap: 10 },
  row: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  rowLeft: { flex: 1, gap: 4 },
  storeName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  storeAddress: { fontSize: 13, color: '#6B7280' },
  noAddress: { fontSize: 13, color: '#F59E0B' },
  rowRight: { alignItems: 'flex-end', gap: 8 },
  geoPill: { backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  geoPillText: { fontSize: 12, color: '#16A34A', fontWeight: '600' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: '#DC2626', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  emptyBtn: { backgroundColor: '#16A34A', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
  emptyBtnDisabled: { backgroundColor: '#D1D5DB' },
  emptyBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 16 },
  error: { backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 14 },
  label: { fontSize: 12, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  presetsRow: { marginBottom: 20 },
  presetChip: { backgroundColor: '#F0F9FF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: '#BAE6FD' },
  presetChipText: { color: '#0369A1', fontSize: 14, fontWeight: '500' },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 12, color: '#111827' },
  saveBtn: { backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  saveBtnDisabled: { backgroundColor: '#D1D5DB' },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#6B7280', fontSize: 16 },
});
