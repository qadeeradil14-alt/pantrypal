import { useEffect, useRef, useMemo, useState } from 'react';
import {
  Modal, View, Text, Animated, StyleSheet,
  ScrollView, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';
import { getItemEmoji } from '../constants/itemEmojis';
import StoreLogo from './StoreLogo';
import { hapticSelection, hapticSuccess } from '../lib/haptics';
import type { Item } from '../lib/items';
import type { Store } from '../lib/stores';

interface Props {
  item: Item | null;
  stores: Store[];
  visible: boolean;
  onAssign: (storeId: string | null) => void;
  onClose: () => void;
}

export default function LiftAssignPanel({ item, stores, visible, onAssign, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const slideAnim = useRef(new Animated.Value(-480)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 70,
          friction: 11,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -480,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted && !visible) return null;
  if (!item) return null;

  const emoji = getItemEmoji(item.name, item.category ?? '');
  const currentStoreId = item.preferred_store_id;

  function handleAssign(storeId: string | null) {
    void hapticSuccess();
    onAssign(storeId);
  }

  return (
    <Modal
      transparent
      animationType="none"
      visible={mounted}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop — tap to cancel */}
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel — slides down from top */}
      <Animated.View
        style={[
          styles.panel,
          { paddingTop: insets.top + 16, transform: [{ translateY: slideAnim }] },
        ]}
        pointerEvents="box-none"
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Item context */}
        <View style={styles.itemHeader}>
          <View style={styles.emojiCircle}>
            <Text style={styles.itemEmoji}>{emoji}</Text>
          </View>
          <View style={styles.itemMeta}>
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.itemSub}>
              {currentStoreId ? 'Tap to reassign store' : 'Tap a store to assign'}
            </Text>
          </View>
          <Pressable
            hitSlop={12}
            onPress={() => { void hapticSelection(); onClose(); }}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Store targets */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          style={styles.storeScroll}
          contentContainerStyle={styles.storeList}
        >
          {stores.map((store) => {
            const isActive = store.id === currentStoreId;
            return (
              <Pressable
                key={store.id}
                style={({ pressed }) => [
                  styles.storeRow,
                  isActive && styles.storeRowActive,
                  pressed && styles.storeRowPressed,
                ]}
                onPress={() => handleAssign(store.id)}
              >
                <View style={[styles.logoWrap, isActive && styles.logoWrapActive]}>
                  <StoreLogo
                    name={store.name}
                    size={38}
                    domain={store.brand_domain}
                    logoUrl={store.logo_url}
                  />
                </View>
                <Text
                  style={[styles.storeName, isActive && styles.storeNameActive]}
                  numberOfLines={1}
                >
                  {store.name}
                </Text>
                {isActive ? (
                  <View style={styles.checkWrap}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={colors.placeholder} />
                )}
              </Pressable>
            );
          })}

          {/* Remove assignment */}
          {currentStoreId ? (
            <Pressable
              style={({ pressed }) => [styles.removeRow, pressed && styles.storeRowPressed]}
              onPress={() => handleAssign(null)}
            >
              <View style={styles.removeIconWrap}>
                <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
              </View>
              <Text style={styles.removeText}>Remove store assignment</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {/* Bottom safe area fill */}
        <View style={{ height: 12 }} />
      </Animated.View>
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(23, 26, 24, 0.45)',
    },
    panel: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 14,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 18,
    },
    itemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      gap: 14,
      marginBottom: 16,
    },
    emojiCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.primary + '25',
    },
    itemEmoji: { fontSize: 28 },
    itemMeta: { flex: 1 },
    itemName: {
      fontSize: 18,
      fontFamily: fonts.bodySemiBold,
      color: colors.ink,
      letterSpacing: 0,
    },
    itemSub: {
      fontSize: 13,
      color: colors.muted,
      fontFamily: fonts.body,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.faint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: 20,
      marginBottom: 10,
    },
    storeScroll: { maxHeight: 340 },
    storeList: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      gap: 8,
    },
    storeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    storeRowActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    storeRowPressed: { opacity: 0.72 },
    logoWrap: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    logoWrapActive: {
      borderColor: colors.primary + '50',
      backgroundColor: colors.surface,
    },
    storeName: {
      flex: 1,
      fontSize: 16,
      fontFamily: fonts.bodySemiBold,
      color: colors.ink,
    },
    storeNameActive: { color: colors.primaryDeep },
    checkWrap: {
      width: 28,
      alignItems: 'center',
    },
    removeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.danger + '35',
      backgroundColor: colors.dangerSoft,
    },
    removeIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.danger + '30',
    },
    removeText: {
      flex: 1,
      fontSize: 15,
      fontFamily: fonts.bodySemiBold,
      color: colors.danger,
    },
  });
}
