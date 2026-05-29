import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
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

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onAddProduct: (product: BarcodeProduct) => Promise<'added' | 'updated'>;
  onManualAdd: () => void;
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

  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (!visible) return;
    setBusy(false);
    setSaving(false);
    setProduct(null);
    setLastCode('');
    setMessage('');
    setSavedLabel('');
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
        setMessage("Couldn't find this barcode.");
        void hapticWarning();
        return;
      }
      setProduct(found);
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
      const result = await onAddProduct(product);
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
    void hapticSelection();
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
              <Ionicons name="scan-outline" size={15} color="#FFFFFF" />
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
                  <View style={styles.detailPill}>
                    <Ionicons name="time-outline" size={14} color={colors.primary} />
                    <Text style={styles.detailText}>{product.estimatedLifeLabel}</Text>
                  </View>
                </View>
                {savedLabel ? <Text style={styles.savedText}>{savedLabel}</Text> : null}
                {message ? <Text style={styles.errorText}>{message}</Text> : null}
                <View style={styles.actionRow}>
                  <ScalePressable style={styles.secondaryBtn} profile="chip" onPress={scanAgain}>
                    <Text style={styles.secondaryBtnText}>Scan again</Text>
                  </ScalePressable>
                  <ScalePressable style={styles.primaryBtnSmall} onPress={handleAdd} disabled={saving || !!savedLabel}>
                    {saving
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={styles.primaryBtnText}>{savedLabel ? 'Saved' : 'Add'}</Text>}
                  </ScalePressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.productName}>{message}</Text>
                <Text style={styles.productMeta}>{lastCode}</Text>
                <View style={styles.actionRow}>
                  <ScalePressable style={styles.secondaryBtn} profile="chip" onPress={scanAgain}>
                    <Text style={styles.secondaryBtnText}>Scan again</Text>
                  </ScalePressable>
                  <ScalePressable style={styles.primaryBtnSmall} onPress={openManualAdd}>
                    <Text style={styles.primaryBtnText}>Add manually</Text>
                  </ScalePressable>
                </View>
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
            <Ionicons name="close" size={24} color="#FFFFFF" />
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
      backgroundColor: 'rgba(7, 14, 10, 0.72)',
    },
    topBarPressed: { opacity: 0.92 },
    closeBtn: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.22)',
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
      borderWidth: 1,
      borderColor: colors.border,
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
      borderColor: '#FFFFFF',
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
      borderColor: '#FFFFFF',
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
      borderColor: '#FFFFFF',
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
      borderColor: '#FFFFFF',
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
    scanHintText: { color: '#FFFFFF', fontSize: 13, fontFamily: fonts.bodySemiBold },
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
      borderWidth: 1,
      borderColor: colors.border,
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
    actionRow: { flexDirection: 'row', gap: 10 },
    secondaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingVertical: 14,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
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
    primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bodySemiBold },
  });
}
