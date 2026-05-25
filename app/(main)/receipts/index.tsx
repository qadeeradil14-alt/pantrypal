import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHouseholdStore } from '../../../store/household';
import { useAuthStore } from '../../../store/auth';
import { uploadReceipt, fetchReceipts, getSpendByStore, type Receipt } from '../../../lib/receipts';

export default function ReceiptsScreen() {
  const { household } = useHouseholdStore();
  const { session } = useAuthStore();
  const householdId = household?.id ?? null;
  const userId = session?.user?.id ?? null;
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [spendByStore, setSpendByStore] = useState<{ store: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const canUpload = !!householdId && !!userId && !uploading;

  const load = useCallback(async () => {
    if (!householdId) {
      setReceipts([]);
      setSpendByStore([]);
      return;
    }
    const [r, s] = await Promise.all([
      fetchReceipts(householdId),
      getSpendByStore(householdId),
    ]);
    setReceipts(r);
    setSpendByStore(s);
  }, [householdId]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleCapture(source: 'camera' | 'library') {
    if (!householdId || !userId) {
      Alert.alert('Not ready yet', 'Please wait for your household/session to finish loading.');
      return;
    }
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permission needed', `Please allow ${source} access in Settings.`);
        return;
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8, base64: false })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
          });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      setUploading(true);

      const receipt = await uploadReceipt(
        householdId,
        userId,
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
      );
      setReceipts((prev) => [receipt, ...prev]);
      Alert.alert('Receipt uploaded', 'Processing your receipt — this takes about 30 seconds.');
    } catch (e: any) {
      const message = e?.message ?? 'Try again.';
      if (source === 'camera' && message.toLowerCase().includes('camera not available')) {
        Alert.alert('Camera unavailable', 'Camera is not available here. Use "Choose from Library" instead.');
      } else {
        Alert.alert('Upload failed', message);
      }
    } finally {
      setUploading(false);
    }
  }

  function handleAdd() {
    Alert.alert('Add Receipt', 'How would you like to add your receipt?', [
      { text: 'Take Photo', onPress: () => { void handleCapture('camera'); } },
      { text: 'Choose from Library', onPress: () => { void handleCapture('library'); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const totalThisMonth = spendByStore.reduce((sum, s) => sum + s.total, 0);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="'#16A34A'" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Receipts</Text>
        <TouchableOpacity
          style={[styles.addBtn, !canUpload && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={!canUpload}
        >
          {uploading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.addBtnText}>+ Scan</Text>
          }
        </TouchableOpacity>
      </View>

      <FlatList
        data={receipts}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="'#16A34A'" />}
        ListHeaderComponent={
          <View>
            {/* Spend summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Spent this month (processed receipts)</Text>
              <Text style={styles.summaryTotal}>${totalThisMonth.toFixed(2)}</Text>
              {spendByStore.map((s) => (
                <View key={s.store} style={styles.storeRow}>
                  <Text style={styles.storeName}>{s.store}</Text>
                  <Text style={styles.storeAmount}>${s.total.toFixed(2)}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.sectionLabel}>Recent receipts</Text>
          </View>
        }
        renderItem={({ item }) => <ReceiptCard receipt={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🧾</Text>
            <Text style={styles.emptyTitle}>No receipts yet</Text>
            <Text style={styles.emptySub}>Tap + Scan after a grocery trip to track your spending automatically.</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const statusColor = receipt.status === 'done' ? '#16A34A' : receipt.status === 'failed' ? '#DC2626' : '#D97706';
  const statusLabel = receipt.status === 'done' ? 'Done' : receipt.status === 'failed' ? 'Failed' : 'Processing…';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.cardStore}>{receipt.store_name ?? 'Unknown store'}</Text>
          <Text style={styles.cardDate}>
            {receipt.transaction_date
              ? new Date(receipt.transaction_date).toLocaleDateString()
              : new Date(receipt.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.cardRight}>
          {receipt.total_amount != null && (
            <Text style={styles.cardTotal}>${receipt.total_amount.toFixed(2)}</Text>
          )}
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
      </View>
      {receipt.receipt_items && receipt.receipt_items.length > 0 && (
        <Text style={styles.cardItems}>
          {receipt.receipt_items.length} items
          {receipt.receipt_items.filter(i => i.matched_item_id).length > 0 &&
            ` · ${receipt.receipt_items.filter(i => i.matched_item_id).length} matched to pantry`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },
  addBtn: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnDisabled: { backgroundColor: '#D1D5DB' },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  summaryCard: {
    margin: 16, backgroundColor: '#fff', borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: '#E5E7EB',
  },
  summaryLabel: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  summaryTotal: { fontSize: 36, fontWeight: '800', color: '#111827', marginBottom: 16 },
  storeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  storeName: { fontSize: 15, color: '#555' },
  storeAmount: { fontSize: 15, fontWeight: '600', color: '#111827' },
  sectionLabel: { paddingHorizontal: 20, paddingBottom: 8, fontSize: 13, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  list: { paddingBottom: 32 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardStore: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardDate: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardTotal: { fontSize: 18, fontWeight: '700', color: '#111827' },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardItems: { fontSize: 13, color: '#6B7280', marginTop: 10 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
});
