import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fonts, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { PageTitle } from './ui';

/** Back button + title for stack screens pushed over the tabs (root stack has no native header). */
export function SubScreenHeader({ title, eyebrow }: { title: string; eyebrow?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
        style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={20} color={colors.primary} />
        <Text style={styles.backLabel}>Back</Text>
      </Pressable>
      <PageTitle eyebrow={eyebrow} title={title} />
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
      paddingVertical: spacing.sm,
      marginBottom: spacing.sm,
    },
    backLabel: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.primary },
  });
}
