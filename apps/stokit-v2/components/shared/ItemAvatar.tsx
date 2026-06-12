import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { PANTRY_CATALOG } from '../../constants/pantryCatalog';
import { classifyItem } from '../../core/services/itemClassifier';
import { getCategoryColors } from '../../theme/categoryPalette';

const CUSTOM_EMOJIS: Record<string, any> = {
  'custom:toothpaste': require('../../assets/custom-emojis/toothpaste.png'),
  'custom:shampoo': require('../../assets/custom-emojis/shampoo.png'),
  'custom:conditioner': require('../../assets/custom-emojis/conditioner.png'),
  'custom:bodywash': require('../../assets/custom-emojis/bodywash.png'),
  'custom:deodorant': require('../../assets/custom-emojis/deodorant.png'),
  'custom:lotion': require('../../assets/custom-emojis/lotion.png'),
  'custom:dishsoap': require('../../assets/custom-emojis/dishsoap.png'),
  'custom:handsoap': require('../../assets/custom-emojis/handsoap.png'),
  'custom:laundry_detergent': require('../../assets/custom-emojis/laundry_detergent.png'),
  'custom:fabric_softener': require('../../assets/custom-emojis/fabric_softener.png'),
  'custom:bleach': require('../../assets/custom-emojis/bleach.png'),
  'custom:all_purpose_cleaner': require('../../assets/custom-emojis/all_purpose_cleaner.png'),
  'custom:glass_cleaner': require('../../assets/custom-emojis/glass_cleaner.png'),
  'custom:wipes': require('../../assets/custom-emojis/wipes.png'),
  'custom:trash_bags': require('../../assets/custom-emojis/trash_bags.png'),
  'custom:ketchup': require('../../assets/custom-emojis/ketchup.png'),
  'custom:mustard': require('../../assets/custom-emojis/mustard.png'),
};

interface ItemAvatarProps {
  name: string;
  size?: number;
}

export function ItemAvatar({ name, size = 44 }: ItemAvatarProps) {
  const { isDark } = useTheme();

  // Exact catalog match keeps curated icons (incl. custom PNGs); everything
  // else falls back to the keyword classifier so icons match the rest of the
  // app instead of showing the generic 📦.
  const catalogItem = PANTRY_CATALOG.find((i) => i.name.toLowerCase() === name.toLowerCase());
  const classified = catalogItem ? null : classifyItem(name);
  const iconStr = catalogItem?.icon || classified?.emoji || '📦';
  const isCustom = iconStr.startsWith('custom:');
  const category = catalogItem?.category ?? classified?.category ?? 'other';
  const categoryTheme = getCategoryColors(category, isDark);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: categoryTheme.bg,
          borderColor: categoryTheme.bg,
        },
      ]}
    >
      {isCustom ? (
        <Image 
          source={CUSTOM_EMOJIS[iconStr]} 
          style={{ width: size * 0.7, height: size * 0.7 }} 
          resizeMode="contain" 
        />
      ) : (
        <Text style={[styles.emoji, { fontSize: size * 0.55 }]}>
          {iconStr}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emoji: {
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});
