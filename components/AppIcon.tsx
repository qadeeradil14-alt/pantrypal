import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { APP_ICON } from '../constants/branding';
import { useTheme } from '../hooks/useTheme';
import type { AppColors } from '../constants/theme';

interface Props {
  size?: number;
}

export default function AppIcon({ size = 32 }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors, size), [colors, size]);

  return (
    <View style={styles.wrap}>
      <Image source={APP_ICON} resizeMode="contain" style={styles.image} />
    </View>
  );
}

function makeStyles(colors: AppColors, size: number) {
  const radius = Math.round(size / 2);
  return StyleSheet.create({
    wrap: {
      width: size,
      height: size,
      borderRadius: radius,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    image: {
      width: Math.round(size * 0.88),
      height: Math.round(size * 0.88),
      borderRadius: Math.round(size * 0.44),
    },
  });
}
