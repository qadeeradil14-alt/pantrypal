import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  View, Text, SectionList, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
  Modal, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHouseholdStore } from '../../../store/household';
import { useAuthStore } from '../../../store/auth';
import { useSettingsStore } from '../../../store/settings';
import { useDataSignal } from '../../../store/dataSignal';
import { useItemsStore } from '../../../store/items';
import { addItemWithQueue } from '../../../lib/items';
import { uploadReceipt, fetchReceipts, deleteReceipt, deleteReceiptsSince, addManualReceipt, deleteReceiptItem, getSpendSummary, type Receipt, type SpendSummary } from '../../../lib/receipts';
import { localToday, parseLocalDate } from '../../../lib/dates';
import { normalizeStoreName } from '../../../lib/stores';
import { radii, shadow, fonts } from '../../../constants/theme';
import { makeSheetStyles } from '../../../constants/sheetStyles';
import ScalePressable from '../../../components/ScalePressable';
import StoreLogo from '../../../components/StoreLogo';
import type { AppColors } from '../../../constants/theme';
import { useTheme } from '../../../hooks/useTheme';
import EmptyState from '../../../components/EmptyState';

interface ReceiptSection {
  title: string;
  data: Receipt[];
}

function groupReceiptsByTime(receipts: Receipt[]): ReceiptSection[] {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  const thisWeek = receipts.filter((r) => new Date(r.created_at).getTime() >= sevenDaysAgo);
  const lastWeek = receipts.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t >= fourteenDaysAgo && t < sevenDaysAgo;
  });
  const earlier = receipts.filter((r) => new Date(r.created_at).getTime() < fourteenDaysAgo);

  const sections: ReceiptSection[] = [];
  if (thisWeek.length > 0) sections.push({ title: 'This week', data: thisWeek });
  if (lastWeek.length > 0) sections.push({ title: 'Last week', data: lastWeek });
  if (earlier.length > 0) sections.push({ title: 'Earlier', data: earlier });
  return sections;
}

