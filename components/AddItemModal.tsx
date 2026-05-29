import { useEffect, useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useItemsStore } from '../store/items';
import { useStoresStore } from '../store/stores';
import { addItemWithQueue } from '../lib/items';
import { setItemStoreWithQueue } from '../lib/stores';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../lib/haptics';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';
import ScalePressable from './ScalePressable';
import StoreLogo from './StoreLogo';
import type { Item } from '../lib/items';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Props {
  householdId: string;
  userId: string;
  initialStoreId?: string | null;
  onAdded?: (item: Item) => void;
  onClose: () => void;
}

export default function AddItemModal({ householdId, userId, initialStoreId, onAdded, onClose }: Props) {
  const { colors } = useTheme();
  const { items, upsertItem } = useItemsStore();
  const stores = useStoresStore((state) => state.stores);
  const [name, setName] = useState('');
  const [storeId, setStoreId] = useState<string | null>(initialStoreId ?? stores[0]?.id ?? null);
  const [storeTouched, setStoreTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const ready = UUID_RE.test(householdId);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (initialStoreId !== undefined) {
      setStoreId(initialStoreId);
      return;
    }
    if (!storeTouched && !storeId && stores.length > 0) setStoreId(stores[0].id);
  }, [initialStoreId, storeId, storeTouched, stores]);

  async function handleAdd() {
    if (!ready) {
      setError('Still loading your household. Please close and reopen.');
      void hapticWarning();
      return;
    }
    const normalized = name.trim();
    if (!normalized) { setError('Enter an item name.'); void hapticWarning(); return; }
    const existing = items.find((i) => i.name.trim().toLowerCase() === normalized.toLowerCase());
    if (existing) {
      if (storeId && existing.preferred_store_id !== storeId) {
        const updated = { ...existing, preferred_store_id: storeId };
        upsertItem(updated);
        setLoading(true);
        try {
          await setItemStoreWithQueue(existing.id, storeId);
          onAdded?.(updated);
          void hapticSuccess();
          onClose();
        } catch (e: any) {
          upsertItem(existing);
          setError(e.message ?? 'Could not update item.');
          void hapticError();
        } finally {
          setLoading(false);
        }
        return;
      }
      setError(`"${existing.name}" is already in My Groceries.`);
      void hapticWarning();
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { item, queued } = await addItemWithQueue(householdId, normalized, 'pantry', userId, storeId);
      upsertItem(item);
      onAdded?.(item);
      void hapticSuccess();
      if (queued) {
        setError('Saved offline — will sync when you’re back online.');
        setTimeout(onClose, 900);
        return;
      }
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Could not add item.');
      void hapticError();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.title}>New grocery</Text>
              <Text style={styles.subtitle}>Add it to My Groceries.</Text>
            </View>
            <View style={styles.sheetIcon}>
              <Ionicons name="add" size={20} color={colors.primary} />
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Milk, eggs, rice..."
            autoFocus
            value={name}
            onChangeText={(t) => { setName(t); if (error) setError(''); }}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
            placeholderTextColor={colors.placeholder}
          />

          <Text style={styles.label}>Store</Text>
          {stores.length === 0 ? (
            <View style={styles.noStoresBox}>
              <Text style={styles.noStoresText}>No stores yet. Add stores from the Stores tab, or add this unassigned.</Text>
            </View>
          ) : (
            <View style={styles.storeGrid}>
              {stores.map((store) => {
                const active = storeId === store.id;
                return (
                  <ScalePressable
                    key={store.id}
                    profile="chip"
                    style={[styles.storeBtn, active && styles.storeBtnActive]}
                    onPress={() => {
                      void hapticSelection();
                      setStoreTouched(true);
                      setStoreId(active ? null : store.id);
                    }}
                  >
                    <StoreLogo name={store.name} size={34} domain={store.brand_domain} logoUrl={store.logo_url} />
                    <Text style={[styles.storeLabel, active && styles.storeLabelActive]} numberOfLines={1}>
                      {store.name}
                    </Text>
                  </ScalePressable>
                );
              })}
            </View>
          )}

          <ScalePressable
            style={[styles.addBtn, (!ready || loading) && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!ready || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.addBtnText}>{storeId ? 'Add to store' : 'Add unassigned'}</Text>}
          </ScalePressable>

          <ScalePressable style={styles.cancelBtn} profile="chip" onPress={() => { void hapticSelection(); onClose(); }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </ScalePressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(15, 10, 8, 0.5)',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 24,
      paddingBottom: 40,
    },
    handle: {
      width: 36, height: 4,
      backgroundColor: colors.faint,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 18,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    sheetIcon: {
      width: 46, height: 46, borderRadius: 23,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    title: { fontSize: 22, fontFamily: fonts.displayItalic, color: colors.ink, marginBottom: 4, letterSpacing: 0 },
    subtitle: { fontSize: 14, color: colors.muted, fontFamily: fonts.body },
    errorBox: {
      backgroundColor: colors.dangerSoft,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 17,
      marginBottom: 20,
      color: colors.ink,
      backgroundColor: colors.background,
    },
    label: {
      fontSize: 12, fontFamily: fonts.bodySemiBold,
      color: colors.muted,
      textTransform: 'uppercase',
      marginBottom: 10,
      letterSpacing: 0.5,
    },
    storeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 24,
    },
    storeBtn: {
      width: '31%',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      paddingVertical: 12,
      paddingHorizontal: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      gap: 6,
    },
    storeBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    storeLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    storeLabelActive: { color: colors.primary },
    noStoresBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: 14,
      backgroundColor: colors.background,
      padding: 14,
      marginBottom: 24,
    },
    noStoresText: { fontSize: 13, color: colors.muted, lineHeight: 19, fontFamily: fonts.bodyMedium },
    addBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 10,
    },
    addBtnDisabled: { backgroundColor: colors.disabled },
    addBtnText: { color: '#FFFFFF', fontSize: 17, fontFamily: fonts.bodySemiBold },
    cancelBtn: { paddingVertical: 14, alignItems: 'center' },
    cancelText: { color: colors.muted, fontSize: 16, fontFamily: fonts.bodySemiBold },
  });
}
