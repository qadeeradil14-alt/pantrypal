import { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useItemsStore } from '../store/items';
import {
  ItemConflictError,
  isOfflineItemId,
  updateItemDetailsWithQueue,
  deleteItemWithQueue,
} from '../lib/items';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../lib/haptics';
import { CATEGORY_LABELS, type ItemCategory } from '../constants/defaultItems';
import type { Item } from '../lib/items';
import { useTheme } from '../hooks/useTheme';
import type { AppColors } from '../constants/theme';
import ScalePressable from './ScalePressable';

const CATEGORIES: ItemCategory[] = ['fridge', 'freezer', 'pantry'];
const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  fridge: '🥛',
  freezer: '🧊',
  pantry: '🧺',
};

interface Props {
  item: Item;
  onClose: () => void;
}

export default function EditItemModal({ item, onClose }: Props) {
  const { colors } = useTheme();
  const { updateItem, removeItem, restoreItem } = useItemsStore();
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<ItemCategory>(
    (item.category as ItemCategory) ?? 'pantry',
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isDirty = name.trim() !== item.name || category !== item.category;

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Name cannot be empty.'); return; }
    setError('');
    setSaving(true);
    const prev = { name: item.name, category: item.category };
    updateItem(item.id, { name: trimmed, category });
    try {
      if (isOfflineItemId(item.id)) {
        setError('This item will sync when you’re back online.');
        void hapticWarning();
        return;
      }
      const { queued, item: saved } = await updateItemDetailsWithQueue(
        item.id,
        { name: trimmed, category },
        item.updated_at,
      );
      if (saved) {
        updateItem(item.id, {
          name: saved.name,
          category: saved.category as ItemCategory,
          updated_at: saved.updated_at,
        });
      }
      void hapticSuccess();
      if (queued) {
        setError('Saved offline — will sync when you’re back online.');
        setTimeout(onClose, 900);
        return;
      }
      onClose();
    } catch (e: unknown) {
      updateItem(item.id, prev);
      if (e instanceof ItemConflictError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Could not save. Try again.');
      }
      void hapticError();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert('Delete item', `Remove "${item.name}" from your pantry?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          void hapticWarning();
          setDeleting(true);
          removeItem(item.id);
          try {
            await deleteItemWithQueue(item.id);
            void hapticSuccess();
            onClose();
          } catch (e: any) {
            restoreItem(item);
            setError(e?.message ?? 'Could not delete. Try again.');
            void hapticError();
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
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
              <Text style={styles.title}>Edit item</Text>
              <Text style={styles.subtitle}>Rename or recategorize.</Text>
            </View>
            <View style={styles.sheetIcon}>
              <Ionicons name="create-outline" size={18} color={colors.primary} />
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(t) => { setName(t); if (error) setError(''); }}
            onSubmitEditing={handleSave}
            returnKeyType="done"
            placeholderTextColor={colors.placeholder}
            autoFocus
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <ScalePressable
                  key={cat}
                  profile="chip"
                  style={[styles.catBtn, active && styles.catBtnActive]}
                  onPress={() => { void hapticSelection(); setCategory(cat); }}
                >
                  <Text style={styles.catEmoji}>{CATEGORY_EMOJI[cat]}</Text>
                  <Text style={[styles.catLabel, active && styles.catLabelActive]}>
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </ScalePressable>
              );
            })}
          </View>

          <ScalePressable
            style={[styles.saveBtn, (!isDirty || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!isDirty || saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Save changes</Text>}
          </ScalePressable>

          <ScalePressable
            profile="danger"
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={deleting}
          >
            {deleting
              ? <ActivityIndicator color={colors.danger} />
              : (
                <>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={styles.deleteBtnText}>Delete item</Text>
                </>
              )}
          </ScalePressable>

          <ScalePressable style={styles.cancelBtn} profile="chip" onPress={onClose}>
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
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    title: { fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 2, letterSpacing: -0.2 },
    subtitle: { fontSize: 14, color: colors.muted },
    errorBox: { backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12, marginBottom: 12 },
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
      fontWeight: '700',
    },
    label: {
      fontSize: 12, fontWeight: '800',
      color: colors.muted,
      textTransform: 'uppercase',
      marginBottom: 10,
      letterSpacing: 0.5,
    },
    categoryRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    catBtn: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', paddingVertical: 14,
      borderRadius: 14, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.background, gap: 6,
    },
    catBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    catEmoji: { fontSize: 22 },
    catLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
    catLabelActive: { color: colors.primary },
    saveBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', marginBottom: 10,
    },
    saveBtnDisabled: { backgroundColor: colors.disabled },
    saveBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
    deleteBtn: {
      flexDirection: 'row', gap: 8,
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: 14, borderRadius: 14,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1, borderColor: colors.danger + '33',
      marginBottom: 8,
    },
    deleteBtnText: { color: colors.danger, fontSize: 15, fontWeight: '800' },
    cancelBtn: { paddingVertical: 12, alignItems: 'center' },
    cancelText: { color: colors.muted, fontSize: 16, fontWeight: '600' },
  });
}
