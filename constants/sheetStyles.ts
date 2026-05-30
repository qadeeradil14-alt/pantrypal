import { StyleSheet } from 'react-native';
import { fonts, radii, type AppColors } from './theme';

const backdropColor = 'rgba(12, 8, 6, 0.52)';

const sheetSurfaceBase = (colors: AppColors) => ({
  backgroundColor: colors.surface,
  borderTopLeftRadius: radii.xl,
  borderTopRightRadius: radii.xl,
  paddingTop: 8,
  shadowColor: '#000' as const,
  shadowOffset: { width: 0, height: -6 },
  shadowOpacity: 0.14,
  shadowRadius: 20,
  elevation: 18,
});

/** Shared bottom-sheet chrome — Slow Kitchen, minimal chrome */
export function makeSheetStyles(colors: AppColors) {
  return StyleSheet.create({
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: backdropColor,
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      ...sheetSurfaceBase(colors),
    },
    /** For KeyboardAvoidingView form sheets (add/edit store, etc.) */
    formOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: backdropColor,
    },
    formSheet: {
      ...sheetSurfaceBase(colors),
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    handle: {
      width: 32,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 14,
      opacity: 0.85,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
      gap: 12,
    },
    headerEmoji: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.faint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerEmojiText: { fontSize: 22 },
    headerText: { flex: 1, minWidth: 0 },
    headerTitle: {
      fontSize: 20,
      fontFamily: fonts.displayItalic,
      color: colors.ink,
      letterSpacing: 0,
    },
    headerSubtitle: {
      fontSize: 12,
      fontFamily: fonts.body,
      color: colors.muted,
      marginTop: 2,
    },
    closeBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: fonts.monoMedium,
      color: colors.muted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    group: {
      marginHorizontal: 16,
      borderRadius: radii.md,
      backgroundColor: colors.background,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    groupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: 14,
      gap: 12,
      minHeight: 50,
    },
    groupRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    groupRowActive: {
      backgroundColor: colors.primarySoft,
    },
    groupRowPressed: { opacity: 0.65 },
    rowLogo: {
      width: 36,
      height: 36,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    rowTitle: {
      flex: 1,
      fontSize: 15,
      fontFamily: fonts.bodyMedium,
      color: colors.ink,
    },
    rowTitleActive: {
      fontFamily: fonts.bodySemiBold,
      color: colors.primaryDeep,
    },
    rowMeta: {
      fontSize: 11,
      fontFamily: fonts.mono,
      color: colors.muted,
      marginTop: 1,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 12,
      minHeight: 48,
    },
    actionIcon: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: fonts.bodyMedium,
      color: colors.ink,
    },
    actionLabelDanger: { color: colors.danger },
    safeBottom: { height: 24 },
  });
}
