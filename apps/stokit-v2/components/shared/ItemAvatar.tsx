import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getCategoryColors } from '../../theme/categoryPalette';
import {
  lookupCatalogCategory,
  resolveIconString,
  resolveItemAsset,
} from '../../constants/itemAssetResolver';
import { ItemIcon } from './ItemIcon';

interface ItemAvatarProps {
  name: string;
  size?: number;
  icon?: string;
}

export function ItemAvatar({ name, size = 44, icon }: ItemAvatarProps) {
  const { isDark } = useTheme();

  const category = lookupCatalogCategory(name) ?? 'Other';
  const categoryTheme = getCategoryColors(category, isDark);
  const asset = icon ? resolveIconString(icon) : resolveItemAsset(name);

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
