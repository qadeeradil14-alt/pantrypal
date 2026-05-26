import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHouseholdStore } from '../../../store/household';
import { useAuthStore } from '../../../store/auth';
import { uploadReceipt, fetchReceipts, getSpendByStore, type Receipt } from '../../../lib/receipts';
import { radii, shadow } from '../../../constants/theme';
import type { AppColors } from '../../../constants/theme';
import { useTheme } from '../../../hooks/useTheme';
import EmptyState from '../../../components/EmptyState';

export default function ReceiptsScreen() {
  const { colors } = useTheme();
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

  const styles = useMemo(() => makeStyles(colors), [colors]);

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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>Spending</Text>
          <Text style={styles.headerTitle}>Receipts</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, !canUpload && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={!canUpload}
          activeOpacity={0.8}
        >
          {uploading
            ? <ActivityIndicator color={colors.surface} size="small" />
            : (
              <>
                <Ionicons name="scan-outline" size={18} color={colors.surface} />
                <Text style={styles.addBtnText}>Scan</Text>
              </>
            )
          }
        </TouchableOpacity>
      </View>

      <FlatList
        data={receipts}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            <View style={styles.summaryCard}>
              <View>
                <Text style={styles.summaryLabel}>Processed this month</Text>
                <Text style={styles.summaryTotal}>${totalThisMonth.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryIcon}>
                <Ionicons name="receipt-outline" size={24} color={colors.primary} />
              </View>
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
          <EmptyState
            emoji="🧾"
            title="No receipts yet"
            subtitle="Tap Scan after a grocery trip to automatically track your spending."
            action={{ label: 'Scan a receipt', onPress: handleAdd }}
          />
        }
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const statusColor = receipt.status === 'done' ? colors.primary : receipt.status === 'failed' ? colors.danger : colors.low;
  const statusLabel = receipt.status === 'done' ? 'Done' : receipt.status === 'failed' ? 'Failed' : 'Processing…';
  const statusIcon = receipt.status === 'done'
    ? 'checkmark-circle'
    : receipt.status === 'failed'
      ? 'alert-circle'
      : 'time-outline';

  return (
    <View style={styles.card}>
      <View style={styles.cardIcon}>
        <Ionicons name="receipt-outline" size={18} color={colors.primary} />
      </View>
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
            <Ionicons name={statusIcon} size={13} color={statusColor} />
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

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
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
      gap: 6, backgroundColor: colors.primary, borderRadius: 999,
      paddingHorizontal: 14, paddingVertical: 10, minWidth: 82,
    },
    addBtnDisabled: { backgroundColor: colors.disabled },
    addBtnText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
    summaryCard: {
      marginHorizontal: 16, marginBottom: 14, backgroundColor: colors.surfaceWarm, borderRadius: radii.xl,
      padding: 18, borderWidth: 1, borderColor: colors.faint, ...shadow,
    },
    summaryIcon: {
      position: 'absolute', right: 18, top: 18, width: 46, height: 46, borderRadius: 23,
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
    },
    summaryLabel: { fontSize: 14, color: colors.muted, fontWeight: '700', marginBottom: 4 },
    summaryTotal: { fontSize: 42, lineHeight: 48, fontWeight: '900', color: colors.ink, marginBottom: 16 },
    storeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.faint },
    storeName: { fontSize: 15, color: colors.muted, fontWeight: '600' },
    storeAmount: { fontSize: 15, fontWeight: '800', color: colors.ink },
    sectionLabel: { paddingHorizontal: 20, paddingBottom: 8, fontSize: 12, fontWeight: '900', color: colors.muted, textTransform: 'uppercase' },
    list: { paddingBottom: 120 },
    card: {
      backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 10,
      borderRadius: radii.lg, padding: 14, borderWidth: 1, borderColor: colors.faint,
      flexDirection: 'row', gap: 12,
    },
    cardIcon: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.primarySoft, flexShrink: 0,
    },
    cardTop: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardStore: { fontSize: 17, fontWeight: '800', color: colors.ink },
    cardDate: { fontSize: 13, color: colors.muted, marginTop: 2, fontWeight: '500' },
    cardRight: { alignItems: 'flex-end', gap: 6 },
    cardTotal: { fontSize: 18, fontWeight: '900', color: colors.ink },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
    statusText: { fontSize: 12, fontWeight: '800' },
    cardItems: { fontSize: 13, color: colors.muted, marginTop: 10, fontWeight: '600' },
  });
}
