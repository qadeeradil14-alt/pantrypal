import React from 'react';
import { Image, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ResolvedItemAsset } from '../../constants/itemAssetResolver';

interface ItemIconProps {
  asset: ResolvedItemAsset;
  size: number;
  color: string;
}

/** Renders a resolved item asset — image, MDI glyph, emoji, or a neutral placeholder. */
export function ItemIcon({ asset, size, color }: ItemIconProps) {
  if (asset.kind === 'image') {
    return (
      <Image
        source={asset.source}
        style={{ width: size * 0.7, height: size * 0.7 }}
        resizeMode="contain"
      />
    );
  }

  if (asset.kind === 'mdi') {
    return (
      <MaterialCommunityIcons
        name={asset.name as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
        size={size * 0.55}
        color={color}
      />
    );
  }

  if (asset.kind === 'emoji') {
    return (
      <Text style={{ fontSize: size * 0.55, includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center' }}>
        {asset.value}
      </Text>
    );
  }

  return (
    <MaterialCommunityIcons
      name="image-off-outline"
      size={size * 0.5}
      color={color}
    />
  );
}
