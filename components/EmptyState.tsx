import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';
import ScalePressable from './ScalePressable';

interface Props {
  emoji: string;
  title: string;
  subtitle: string;
  action?: { label: string; onPress: () => void };
}

export default function EmptyState({ emoji, title, subtitle, action }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <View style={styles.emojiWrap}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {action && (
        <ScalePressable style={styles.btn} onPress={action.onPress}>
          <Text style={styles.btnText}>{action.label}</Text>
        </ScalePressable>
      )}
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 44,
      paddingVertical: 60,
      gap: 12,
    },
    emojiWrap: {
      width: 88,
      height: 88,
      borderRadius: 28,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    emoji: { fontSize: 42 },
    title: {
      fontSize: 20,
      fontFamily: fonts.display,
      color: colors.ink,
      textAlign: 'center',
      letterSpacing: 0,
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 21,
      fontFamily: fonts.bodyMedium,
    },
    btn: {
      marginTop: 8,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingHorizontal: 24,
      paddingVertical: 13,
    },
    btnText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bodySemiBold },
  });
}
