import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useItemsStore } from '../store/items';
import { addItem } from '../lib/items';
import { CATEGORY_LABELS, CATEGORY_ICONS, type ItemCategory } from '../constants/defaultItems';

const CATEGORIES: ItemCategory[] = ['fridge', 'freezer', 'pantry'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Props {
  householdId: string;
  userId: string;
  onClose: () => void;
}

export default function AddItemModal({ householdId, userId, onClose }: Props) {
  const { items, upsertItem } = useItemsStore();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('fridge');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const ready = UUID_RE.test(householdId);

  async function handleAdd() {
    if (!ready) {
      setError('Still loading your household. Please close and reopen Add item.');
      return;
    }

    const normalized = name.trim();
    if (!normalized) { setError('Enter an item name.'); return; }

    const existing = items.find((i) => i.name.trim().toLowerCase() === normalized.toLowerCase());
    if (existing) {
      setError(`"${existing.name}" is already in your pantry list.`);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const item = await addItem(householdId, normalized, category, userId);
      upsertItem(item);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Could not add item.');
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

          <Text style={styles.title}>New item</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Item name"
            autoFocus
            value={name}
            onChangeText={(t) => { setName(t); if (error) setError(''); }}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catBtn, category === cat && styles.catBtnActive]}
                onPress={() => setCategory(cat)}
                activeOpacity={0.75}
              >
                <Text style={styles.catIcon}>{CATEGORY_ICONS[cat]}</Text>
                <Text style={[styles.catLabel, category === cat && styles.catLabelActive]}>
                  {CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.addBtn, (!ready || loading) && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!ready || loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.addBtnText}>Add to pantry</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.6}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
    color: '#111827',
    backgroundColor: '#FAFAFA',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  categoryRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  catBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    gap: 6,
  },
  catBtnActive: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  catIcon: { fontSize: 22 },
  catLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  catLabelActive: { color: '#fff' },
  addBtn: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  addBtnDisabled: { backgroundColor: '#D1D5DB' },
  addBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: '#9CA3AF', fontSize: 16, fontWeight: '500' },
});
