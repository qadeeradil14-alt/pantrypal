import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { PANTRY_CATALOG } from '../../constants/pantryCatalog';

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

const CATEGORY_COLORS: Record<string, { bg: string; fg: string }> = {
  Produce: { bg: '#DCFCE7', fg: '#16A34A' },
  Dairy: { bg: '#FEF3C7', fg: '#D97706' },
  Meat: { bg: '#FEE2E2', fg: '#DC2626' },
  Seafood: { bg: '#DBEAFE', fg: '#2563EB' },
  Bakery: { bg: '#FFEDD5', fg: '#EA580C' },
  Frozen: { bg: '#E0F2FE', fg: '#0284C7' },
  'Dry Goods': { bg: '#F5F5F4', fg: '#57534E' },
  Canned: { bg: '#F1F5F9', fg: '#475569' },
  Spices: { bg: '#FFEDD5', fg: '#C2410C' },
  Drinks: { bg: '#CFFAFE', fg: '#0891B2' },
  Snacks: { bg: '#FEF9C3', fg: '#CA8A04' },
  Kitchen: { bg: '#F3F4F6', fg: '#4B5563' },
  Cleaning: { bg: '#E0F2FE', fg: '#0369A1' },
  'Paper Goods': { bg: '#F1F5F9', fg: '#64748B' },
  'Personal Care': { bg: '#FCE7F3', fg: '#DB2777' },
  Baby: { bg: '#FDF2F8', fg: '#BE185D' },
  Pet: { bg: '#EDE9FE', fg: '#7C3AED' },
  Other: { bg: '#F1F5F9', fg: '#475569' },
};

interface ItemAvatarProps {
  name: string;
  size?: number;
}

export function ItemAvatar({ name, size = 44 }: ItemAvatarProps) {
  const { colors } = useTheme();

  const catalogItem = PANTRY_CATALOG.find((i) => i.name.toLowerCase() === name.toLowerCase());
  const fallbackInitial = name.trim().charAt(0).toUpperCase() || '?';
  const iconStr = catalogItem?.icon || '📦';
  const isCustom = iconStr.startsWith('custom:');
  const categoryTheme = catalogItem ? CATEGORY_COLORS[catalogItem.category] || CATEGORY_COLORS.Other : CATEGORY_COLORS.Other;

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
