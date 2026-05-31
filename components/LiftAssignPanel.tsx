import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  Modal, View, Text, Animated, StyleSheet,
  ScrollView, Pressable, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { makeSheetStyles } from '../constants/sheetStyles';
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
  const sheetStyles = useMemo(() => makeSheetStyles(colors), [colors]);

  const slideAnim = useRef(new Animated.Value(420)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 24,
          mass: 0.9,
          stiffness: 280,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 420,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible, slideAnim, backdropAnim]);

  const handleClose = useCallback(() => {
    void hapticSelection();
    onClose();
  }, [onClose]);

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
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Animated.View style={[sheetStyles.backdrop, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      <Animated.View
        style={[
          sheetStyles.sheet,
          {
            paddingBottom: insets.bottom + 8,
            maxHeight: Dimensions.get('window').height - insets.top - 48,
            transform: [{ translateY: slideAnim }],
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={sheetStyles.handle} />

        <View style={sheetStyles.header}>
          <View style={sheetStyles.headerEmoji}>
            <Text style={sheetStyles.headerEmojiText}>{emoji}</Text>
          </View>
          <View style={sheetStyles.headerText}>
            <Text style={sheetStyles.headerTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={sheetStyles.headerSubtitle}>
              {currentStoreId ? 'Choose a store' : 'Assign a store'}
            </Text>
          </View>
          <Pressable hitSlop={12} onPress={handleClose} style={sheetStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>

        <Text style={sheetStyles.sectionLabel}>Your stores</Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={sheetStyles.group}>
            {stores.map((store, index) => {
              const isActive = store.id === currentStoreId;
              const showDivider = index < stores.length - 1 || !!currentStoreId;
              return (
                <Pressable
                  key={store.id}
                  style={({ pressed }) => [
                    sheetStyles.groupRow,
                    showDivider && sheetStyles.groupRowDivider,
                    isActive && sheetStyles.groupRowActive,
                    pressed && sheetStyles.groupRowPressed,
                  ]}
                  onPress={() => handleAssign(store.id)}
                >
                  <View style={sheetStyles.rowLogo}>
                    <StoreLogo
                      name={store.name}
                      size={36}
                      domain={store.brand_domain}
                      logoUrl={store.logo_url}
                    />
                  </View>
                  <View style={styles.rowTextCol}>
                    <Text
                      style={[sheetStyles.rowTitle, isActive && sheetStyles.rowTitleActive]}
                      numberOfLines={1}
                    >
                      {store.name}
                    </Text>
                    {isActive ? (
                      <Text style={sheetStyles.rowMeta}>Current</Text>
                    ) : null}
                  </View>
                  {isActive ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}

            {currentStoreId ? (
              <Pressable
                style={({ pressed }) => [
                  sheetStyles.groupRow,
                  styles.removeRow,
                  { borderTopColor: colors.border },
                  pressed && sheetStyles.groupRowPressed,
                ]}
                onPress={() => handleAssign(null)}
              >
                <View style={[sheetStyles.actionIcon, { backgroundColor: colors.dangerSoft }]}>
                  <Ionicons name="unlink-outline" size={16} color={colors.danger} />
                </View>
                <Text style={[sheetStyles.actionLabel, sheetStyles.actionLabelDanger]}>
                  Clear assignment
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },
  rowTextCol: { flex: 1, minWidth: 0 },
  removeRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
