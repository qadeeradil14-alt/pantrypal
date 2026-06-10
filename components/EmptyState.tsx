import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';
import ScalePressable from './ScalePressable';

interface Props {
  emoji?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  action?: { label: string; onPress: () => void };
}

export default function EmptyState({ emoji, icon, title, subtitle, action }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={32} color={colors.primaryDeep} />
        </View>
      ) : (
        <View style={styles.emojiWrap}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
      )}
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
      paddingVertical: 24,
      gap: 10,
    },
    emojiWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    emoji: { fontSize: 56 },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
      backgroundColor: colors.primarySoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
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
    btnText: { color: colors.onPrimary, fontSize: 15, fontFamily: fonts.bodySemiBold },
  });
}
