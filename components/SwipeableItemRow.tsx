import { useRef, useMemo } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useItemsStore } from '../store/items';
import { deleteItemWithQueue, markItemOkWithQueue } from '../lib/items';
import { hapticError, hapticSuccess, hapticWarning } from '../lib/haptics';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';
import ItemRow from './ItemRow';
import type { Item } from '../lib/items';

interface Props {
  item: Item;
  userId: string;
  onEditPress?: (item: Item) => void;
  onLiftPress?: (item: Item) => void;
}

export default function SwipeableItemRow({ item, userId, onEditPress, onLiftPress }: Props) {
  const { colors } = useTheme();
  const { removeItem, restoreItem, updateItem } = useItemsStore();
  const swipeRef = useRef<Swipeable>(null);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  async function handleSwipeDelete() {
    void hapticWarning();
    swipeRef.current?.close();
    removeItem(item.id);
    try {
      const result = await deleteItemWithQueue(item.id);
      if (!result.queued) void hapticSuccess();
    } catch {
      void hapticError();
      restoreItem(item);
    }
  }

  async function handleSwipeGotIt() {
    void hapticSuccess();
    swipeRef.current?.close();
    const prev = { is_low: item.is_low, marked_low_by: item.marked_low_by, got_it_by: item.got_it_by };
    updateItem(item.id, { is_low: false, marked_low_by: null, got_it_by: userId });
    try {
      await markItemOkWithQueue(item.id);
    } catch {
      void hapticError();
      updateItem(item.id, prev);
    }
  }

  function renderLeftActions(
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) {
    if (!item.is_low) return null;
    const scale = dragX.interpolate({ inputRange: [0, 72], outputRange: [0.85, 1], extrapolate: 'clamp' });
    return (
      <TouchableOpacity style={styles.gotItAction} onPress={handleSwipeGotIt} activeOpacity={0.85}>
        <Animated.View style={[styles.actionInner, { transform: [{ scale }] }]}>
          <Ionicons name="checkmark-circle-outline" size={22} color={colors.onPrimary} />
          <Text style={styles.gotItLabel}>Got it</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  function renderRightActions(
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) {
    const scale = dragX.interpolate({ inputRange: [-72, 0], outputRange: [1, 0.85], extrapolate: 'clamp' });
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={handleSwipeDelete} activeOpacity={0.85}>
        <Animated.View style={[styles.actionInner, { transform: [{ scale }] }]}>
          <Ionicons name="trash-outline" size={22} color={colors.onPrimary} />
          <Text style={styles.deleteLabel}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      leftThreshold={60}
      rightThreshold={60}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      enableTrackpadTwoFingerGesture
    >
      <ItemRow item={item} userId={userId} onEditPress={onEditPress} onLiftPress={onLiftPress} />
    </Swipeable>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    gotItAction: {
      backgroundColor: colors.success,
      justifyContent: 'center',
      alignItems: 'center',
      width: 80,
      borderRadius: 16,
      marginRight: 8,
    },
    deleteAction: {
      backgroundColor: colors.danger,
      justifyContent: 'center',
      alignItems: 'center',
      width: 80,
      borderRadius: 16,
      marginLeft: 8,
    },
    actionInner: {
      alignItems: 'center',
      gap: 4,
    },
    gotItLabel: {
      color: colors.onPrimary,
      fontSize: 11,
      fontFamily: fonts.bodySemiBold,
    },
    deleteLabel: {
      color: colors.onPrimary,
      fontSize: 11,
      fontFamily: fonts.bodySemiBold,
    },
  });
}
