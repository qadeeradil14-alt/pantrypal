import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { fetchBarcodeProduct, type BarcodeProduct } from '../lib/barcodes';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../lib/haptics';
import { CATEGORY_LABELS } from '../constants/defaultItems';
import { fonts, type AppColors } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import ScalePressable from './ScalePressable';
import { supabase } from '../lib/supabase';
import type { ItemCategory } from '../constants/defaultItems';

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'datamatrix'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onAddProduct: (product: BarcodeProduct, expiresAt: string | null) => Promise<'added' | 'updated'>;
  onManualAdd: () => void;
}

/** Estimate expiry date from the product's storage label. Returns YYYY-MM-DD. */
function defaultExpiryDate(estimatedLifeLabel: string): string {
  const now = new Date();
  let days = 30;
  if (estimatedLifeLabel.includes('7')) days = 7;
  else if (estimatedLifeLabel.includes('3 month')) days = 90;
  now.setDate(now.getDate() + days);
  return now.toISOString().slice(0, 10);
}

/** Parse flexible expiry input to ISO string, or null if empty/invalid.
 * Accepts: YYYY-MM-DD, MM/DD/YYYY, MM-DD-YYYY, or a plain number (days from today). */
function parseExpiry(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;

  // Plain number = days from today (e.g. "30" = 30 days from now)
  if (/^\d{1,3}$/.test(trimmed)) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(trimmed, 10));
    return d.toISOString();
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const mdy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) {
    const d = new Date(`${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}T12:00:00Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + 'T12:00:00Z');
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

/** Format ISO date string to friendly display e.g. "Jun 28, 2026" */
function formatExpiryDisplay(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : ''));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function BarcodeScannerModal({ visible, onClose, onAddProduct, onManualAdd }: Props) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [lastCode, setLastCode] = useState('');
  const [message, setMessage] = useState('');
  const [savedLabel, setSavedLabel] = useState('');
  const [expiryInput, setExpiryInput] = useState('');
  const [identifying, setIdentifying] = useState(false);
  const cameraRef = useRef<InstanceType<typeof CameraView>>(null);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (!visible) return;
    setBusy(false);
    setSaving(false);
    setProduct(null);
    setLastCode('');
    setMessage('');
    setSavedLabel('');
    setExpiryInput('');
    setIdentifying(false);
  }, [visible]);

  const handleBarcodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    const code = result.data.trim();
    if (!code || busy || product) return;

    setBusy(true);
    setMessage('');
    setSavedLabel('');
    setLastCode(code);
    void hapticSelection();

    try {
      const found = await fetchBarcodeProduct(code);
      if (!found) {
        setMessage('Product not in database — add it manually.');
        void hapticWarning();
        return;
      }
      setProduct(found);
      setMessage(''); // clear any stale error from a previous scan
      setExpiryInput(defaultExpiryDate(found.estimatedLifeLabel));
      void hapticSuccess();
    } catch (error: any) {
      setMessage(error?.message ?? 'Barcode lookup failed.');
      void hapticError();
    } finally {
      setBusy(false);
    }
  }, [busy, product]);

  async function handleAdd() {
    if (!product) return;

    setSaving(true);
    setMessage('');

    try {
      const result = await onAddProduct(product, parseExpiry(expiryInput));
      setSavedLabel(result === 'updated' ? 'Updated pantry' : 'Added to pantry');
      void hapticSuccess();
    } catch (error: any) {
      setMessage(error?.message ?? 'Could not save item.');
      void hapticError();
    } finally {
      setSaving(false);
    }
  }

  function scanAgain() {
    setProduct(null);
    setLastCode('');
    setMessage('');
    setSavedLabel('');
    setExpiryInput('');
    void hapticSelection();
  }

  async function handleRetry() {
    if (!lastCode || busy) return;
    setBusy(true);
    setMessage('');
    void hapticSelection();
    try {
      const found = await fetchBarcodeProduct(lastCode);
      if (!found) {
        setMessage('Product not in database — add it manually.');
        void hapticWarning();
        return;
      }
      setProduct(found);
      setMessage('');
      setExpiryInput(defaultExpiryDate(found.estimatedLifeLabel));
      void hapticSuccess();
    } catch (error: any) {
      setMessage(error?.message ?? 'Barcode lookup failed.');
      void hapticError();
    } finally {
      setBusy(false);
    }
  }

  /** Take a photo of what the camera sees and ask GPT-4o to identify the product */
  async function captureAndIdentify() {
    if (!cameraRef.current || identifying) return;
    setIdentifying(true);
    setMessage('');
    void hapticSelection();

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
        skipProcessing: true,
      });

      if (!photo?.base64) {
        setMessage('Could not capture photo. Point at the product label and try again.');
        void hapticWarning();
        return;
      }

      setMessage('Identifying product…');

      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('identify-product', {
        body: { imageBase64: photo.base64, mimeType: 'image/jpeg', barcode: lastCode || undefined },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });

      if (error) throw error;
      if (!data?.name) {
        setMessage('Could not identify this product. Try adding it manually.');
        void hapticWarning();
        return;
      }

      const cat: ItemCategory = (['fridge', 'freezer', 'pantry'] as ItemCategory[]).includes(data.category)
        ? data.category as ItemCategory
        : 'pantry';

      const storageMap: Record<ItemCategory, { storageLabel: string; estimatedLifeLabel: string }> = {
        freezer: { storageLabel: 'Freezer', estimatedLifeLabel: 'about 3 months' },
        fridge:  { storageLabel: 'Fridge',  estimatedLifeLabel: 'about 7 days' },
        pantry:  { storageLabel: 'Pantry',  estimatedLifeLabel: 'about 30 days' },
      };

      const identified: BarcodeProduct = {
        barcode: lastCode || 'photo',
        name: String(data.name).trim(),
        brand: data.brand ? String(data.brand).trim() : null,
        category: cat,
        ...storageMap[cat],
      };

      setProduct(identified);
      setMessage('');
      setExpiryInput(defaultExpiryDate(identified.estimatedLifeLabel));
      void hapticSuccess();
    } catch (err: any) {
      setMessage(err?.message ?? 'Identification failed.');
      void hapticError();
    } finally {
      setIdentifying(false);
    }
  }

  function openManualAdd() {
    void hapticSelection();
    onManualAdd();
  }

  function handleClose() {
    setBusy(false);
    setSaving(false);
    setProduct(null);
    setLastCode('');
    setMessage('');
    setSavedLabel('');
    setExpiryInput('');
    void hapticSelection();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={styles.root}>
        {!permission ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !permission.granted ? (
          <View style={styles.permissionCard}>
            <View style={styles.permissionIcon}>
              <Ionicons name="barcode-outline" size={30} color={colors.primary} />
            </View>
            <Text style={styles.permissionTitle}>Camera access</Text>
            <Text style={styles.permissionText}>Use the camera to scan packaged groceries as you unpack.</Text>
            <ScalePressable style={styles.primaryBtn} onPress={() => { void requestPermission(); }}>
              <Text style={styles.primaryBtnText}>Allow camera</Text>
            </ScalePressable>
          </View>
        ) : (
          <View style={styles.scannerWrap}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="back"
              active={visible && !product && !busy}
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={busy || product ? undefined : handleBarcodeScanned}
            />
            <View style={styles.scanFrame}>
              <View style={styles.cornerTopLeft} />
              <View style={styles.cornerTopRight} />
              <View style={styles.cornerBottomLeft} />
              <View style={styles.cornerBottomRight} />
            </View>
            <View style={styles.scanHint}>
              <Ionicons name="scan-outline" size={15} color={colors.ink} />
              <Text style={styles.scanHintText}>
                {busy ? 'Looking up product' : 'Center the barcode'}
              </Text>
            </View>
          </View>
        )}

        {(product || message || busy || lastCode) && (
          <View style={styles.resultSheet}>
            {busy ? (
              <View style={styles.lookupRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.lookupText}>Checking product database...</Text>
              </View>
            ) : product ? (
              <>
                <View style={styles.productTop}>
                  <View style={styles.productIcon}>
                    <Ionicons name="cube-outline" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.productText}>
                    <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                    <Text style={styles.productMeta} numberOfLines={1}>
                      {[product.brand, CATEGORY_LABELS[product.category]].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <View style={styles.detailPill}>
                    <Ionicons name="file-tray-outline" size={14} color={colors.primary} />
                    <Text style={styles.detailText}>{product.storageLabel}</Text>
                  </View>
                </View>
                <View style={styles.expiryRow}>
                  <Ionicons name="time-outline" size={14} color={colors.muted} />
                  <Text style={styles.expiryLabel}>Expiry</Text>
                  <TextInput
                    style={styles.expiryInput}
                    value={expiryInput}
                    onChangeText={setExpiryInput}
                    placeholder="MM/DD/YYYY or days (e.g. 30)"
                    placeholderTextColor={colors.placeholder}
                    keyboardType="numbers-and-punctuation"
                    maxLength={12}
                  />
                </View>
                {expiryInput.trim() && parseExpiry(expiryInput) ? (
                  <Text style={styles.expiryParsed}>📅 {formatExpiryDisplay(parseExpiry(expiryInput)!)}</Text>
                ) : expiryInput.trim() ? (
                  <Text style={styles.expiryError}>Enter MM/DD/YYYY, YYYY-MM-DD, or number of days</Text>
                ) : null}
                {savedLabel ? <Text style={styles.savedText}>{savedLabel}</Text> : null}
                {message ? <Text style={styles.errorText}>{message}</Text> : null}
                <View style={styles.actionRow}>
                  <ScalePressable style={styles.secondaryBtn} profile="chip" onPress={scanAgain}>
                    <Text style={styles.secondaryBtnText}>Scan again</Text>
                  </ScalePressable>
                  <ScalePressable style={styles.primaryBtnSmall} onPress={handleAdd} disabled={saving || !!savedLabel}>
                    {saving
                      ? <ActivityIndicator color={colors.onPrimary} />
                      : <Text style={styles.primaryBtnText}>{savedLabel ? 'Saved' : 'Add'}</Text>}
                  </ScalePressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.productName}>
                  {identifying ? 'Identifying product…' : message}
                </Text>
                {lastCode ? <Text style={styles.productMeta}>{lastCode}</Text> : null}
                {identifying ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    {/* GPT photo-identify — point camera at label and tap */}
                    <ScalePressable
                      style={[styles.identifyBtn]}
                      onPress={captureAndIdentify}
                      disabled={identifying}
                    >
                      <Ionicons name="camera-outline" size={16} color={colors.onPrimary} />
                      <Text style={styles.primaryBtnText}>Identify by photo</Text>
                    </ScalePressable>
                    <View style={styles.actionRow}>
                      <ScalePressable style={styles.secondaryBtn} profile="chip" onPress={scanAgain}>
                        <Text style={styles.secondaryBtnText}>Scan again</Text>
                      </ScalePressable>
                      {lastCode ? (
                        <ScalePressable style={styles.secondaryBtn} profile="chip" onPress={handleRetry} disabled={busy}>
                          <Text style={styles.secondaryBtnText}>Retry</Text>
                        </ScalePressable>
                      ) : null}
                      <ScalePressable style={styles.primaryBtnSmall} onPress={openManualAdd}>
                        <Text style={styles.primaryBtnText}>Add manually</Text>
                      </ScalePressable>
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        )}
        <Pressable
          testID="barcode-scanner-close"
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
          style={({ pressed }) => [styles.topBar, pressed && styles.topBarPressed]}
          onPress={handleClose}
        >
          <View style={styles.closeBtn} pointerEvents="none">
            <Ionicons name="close" size={24} color={colors.ink} />
          </View>
          <View style={styles.titleWrap} pointerEvents="none">
            <Text style={styles.eyebrow}>Inventory scan</Text>
          </View>
          <View style={styles.closeSpacer} pointerEvents="none" />
        </Pressable>
      </View>
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      elevation: 100,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 54,
      paddingBottom: 10,
      backgroundColor: 'rgba(28, 24, 18, 0.78)',
    },
    topBarPressed: { opacity: 0.92 },
    closeBtn: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.14)',
    },
    closeSpacer: {
      width: 50,
      height: 50,
    },
    titleWrap: { alignItems: 'center', gap: 1 },
    eyebrow: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodySemiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
    title: { fontSize: 24, color: colors.ink, fontFamily: fonts.displayExtraBold, letterSpacing: 0 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    permissionCard: {
      margin: 20,
      padding: 22,
      borderRadius: 22,
      backgroundColor: colors.surface,
      gap: 12,
      alignItems: 'center',
    },
    permissionIcon: {
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    permissionTitle: { fontSize: 22, color: colors.ink, fontFamily: fonts.displayItalic, letterSpacing: 0 },
    permissionText: { fontSize: 15, lineHeight: 22, color: colors.muted, fontFamily: fonts.body, textAlign: 'center' },
    scannerWrap: { flex: 1, backgroundColor: '#000000' },
    camera: { flex: 1 },
    scanFrame: {
      position: 'absolute',
      left: 40,
      right: 40,
      top: '34%',
      height: 180,
    },
    cornerTopLeft: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 42,
      height: 42,
      borderTopWidth: 4,
      borderLeftWidth: 4,
      borderColor: colors.ink,
      borderTopLeftRadius: 18,
    },
    cornerTopRight: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 42,
      height: 42,
      borderTopWidth: 4,
      borderRightWidth: 4,
      borderColor: colors.ink,
      borderTopRightRadius: 18,
    },
    cornerBottomLeft: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      width: 42,
      height: 42,
      borderBottomWidth: 4,
      borderLeftWidth: 4,
      borderColor: colors.ink,
      borderBottomLeftRadius: 18,
    },
    cornerBottomRight: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 42,
      height: 42,
      borderBottomWidth: 4,
      borderRightWidth: 4,
      borderColor: colors.ink,
      borderBottomRightRadius: 18,
    },
    scanHint: {
      position: 'absolute',
      top: '61%',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    scanHintText: { color: colors.ink, fontSize: 13, fontFamily: fonts.bodySemiBold },
    resultSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: 20,
      paddingBottom: 34,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      gap: 14,
    },
    lookupRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    lookupText: { fontSize: 15, color: colors.ink, fontFamily: fonts.bodySemiBold },
    productTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    productIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    productText: { flex: 1, gap: 3 },
    productName: { fontSize: 20, color: colors.ink, fontFamily: fonts.bodySemiBold, letterSpacing: 0 },
    productMeta: { fontSize: 13, color: colors.muted, fontFamily: fonts.bodyMedium },
    detailRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    expiryRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.faint, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    expiryLabel: { fontSize: 13, color: colors.muted, fontFamily: fonts.bodyMedium },
    expiryInput: {
      flex: 1, fontSize: 13, color: colors.ink, fontFamily: fonts.bodySemiBold,
      textAlign: 'right',
    },
    expiryParsed: { fontSize: 12, color: colors.success, fontFamily: fonts.bodyMedium, textAlign: 'right' },
    expiryError: { fontSize: 11, color: colors.danger, fontFamily: fonts.body },
    detailPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    detailText: { fontSize: 13, color: colors.primary, fontFamily: fonts.bodySemiBold },
    savedText: { fontSize: 14, color: colors.success, fontFamily: fonts.bodySemiBold },
    errorText: { fontSize: 14, color: colors.danger, fontFamily: fonts.bodySemiBold },
    identifyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 14,
      paddingVertical: 14,
      backgroundColor: colors.primary,
    },
    actionRow: { flexDirection: 'row', gap: 10 },
    secondaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingVertical: 14,
      backgroundColor: colors.faint,
    },
    secondaryBtnText: { color: colors.ink, fontSize: 15, fontFamily: fonts.bodySemiBold },
    primaryBtn: {
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingVertical: 15,
      backgroundColor: colors.primary,
      marginTop: 6,
    },
    primaryBtnSmall: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingVertical: 14,
      backgroundColor: colors.primary,
    },
    primaryBtnText: { color: colors.onPrimary, fontSize: 15, fontFamily: fonts.bodySemiBold },
  });
}
