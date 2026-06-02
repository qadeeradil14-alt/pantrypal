import { useMemo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';
import ScalePressable from './ScalePressable';

interface Props {
  visible: boolean;
  emoji?: string;
  title: string;
  message: string;
  primaryLabel?: string;
  onPrimary: () => void;
}

export default function ThemedPopup({
  visible,
  emoji,
  title,
  message,
  primaryLabel = 'OK',
  onPrimary,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onPrimary}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>{emoji ?? '✨'}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <ScalePressable style={styles.primary} onPress={onPrimary}>
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          </ScalePressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 34,
      backgroundColor: 'rgba(34,26,18,0.34)',
    },
    card: {
      borderRadius: 28,
      backgroundColor: colors.surface,
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 18,
      alignItems: 'center',
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    iconWrap: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
      marginBottom: 2,
    },
    icon: { fontSize: 26 },
    title: {
      fontSize: 22,
      lineHeight: 27,
      fontFamily: fonts.displayExtraBoldItalic,
      color: colors.ink,
      textAlign: 'center',
      letterSpacing: 0,
    },
    message: {
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fonts.bodyMedium,
      color: colors.muted,
      textAlign: 'center',
      paddingHorizontal: 4,
    },
    primary: {
      marginTop: 8,
      alignSelf: 'stretch',
      borderRadius: 999,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: {
      fontSize: 16,
      fontFamily: fonts.bodySemiBold,
      color: colors.onPrimary,
    },
  });
}
