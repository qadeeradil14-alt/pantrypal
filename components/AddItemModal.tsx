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
          <Text style={styles.title}>Add item</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Item name"
            autoFocus
            value={name}
            onChangeText={setName}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
            placeholderTextColor="#aaa"
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catBtn, category === cat && styles.catBtnActive]}
                onPress={() => setCategory(cat)}
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
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.addBtnText}>Add to pantry</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#E5E7EB',
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },
  error: {
    backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 8,
    padding: 12, marginBottom: 12, fontSize: 14,
  },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    marginBottom: 16, color: '#1a1a1a',
  },
  label: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  categoryRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  catBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', gap: 4,
  },
  catBtnActive: { borderColor: '#2D9CDB', backgroundColor: '#F0F9FF' },
  catIcon: { fontSize: 22 },
  catLabel: { fontSize: 12, color: '#888', fontWeight: '500' },
  catLabelActive: { color: '#2D9CDB' },
  addBtn: {
    backgroundColor: '#2D9CDB', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  addBtnDisabled: { backgroundColor: '#93C5FD' },
  addBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#888', fontSize: 16 },
});
