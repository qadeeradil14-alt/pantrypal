import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getCategoryColors } from '../../theme/categoryPalette';
import {
  lookupCatalogCategory,
  mapItemCategoryToCatalogCategory,
  resolveItemAsset,
} from '../../constants/itemAssetResolver';
import { classifyItem } from '../../core/services/itemClassifier';
import { ItemIcon } from './ItemIcon';

interface ItemAvatarProps {
  name: string;
  size?: number;
  icon?: string;
}

export function ItemAvatar({ name, size = 44, icon }: ItemAvatarProps) {
  const { isDark } = useTheme();

  const catalogCategory = lookupCatalogCategory(name);
  // Catalog miss: fall through to the keyword classifier, but only trust it
  // when it found a confident keyword match (category !== 'other') —
  // otherwise keep the existing Other/🛒 default.
  const rawClassification = catalogCategory === undefined ? classifyItem(name) : undefined;
  const classification = rawClassification?.category === 'other' ? undefined : rawClassification;
  const category = catalogCategory ?? (classification ? mapItemCategoryToCatalogCategory(classification.category) : 'Other');
  const categoryTheme = getCategoryColors(category, isDark);
  const asset = resolveItemAsset(name, icon ?? classification?.emoji);

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
      <ItemIcon asset={asset} size={size} color={categoryTheme.fg} />
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
});
