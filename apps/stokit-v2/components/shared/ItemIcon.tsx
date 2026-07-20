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
  // Same 0.6 scale factor across every kind so a custom PNG, an MDI glyph, and an
  // emoji all carry the same visual weight at a given avatar size.
  const scale = size * 0.6;

  if (asset.kind === 'image') {
    return (
      <Image
        source={asset.source}
        style={{ width: scale, height: scale }}
        resizeMode="contain"
      />
    );
  }

  if (asset.kind === 'mdi') {
    return (
      <MaterialCommunityIcons
        name={asset.name as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
        size={scale}
        color={color}
      />
    );
  }

  if (asset.kind === 'emoji') {
    return (
      <Text style={{ fontSize: scale, includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center' }}>
        {asset.value}
      </Text>
    );
  }

  return (
    <MaterialCommunityIcons
      name={asset.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
      size={scale}
      color={color}
    />
  );
}
