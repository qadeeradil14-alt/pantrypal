import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  Modal, View, Text, Animated, StyleSheet,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { makeSheetStyles } from '../constants/sheetStyles';
import ItemThumbnail from './ItemThumbnail';
import { hapticSelection } from '../lib/haptics';
import type { Item } from '../lib/items';

interface Props {
  item: Item | null;
  visible: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAssignStores: () => void;
  onClose: () => void;
}

export default function ItemActionSheet({
  item, visible, onEdit, onDelete, onAssignStores, onClose,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetStyles = useMemo(() => makeSheetStyles(colors), [colors]);

  const slideAnim = useRef(new Animated.Value(300)).current;
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
          toValue: 300,
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
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={sheetStyles.handle} />

        <View style={sheetStyles.header}>
          <View style={sheetStyles.headerEmoji}>
            <ItemThumbnail name={item.name} category={item.category} size={40} />
          </View>
          <View style={sheetStyles.headerText}>
            <Text style={sheetStyles.headerTitle} numberOfLines={1}>
              {item.name}
            </Text>
            {item.category ? (
              <Text style={sheetStyles.headerSubtitle}>{item.category}</Text>
            ) : null}
          </View>
          <Pressable hitSlop={12} onPress={handleClose} style={sheetStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>

        <View style={sheetStyles.group}>
          <Pressable
            style={({ pressed }) => [
              sheetStyles.actionRow,
              sheetStyles.groupRowDivider,
              pressed && sheetStyles.groupRowPressed,
            ]}
            onPress={() => { void hapticSelection(); onAssignStores(); }}
          >
            <View style={[sheetStyles.actionIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="storefront-outline" size={16} color={colors.primary} />
            </View>
            <Text style={sheetStyles.actionLabel}>Assign stores</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.faint} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              sheetStyles.actionRow,
              sheetStyles.groupRowDivider,
              pressed && sheetStyles.groupRowPressed,
            ]}
            onPress={() => { void hapticSelection(); onEdit(); }}
          >
            <View style={[sheetStyles.actionIcon, { backgroundColor: colors.faint }]}>
              <Ionicons name="pencil-outline" size={16} color={colors.ink} />
            </View>
            <Text style={sheetStyles.actionLabel}>Edit item</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              sheetStyles.actionRow,
              pressed && sheetStyles.groupRowPressed,
            ]}
            onPress={() => { void hapticSelection(); onDelete(); }}
          >
            <View style={[sheetStyles.actionIcon, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
            </View>
            <Text style={[sheetStyles.actionLabel, sheetStyles.actionLabelDanger]}>
              Delete item
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}