export default function ReceiptsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string; fromTrip?: string; store?: string }>();
  const { household } = useHouseholdStore();
  const { session } = useAuthStore();
  const weeklyBudget = useSettingsStore((s) => s.weeklyBudget);
  const { upsertItem } = useItemsStore();
  const householdId = household?.id ?? null;
  const userId = session?.user?.id ?? null;

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [spend, setSpend] = useState<SpendSummary>({ weeklyTotal: 0, monthlyTotal: 0, byStore: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<'idle' | 'picking' | 'uploading' | 'processing' | 'failed'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploadSource, setLastUploadSource] = useState<'camera' | 'library' | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [pantryPickMode, setPantryPickMode] = useState(false);
  const [selectedPantryIds, setSelectedPantryIds] = useState<Set<string>>(new Set());
  const [addingToPantry, setAddingToPantry] = useState(false);

  // Quick Add Spend modal
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickStore, setQuickStore] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickDate, setQuickDate] = useState(() => localToday());
  const [quickSaving, setQuickSaving] = useState(false);

  const canUpload = !!householdId && !!userId && !uploading;
  const sheetStyles = useMemo(() => makeSheetStyles(colors), [colors]);
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const autoCameraHandledRef = useRef(false);

  const load = useCallback(async () => {
    if (!householdId || !userId) {
      setReceipts([]);
      setSpend({ weeklyTotal: 0, monthlyTotal: 0, byStore: [] });
      return;
    }
    const [r, s] = await Promise.all([
      fetchReceipts(householdId),
      getSpendSummary(householdId),
    ]);
    setReceipts(r);
    setSpend(s);
  }, [householdId, userId]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Live refresh when a receipt is written elsewhere (trip spend sheet, partner
  // device) so the list + spend totals update without a tab switch / restart.
  const receiptsVersion = useDataSignal((s) => s.receiptsVersion);
  useEffect(() => { void load(); }, [receiptsVersion, load]);

  useEffect(() => {
    const hasProcessing = receipts.some((r) => r.status === 'processing');
    if (!hasProcessing) return;
    const id = setInterval(() => { void load(); }, 12000);
    return () => clearInterval(id);
  }, [receipts, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleCapture(source: 'camera' | 'library') {
    if (!householdId || !userId) {
      Alert.alert('Not ready yet', 'Please wait for your household to finish loading.');
      return;
    }
    try {
      setLastUploadSource(source);
      setUploadError(null);
      setUploadStage('picking');
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setUploadStage('failed');
        setUploadError(`${source === 'camera' ? 'Camera' : 'Photo library'} permission is needed.`);
        Alert.alert('Permission needed', `Please allow ${source} access in Settings.`);
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8, base64: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets[0]) {
        setUploadStage('idle');
        return;
      }
      const asset = result.assets[0];
      setUploading(true);
      setUploadStage('uploading');
      const receipt = await uploadReceipt(householdId, userId, asset.uri, asset.mimeType ?? 'image/jpeg');
      setReceipts((prev) => [receipt, ...prev]);
      useDataSignal.getState().bumpReceipts();
      setUploadStage('processing');
      Alert.alert('Receipt added', 'Processing this receipt. You can add another one any time.');
    } catch (e: any) {
      const message = e?.message ?? 'Try again.';
      setUploadStage('failed');
      setUploadError(message);
      if (source === 'camera' && message.toLowerCase().includes('camera not available')) {
        Alert.alert('Camera unavailable', 'Use "Choose from Library" instead.');
      } else {
        Alert.alert('Upload failed', message);
      }
    } finally {
      setUploading(false);
      if (uploadStage !== 'failed') {
        setTimeout(() => {
          setUploadStage((current) => (current === 'processing' ? 'idle' : current));
        }, 3500);
      }
    }
  }

  useFocusEffect(useCallback(() => {
    if (params.action !== 'camera') {
      autoCameraHandledRef.current = false;
      return;
    }
    if (autoCameraHandledRef.current || !canUpload) return;
    autoCameraHandledRef.current = true;
    router.setParams({ action: '', fromTrip: '' });
    void handleCapture('camera');
  }, [canUpload, params.action, router]));

  // Deep-link from the trip summary "Add receipt" on a store that's missing one:
  // open the manual quick-add prefilled with that store name.
  useFocusEffect(useCallback(() => {
    if (!params.store) return;
    setQuickStore(params.store);
    setQuickAmount('');
    setQuickDate(localToday());
    setShowQuickAdd(true);
    router.setParams({ store: '' });
  }, [params.store, router]));

  function retryUpload() {
    if (lastUploadSource) {
      void handleCapture(lastUploadSource);
      return;
    }
    handleAdd();
  }

  function handleAdd() {
    Alert.alert('Add receipt', 'How would you like to add this receipt?', [
      { text: 'Take Photo', onPress: () => { void handleCapture('camera'); } },
      { text: 'Choose from Library', onPress: () => { void handleCapture('library'); } },
      { text: 'Enter Manually', onPress: () => {
        setQuickStore('');
        setQuickAmount('');
        setQuickDate(localToday());
        setShowQuickAdd(true);
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSaveQuickAdd() {
    if (!householdId || !userId) return;
    const amount = parseFloat(quickAmount.replace(/[^0-9.]/g, ''));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid dollar amount.');
      return;
    }
    const store = quickStore.trim() || 'Unknown store';
    const date = quickDate.trim() || localToday();
    setQuickSaving(true);
    try {
      const receipt = await addManualReceipt(householdId, userId, store, amount, date);
      setReceipts((prev) => [receipt, ...prev]);
      setShowQuickAdd(false);
      // Refresh spend summary
      getSpendSummary(householdId).then((s) => setSpend(s)).catch(() => {});
      useDataSignal.getState().bumpReceipts();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setQuickSaving(false);
    }
  }

  function handleResetWeek() {
    if (!householdId || receipts.length === 0) return;
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thisWeekCount = receipts.filter((r) => new Date(r.created_at).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000).length;
    if (thisWeekCount === 0) {
      Alert.alert('Nothing to reset', 'There are no receipts from this week.');
      return;
    }
    Alert.alert(
      'Reset this week?',
      `This will delete ${thisWeekCount} ${thisWeekCount === 1 ? 'receipt' : 'receipts'} from this week. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReceiptsSince(householdId, sevenDaysAgoIso);
              await load();
              useDataSignal.getState().bumpReceipts();
            } catch (e: any) {
              Alert.alert('Reset failed', e?.message ?? 'Please try again.');
            }
          },
        },
      ],
    );
  }

  const sections = useMemo(() => groupReceiptsByTime(receipts), [receipts]);
  const budgetProgress = Math.min(spend.weeklyTotal / weeklyBudget, 1);
  const budgetColor = budgetProgress > 0.9 ? colors.danger : budgetProgress > 0.65 ? colors.warning : colors.success;
  const maxStoreTotal = Math.max(...spend.byStore.map((s) => s.total), 1);

  useEffect(() => {
    setPantryPickMode(false);
    setSelectedPantryIds(new Set());
  }, [selectedReceipt?.id]);

  async function handleConfirmAddToPantry() {
    if (!householdId || !userId || selectedPantryIds.size === 0) return;
    setAddingToPantry(true);
    try {
      const toAdd = (selectedReceipt?.receipt_items ?? []).filter((i) => selectedPantryIds.has(i.id));
      await Promise.all(
        toAdd.map(async (ri) => {
          const { item } = await addItemWithQueue(householdId, ri.name, 'pantry', userId);
          upsertItem(item);
        }),
      );
      setPantryPickMode(false);
      setSelectedPantryIds(new Set());
      Alert.alert('Added to Pantry', `${toAdd.length} ${toAdd.length === 1 ? 'item' : 'items'} added.`);
    } catch {
      Alert.alert('Could not add items', 'Please try again.');
    } finally {
      setAddingToPantry(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>Spending</Text>
          <Text style={styles.headerTitle} testID="receipts-header">Receipts</Text>
        </View>
        <View style={styles.headerActions}>
          <ScalePressable
            style={styles.resetBtn}
            onPress={handleResetWeek}
          >
            <Text style={styles.resetBtnText}>Reset</Text>
          </ScalePressable>
          <ScalePressable
            style={[styles.addBtn, !canUpload && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!canUpload}
          >
            {uploading
              ? <ActivityIndicator color={colors.onPrimary} size="small" />
              : (
                <>
                  <Ionicons name="scan-outline" size={18} color={colors.onPrimary} />
                  <Text style={styles.addBtnText}>Scan</Text>
                </>
              )}
          </ScalePressable>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View>
            {/* Budget tracker */}
            {uploadStage !== 'idle' && (
              <View style={[
                styles.uploadBanner,
                uploadStage === 'failed' && styles.uploadBannerFailed,
              ]}>
                <View style={styles.uploadIcon}>
                  {uploadStage === 'failed' ? (
                    <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
                  ) : (
                    <ActivityIndicator size="small" color={colors.primary} />
                  )}
                </View>
                <View style={styles.uploadBody}>
                  <Text style={styles.uploadTitle}>
                    {uploadStage === 'failed'
                      ? 'Receipt upload failed'
                      : uploadStage === 'processing'
                      ? 'Receipt processing'
                      : uploadStage === 'picking'
                      ? 'Opening picker'
                      : 'Uploading receipt'}
                  </Text>
                  <Text style={styles.uploadSub} numberOfLines={2}>
                    {uploadStage === 'failed'
                      ? uploadError ?? 'Try again.'
                      : uploadStage === 'processing'
                      ? 'Pull down to refresh if it does not update soon.'
                      : 'Keep Stokit open until the upload finishes.'}
                  </Text>
                </View>
                {uploadStage === 'failed' ? (
                  <ScalePressable style={styles.uploadRetryBtn} onPress={retryUpload}>
                    <Text style={styles.uploadRetryText}>Retry</Text>
                  </ScalePressable>
                ) : null}
              </View>
            )}

            <View style={styles.budgetCard}>
              <View style={styles.budgetCardTop}>
                <View>
                  <Text style={styles.budgetLabel}>This week</Text>
                  <Text style={styles.budgetAmount}>${spend.weeklyTotal.toFixed(2)}</Text>
                  <Text style={styles.budgetSub}>of ${weeklyBudget} budget</Text>
                </View>
                <View style={[styles.budgetIconWrap, { backgroundColor: budgetColor + '18' }]}>
                  <Ionicons name="wallet-outline" size={24} color={budgetColor} />
                </View>
              </View>
              <View style={styles.budgetBarTrack}>
                <View style={[styles.budgetBarFill, {
                  width: `${Math.round(budgetProgress * 100)}%` as any,
                  backgroundColor: budgetColor,
                }]} />
              </View>
              <Text style={[styles.budgetBarLabel, { color: budgetColor }]}>
                {budgetProgress >= 1
                  ? 'Over budget'
                  : `$${(weeklyBudget - spend.weeklyTotal).toFixed(2)} remaining`}
              </Text>
            </View>

            {/* Store breakdown with bars */}
            {spend.byStore.length > 0 && (
              <View style={styles.storeCard}>
                <Text style={styles.sectionLabel}>Last 30 days by store</Text>
                {spend.byStore.map((s) => (
                  <View key={s.store} style={styles.storeRow}>
                    <Text style={styles.storeName} numberOfLines={1}>{normalizeStoreName(s.store)}</Text>
                    <View style={styles.storeBarWrap}>
                      <View style={styles.storeBarTrack}>
                        <View style={[styles.storeBarFill, {
                          width: `${Math.round((s.total / maxStoreTotal) * 100)}%` as any,
                        }]} />
                      </View>
                      <Text style={styles.storeAmount}>${s.total.toFixed(2)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {receipts.length > 0 && (
              <Text style={styles.receiptsSectionTitle}>Receipts</Text>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.timeSectionHeader}>
            <Text style={styles.timeSectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <ScalePressable
            profile="card"
            style={styles.card}
            onPress={() => setSelectedReceipt(item)}
          >
            <StoreLogo name={item.store_name ?? 'Receipt'} size={40} fallbackToAppIcon />
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardStore}>{normalizeStoreName(item.store_name ?? 'Unknown store')}</Text>
                  <Text style={styles.cardDate}>
                    {item.transaction_date
                      ? parseLocalDate(item.transaction_date).toLocaleDateString()
                      : new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.cardRight}>
                  {item.total_amount != null && (
                    <Text style={styles.cardTotal}>${item.total_amount.toFixed(2)}</Text>
                  )}
                  <StatusPill status={item.status} colors={colors} styles={styles} />
                </View>
              </View>
              {item.receipt_items && item.receipt_items.length > 0 && (
                <Text style={styles.cardItems}>
                  {item.receipt_items.length} {item.receipt_items.length === 1 ? 'item' : 'items'}
                  {item.receipt_items.filter((i) => i.matched_item_id).length > 0 &&
                    ` · ${item.receipt_items.filter((i) => i.matched_item_id).length} matched to pantry`}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.muted} />
          </ScalePressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
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

      {/* Receipt detail modal */}
      <Modal
        visible={!!selectedReceipt}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedReceipt(null)}
      >
        <View style={sheetStyles.formOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedReceipt(null)} />
          <View style={styles.detailSheet}>
            <View style={sheetStyles.handle} />

            <View style={styles.detailHeader}>
              <View style={sheetStyles.rowLogo}>
                <StoreLogo name={selectedReceipt?.store_name ?? 'Receipt'} size={40} fallbackToAppIcon />
              </View>
              <View style={sheetStyles.headerText}>
                <Text style={sheetStyles.headerTitle} numberOfLines={1}>
                  {normalizeStoreName(selectedReceipt?.store_name ?? 'Unknown store')}
                </Text>
                <Text style={sheetStyles.headerSubtitle}>
                  {selectedReceipt?.transaction_date
                    ? parseLocalDate(selectedReceipt.transaction_date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })
                    : selectedReceipt
                      ? new Date(selectedReceipt.created_at).toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        })
                      : ''}
                </Text>
              </View>
              {selectedReceipt?.total_amount != null ? (
                <Text style={styles.detailTotal}>${selectedReceipt.total_amount.toFixed(2)}</Text>
              ) : null}
              <Pressable
                hitSlop={12}
                onPress={() => setSelectedReceipt(null)}
                style={sheetStyles.closeBtn}
              >
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>

            {selectedReceipt?.receipt_items && selectedReceipt.receipt_items.length > 0 ? (
              <ScrollView
                style={styles.detailScroll}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {pantryPickMode ? (
                  <Text style={[sheetStyles.sectionLabel, styles.detailSectionLabel]}>
                    Select for pantry
                  </Text>
                ) : (
                  <Text style={[sheetStyles.sectionLabel, styles.detailSectionLabel]}>
                    Line items
                  </Text>
                )}
                <View style={sheetStyles.group}>
                  {selectedReceipt.receipt_items
                    .filter((item) => !pantryPickMode || !item.matched_item_id)
                    .map((item, index, arr) => {
                      const isSelected = selectedPantryIds.has(item.id);
                      const showDivider = index < arr.length - 1;
                      const selectable = pantryPickMode && !item.matched_item_id;
                      return (
                        <View
                          key={item.id}
                          style={[
                            sheetStyles.groupRow,
                            showDivider && sheetStyles.groupRowDivider,
                            isSelected && selectable && sheetStyles.groupRowActive,
                          ]}
                        >
                          <Pressable
                            style={({ pressed }) => [
                              styles.detailRowPress,
                              pressed && selectable && sheetStyles.groupRowPressed,
                            ]}
                            onPress={
                              selectable
                                ? () => {
                                    setSelectedPantryIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(item.id)) next.delete(item.id);
                                      else next.add(item.id);
                                      return next;
                                    });
                                  }
                                : undefined
                            }
                            disabled={!selectable}
                          >
                            {pantryPickMode ? (
                              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                {isSelected ? (
                                  <Ionicons name="checkmark" size={12} color={colors.onPrimary} />
                                ) : null}
                              </View>
                            ) : null}
                            <View style={styles.detailRowBody}>
                              <Text style={sheetStyles.rowTitle} numberOfLines={2}>
                                {item.name}
                              </Text>
                              <View style={styles.modalItemMetaRow}>
                                {item.quantity > 1 ? (
                                  <Text style={styles.modalItemQty}>× {item.quantity}</Text>
                                ) : null}
                                {item.item_category === 'non_grocery' ? (
                                  <View style={styles.nonGroceryPill}>
                                    <Text style={styles.nonGroceryText}>Non-grocery</Text>
                                  </View>
                                ) : null}
                                {item.matched_item_id ? (
                                  <View style={styles.matchedPill}>
                                    <Ionicons name="checkmark-circle" size={11} color={colors.success} />
                                    <Text style={styles.matchedText}>In pantry</Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                            {!pantryPickMode && item.total_price != null ? (
                              <Text style={styles.modalItemPrice}>${item.total_price.toFixed(2)}</Text>
                            ) : null}
                          </Pressable>
                          {!pantryPickMode ? (
                            <Pressable
                              hitSlop={8}
                              style={styles.itemDeleteBtn}
                              onPress={() => {
                                Alert.alert('Remove item', `Remove "${item.name}" from this receipt?`, [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Remove',
                                    style: 'destructive',
                                    onPress: async () => {
                                      await deleteReceiptItem(item.id).catch(() => {});
                                      setSelectedReceipt((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              receipt_items: (prev.receipt_items ?? []).filter(
                                                (i) => i.id !== item.id,
                                              ),
                                            }
                                          : prev,
                                      );
                                    },
                                  },
                                ]);
                              }}
                            >
                              <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.modalEmpty}>
                {selectedReceipt?.status === 'processing' ? (
                  <>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={styles.modalEmptyText}>Processing receipt…</Text>
                  </>
                ) : (
                  <Text style={styles.modalEmptyText}>No line items found.</Text>
                )}
              </View>
            )}

            {pantryPickMode ? (
              <View style={styles.modalActions}>
                <ScalePressable
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setPantryPickMode(false);
                    setSelectedPantryIds(new Set());
                  }}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </ScalePressable>
                <ScalePressable
                  style={[
                    styles.modalConfirmBtn,
                    (selectedPantryIds.size === 0 || addingToPantry) && styles.modalConfirmBtnDisabled,
                  ]}
                  onPress={() => {
                    void handleConfirmAddToPantry();
                  }}
                  disabled={selectedPantryIds.size === 0 || addingToPantry}
                >
                  {addingToPantry ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.modalConfirmBtnText}>
                      Add {selectedPantryIds.size > 0 ? selectedPantryIds.size : ''} to Pantry
                    </Text>
                  )}
                </ScalePressable>
              </View>
            ) : (
              <View style={styles.modalActions}>
                {selectedReceipt?.status === 'done'
                && (selectedReceipt.receipt_items ?? []).some((i) => !i.matched_item_id) ? (
                  <ScalePressable
                    style={styles.modalAddPantryBtn}
                    onPress={() => {
                      const unmatched = (selectedReceipt.receipt_items ?? []).filter(
                        (i) => !i.matched_item_id,
                      );
                      setSelectedPantryIds(new Set(unmatched.map((i) => i.id)));
                      setPantryPickMode(true);
                    }}
                  >
                    <Ionicons name="nutrition-outline" size={16} color={colors.primary} />
                    <Text style={styles.modalAddPantryBtnText}>Add to Pantry</Text>
                  </ScalePressable>
                ) : null}
                <View style={styles.modalFooterRow}>
                  <ScalePressable
                    style={styles.modalDeleteBtn}
                    profile="chip"
                    onPress={() => {
                      if (!selectedReceipt) return;
                      Alert.alert(
                        'Delete receipt',
                        'This will permanently remove this receipt and its data.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: async () => {
                              const id = selectedReceipt.id;
                              setSelectedReceipt(null);
                              await deleteReceipt(id).catch(() => {});
                              setReceipts((prev) => prev.filter((r) => r.id !== id));
                              useDataSignal.getState().bumpReceipts();
                            },
                          },
                        ],
                      );
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    <Text style={styles.modalDeleteBtnText}>Delete</Text>
                  </ScalePressable>
                  <ScalePressable style={styles.modalCloseBtn} onPress={() => setSelectedReceipt(null)}>
                    <Text style={styles.modalCloseBtnText}>Close</Text>
                  </ScalePressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Quick Add Spend Modal */}
      <Modal visible={showQuickAdd} transparent animationType="slide" onRequestClose={() => setShowQuickAdd(false)}>
        <KeyboardAvoidingView style={styles.qaOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.qaSheet}>
            <View style={styles.qaHandle} />
            <View style={styles.qaHeaderRow}>
              <StoreLogo name={quickStore || 'Receipt'} size={44} fallbackToAppIcon />
              <View style={{ flex: 1 }}>
                <Text style={styles.qaTitle}>Add Spend</Text>
                <Text style={styles.qaSub}>No receipt? Log it manually.</Text>
              </View>
            </View>

            <Text style={styles.qaLabel}>Store</Text>
            <View style={styles.qaStoreRow}>
              <Ionicons name="storefront-outline" size={16} color={colors.muted} />
              <TextInput
                style={styles.qaInput}
                placeholder="e.g. Walmart, Giant, Costco"
                placeholderTextColor={colors.placeholder}
                value={quickStore}
                onChangeText={setQuickStore}
                returnKeyType="next"
                autoCapitalize="words"
              />
            </View>

            <Text style={styles.qaLabel}>Amount spent</Text>
            <View style={styles.qaStoreRow}>
              <Text style={styles.qaDollar}>$</Text>
              <TextInput
                style={[styles.qaInput, styles.qaAmountInput]}
                placeholder="0.00"
                placeholderTextColor={colors.placeholder}
                value={quickAmount}
                onChangeText={setQuickAmount}
                keyboardType="decimal-pad"
                returnKeyType="done"
                autoFocus
              />
            </View>

            <Text style={styles.qaLabel}>Date</Text>
            <View style={styles.qaStoreRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.muted} />
              <TextInput
                style={styles.qaInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.placeholder}
                value={quickDate}
                onChangeText={setQuickDate}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>

            <View style={styles.qaActions}>
              <Pressable style={styles.qaCancelBtn} onPress={() => setShowQuickAdd(false)}>
                <Text style={styles.qaCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.qaSaveBtn, (quickSaving || !quickAmount.trim()) && styles.qaSaveBtnDisabled]}
                onPress={() => { void handleSaveQuickAdd(); }}
                disabled={quickSaving || !quickAmount.trim()}
              >
                {quickSaving
                  ? <ActivityIndicator color={colors.onPrimary} size="small" />
                  : <Text style={styles.qaSaveText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function StatusPill({ status, colors, styles }: { status: Receipt['status']; colors: AppColors; styles: ReturnType<typeof makeStyles> }) {
  const color = status === 'done' ? colors.success : status === 'failed' ? colors.danger : colors.warning;
  const label = status === 'done' ? 'Done' : status === 'failed' ? 'Failed' : 'Processing…';
  const icon = status === 'done' ? 'checkmark-circle' : status === 'failed' ? 'alert-circle' : 'time-outline';
  return (
    <View style={[styles.statusPill, { backgroundColor: color + '22' }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.statusText, { color }]}>{label}</Text>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  const sheet = makeSheetStyles(colors);
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    },
    headerLeft: { flex: 1, gap: 2 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    eyebrow: { fontSize: 13, color: colors.primary, fontFamily: fonts.bodySemiBold },
    headerTitle: { fontSize: 26, fontFamily: fonts.displayExtraBoldItalic, color: colors.ink, letterSpacing: 0 },
    resetBtn: {
      borderRadius: 999,
      backgroundColor: colors.faint,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    resetBtnText: { color: colors.muted, fontSize: 14, fontFamily: fonts.bodySemiBold },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, backgroundColor: colors.primary, borderRadius: 999,
      paddingHorizontal: 14, paddingVertical: 10, minWidth: 82,
    },
    addBtnDisabled: { backgroundColor: colors.disabled },
    addBtnText: { color: colors.onPrimary, fontSize: 15, fontFamily: fonts.bodySemiBold },

    uploadBanner: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: radii.lg,
      padding: 14,
      backgroundColor: colors.primarySoft,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    uploadBannerFailed: { backgroundColor: colors.dangerSoft },
    uploadIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    uploadBody: { flex: 1, minWidth: 0 },
    uploadTitle: { fontSize: 14, color: colors.ink, fontFamily: fonts.bodySemiBold },
    uploadSub: { fontSize: 12, color: colors.muted, fontFamily: fonts.body, marginTop: 1 },
    uploadRetryBtn: {
      borderRadius: 999,
      backgroundColor: colors.surface,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    uploadRetryText: { fontSize: 13, color: colors.danger, fontFamily: fonts.bodySemiBold },

    // Budget card
    budgetCard: {
      marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.surface,
      borderRadius: radii.xl, padding: 18,
    },
    budgetCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    budgetIconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    budgetLabel: { fontSize: 13, color: colors.muted, fontFamily: fonts.bodyMedium, marginBottom: 4 },
    budgetAmount: { fontSize: 42, lineHeight: 50, fontFamily: fonts.mono, color: colors.ink },
    budgetSub: { fontSize: 13, color: colors.muted, fontFamily: fonts.body, marginTop: 2 },
    budgetBarTrack: { height: 8, borderRadius: 4, backgroundColor: colors.faint, overflow: 'hidden', marginBottom: 6 },
    budgetBarFill: { height: 8, borderRadius: 4 },
    budgetBarLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold },

    // Store breakdown
    storeCard: {
      marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.surface,
      borderRadius: radii.lg, padding: 16,
    },
    sectionLabel: {
      fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.muted,
      textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12,
    },
    storeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
    storeName: { fontSize: 13, color: colors.ink, fontFamily: fonts.bodyMedium, flex: 1, minWidth: 0 },
    storeBarWrap: { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 8 },
    storeBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.faint, overflow: 'hidden' },
    storeBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
    storeAmount: { fontSize: 13, fontFamily: fonts.mono, color: colors.ink, minWidth: 72, flexShrink: 0, textAlign: 'right' },

    // Receipts list
    receiptsSectionTitle: {
      fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.muted,
      textTransform: 'uppercase', letterSpacing: 0.4,
      paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
    },
    timeSectionHeader: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
    timeSectionTitle: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted },
    list: { paddingBottom: 120 },
    card: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.surface, marginHorizontal: 16,
      borderRadius: radii.lg, padding: 14,
      gap: 12,
    },
    cardIcon: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.primarySoft, flexShrink: 0,
    },
    cardBody: { flex: 1, flexDirection: 'column' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardMeta: { flex: 1, paddingRight: 8 },
    cardStore: { fontSize: 16, fontFamily: fonts.bodyMedium, color: colors.ink },
    cardDate: { fontSize: 13, color: colors.muted, marginTop: 2, fontFamily: fonts.body },
    cardRight: { alignItems: 'flex-end', gap: 5 },
    cardTotal: { fontSize: 17, fontFamily: fonts.mono, color: colors.ink },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
    statusText: { fontSize: 11, fontFamily: fonts.bodySemiBold },
    cardItems: { fontSize: 12, color: colors.muted, marginTop: 6, fontFamily: fonts.body },

    // Receipt detail sheet
    detailSheet: { ...sheet.formSheet, maxHeight: '80%', paddingHorizontal: 0 },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 12,
      gap: 10,
    },
    detailTotal: {
      fontSize: 18,
      fontFamily: fonts.mono,
      color: colors.ink,
      marginRight: 2,
    },
    detailScroll: { maxHeight: 300 },
    detailSectionLabel: { marginTop: 0, marginBottom: 8 },
    detailRowPress: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minWidth: 0,
    },
    detailRowBody: { flex: 1, gap: 4, minWidth: 0 },
    modalItemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    modalItemQty: { fontSize: 12, color: colors.muted, fontFamily: fonts.body },
    modalItemPrice: { fontSize: 15, fontFamily: fonts.mono, color: colors.ink },
    matchedPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    matchedText: { fontSize: 11, color: colors.success, fontFamily: fonts.bodySemiBold },
    nonGroceryPill: {
      backgroundColor: colors.warning + '22', borderRadius: 999,
      paddingHorizontal: 7, paddingVertical: 2,
    },
    nonGroceryText: { fontSize: 10, color: colors.warning, fontFamily: fonts.bodySemiBold },
    itemDeleteBtn: { padding: 4 },
    modalEmpty: { padding: 40, alignItems: 'center', gap: 12 },
    modalEmptyText: { fontSize: 15, color: colors.muted, fontFamily: fonts.body },
    modalActions: { marginHorizontal: 20, marginTop: 12, gap: 8 },
    modalFooterRow: { flexDirection: 'row', gap: 10 },
    modalDeleteBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 15, borderRadius: radii.lg,
      backgroundColor: colors.dangerSoft,
    },
    modalDeleteBtnText: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.danger },
    modalCloseBtn: {
      flex: 2, paddingVertical: 15,
      backgroundColor: colors.faint, borderRadius: radii.lg, alignItems: 'center',
    },
    modalCloseBtnText: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.ink },
    modalAddPantryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, paddingVertical: 14, borderRadius: radii.lg,
      backgroundColor: colors.primarySoft,
    },
    modalAddPantryBtnText: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.primary },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    },
    checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    modalCancelBtn: {
      paddingVertical: 14, borderRadius: radii.lg, alignItems: 'center',
      backgroundColor: colors.faint,
    },
    modalCancelBtnText: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.muted },
    modalConfirmBtn: {
      paddingVertical: 14, borderRadius: radii.lg, alignItems: 'center',
      backgroundColor: colors.primary,
    },
    modalConfirmBtnDisabled: { backgroundColor: colors.disabled },
    modalConfirmBtnText: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },

    // Quick Add Spend modal
    qaOverlay: sheet.formOverlay,
    qaSheet: { ...sheet.formSheet, gap: 10 },
    qaHandle: sheet.handle,
    qaHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
    qaTitle: sheet.headerTitle,
    qaSub: sheet.headerSubtitle,
    qaLabel: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, marginTop: 4 },
    qaStoreRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.faint, borderRadius: radii.md,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    qaInput: { flex: 1, fontSize: 16, fontFamily: fonts.bodyMedium, color: colors.ink },
    qaAmountInput: { fontSize: 22, fontFamily: fonts.bodySemiBold },
    qaDollar: { fontSize: 22, fontFamily: fonts.bodySemiBold, color: colors.primary },
    qaActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    qaCancelBtn: {
      flex: 1, paddingVertical: 15, borderRadius: radii.lg,
      backgroundColor: colors.faint, alignItems: 'center',
    },
    qaCancelText: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.muted },
    qaSaveBtn: {
      flex: 2, paddingVertical: 15, borderRadius: radii.lg,
      backgroundColor: colors.primary, alignItems: 'center',
    },
    qaSaveBtnDisabled: { backgroundColor: colors.disabled },
    qaSaveText: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },
  });
}
