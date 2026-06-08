import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../theme';
import { useTheme } from '../../hooks/useTheme';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}

/** Standard screen container with safe-area top padding. Reacts to dark mode. */
export function Screen({ children, scroll = true, contentStyle }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const padTop = insets.top + spacing.sm;
  const bg = { backgroundColor: colors.background };

  if (!scroll) {
    return (
      <View style={[styles.root, bg, { paddingTop: padTop }, contentStyle]}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, bg]}
      contentContainerStyle={[
        { paddingTop: padTop, paddingBottom: spacing.huge * 2 },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
});
