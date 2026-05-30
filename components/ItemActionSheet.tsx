import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';
import StoreLogo from './StoreLogo';
import { getItemEmoji } from '../constants/itemEmojis';
import type { Item } from '../lib/items';
import type { Store } from '../lib/stores';

interface Props {
  item: Item;
  stores: Store[];
  visible: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onAssignStore: (storeId: string | null) => void;
  onDelete: () => void;
}

export default function ItemActionSheet({
  item,
  stores,
  visible,
  onClose,
  onEdit,
  onAssignStore,
  onDelete,
}: Props) {
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(500)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          mass: 0.85,
          stiffness: 220,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 500,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible, slideAnim, fadeAnim]);

  const closeWithAnimation = useCallback((afterClose?: () => void) => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 500,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
      afterClose?.();
    });
  }, [fadeAnim, onClose, slideAnim]);

  const handleClose = useCallback(() => {
    closeWithAnimation();
  }, [closeWithAnimation]);

  const handleDelete = () => {
    closeWithAnimation(onDelete);
  };

  const handleAssign = (storeId: string | null) => {
    closeWithAnimation(() => onAssignStore(storeId));
  };

  const handleEdit = () => {
    closeWithAnimation(() => onEdit?.());
  };

  const assignedStore = stores.find((s) => s.id === item.preferred_store_id);
  const emoji = getItemEmoji(item.name, item.category ?? '');
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!mounted) return null;

  return (
    <Modal transparent animationType="none" visible={mounted} onRequestClose={handleClose}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        pointerEvents="box-none"
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Item header */}
        <View style={styles.itemHeader}>
          <View style={styles.itemEmojiWrap}>
            <Text style={styles.itemEmoji}>{emoji}</Text>
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.itemSub} numberOfLines={1}>
              {assignedStore ? `Assigned to ${assignedStore.name}` : 'No store assigned'}
            </Text>
          </View>
          <Pressable onPress={handleClose} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>

        {/* Store row */}
        {stores.length > 0 && (
          <View style={styles.storeSection}>
            <Text style={styles.storeSectionLabel}>Assign store</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storeRow}
            >
              {stores.map((store) => {
                const active = store.id === item.preferred_store_id;
                return (
                  <Pressable
                    key={store.id}
                    style={[styles.storeCard, active && styles.storeCardActive]}
                    onPress={() => handleAssign(active ? null : store.id)}
                  >
                    <StoreLogo
                      name={store.name}
                      size={38}
                      domain={store.brand_domain}
                      logoUrl={store.logo_url}
                    />
                    <Text
                      style={[styles.storeCardName, active && styles.storeCardNameActive]}
                      numberOfLines={1}
                    >
                      {store.name}
                    </Text>
                    {active && (
                      <View style={styles.storeCheck}>
                        <Ionicons name="checkmark" size={10} color={colors.primary} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Actions */}
        <View style={styles.actions}>
          {onEdit && (
            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
              onPress={handleEdit}
            >
              <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="pencil-outline" size={17} color={colors.primary} />
              </View>
              <Text style={styles.actionLabel}>Edit grocery</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          )}

          {item.preferred_store_id && (
            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
              onPress={() => handleAssign(null)}
            >
              <View style={[styles.actionIcon, { backgroundColor: colors.faint }]}>
                <Ionicons name="storefront-outline" size={17} color={colors.muted} />
              </View>
              <Text style={styles.actionLabel}>Clear store assignment</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
            onPress={handleDelete}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="trash-outline" size={17} color={colors.danger} />
            </View>
            <Text style={[styles.actionLabel, styles.actionLabelDanger]}>Delete item</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.danger + '88'} />
          </Pressable>
        </View>

        {/* Safe-area spacer */}
        <View style={styles.safeBottom} />
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
      backgroundColor: 'rgba(0,0,0,0.42)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 10,
      // Subtle shadow
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 20,
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
      marginBottom: 20,
      gap: 12,
    },
    itemEmojiWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemEmoji: { fontSize: 26 },
    itemInfo: { flex: 1 },
    itemName: {
      fontSize: 18,
      fontFamily: fonts.displayExtraBoldItalic,
      color: colors.ink,
      letterSpacing: 0,
    },
    itemSub: {
      fontSize: 13,
      fontFamily: fonts.bodyMedium,
      color: colors.muted,
      marginTop: 2,
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.faint,
      alignItems: 'center',
      justifyContent: 'center',
    },

    storeSection: {
      marginBottom: 16,
    },
    storeSectionLabel: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      color: colors.muted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    storeRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      paddingRight: 20,
    },
    storeCard: {
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 76,
      position: 'relative',
    },
    storeCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    storeCardName: {
      fontSize: 10,
      fontFamily: fonts.body,
      color: colors.muted,
      textAlign: 'center',
      maxWidth: 72,
    },
    storeCardNameActive: { color: colors.primary },
    storeCheck: {
      position: 'absolute',
      top: 5,
      right: 5,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },

    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: 20,
      marginBottom: 8,
    },

    actions: {
      paddingHorizontal: 12,
      gap: 2,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 8,
      paddingVertical: 12,
      borderRadius: 14,
    },
    actionRowPressed: {
      backgroundColor: colors.faint,
    },
    actionIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: fonts.bodyMedium,
      color: colors.ink,
    },
    actionLabelDanger: { color: colors.danger },

    safeBottom: { height: 28 },
  });
}
