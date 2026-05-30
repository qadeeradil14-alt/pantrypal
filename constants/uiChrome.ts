import { StyleSheet } from 'react-native';
import { fonts, radii, type AppColors } from './theme';

/**
 * Shared in-screen surfaces — matches sheetStyles grouped lists.
 * Prefer faint fills + hairline dividers over boxed borders (Slow Kitchen).
 */
export function makeUiChrome(colors: AppColors) {
  return StyleSheet.create({
    sectionLabel: {
      fontSize: 11,
      fontFamily: fonts.monoMedium,
      color: colors.muted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    sectionLabelInset: {
      paddingHorizontal: 20,
    },

    /** Standalone card on background — no heavy border */
    surfaceCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      overflow: 'hidden',
    },
    surfaceCardPadded: {
      padding: 16,
    },

    /** Settings / grouped settings rows */
    groupedBlock: {
      marginHorizontal: 16,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    groupedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    groupedRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },

    /** List row — gap-separated tiles (shopping, stores, receipts) */
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
    },
    listRowCompact: {
      paddingVertical: 11,
    },

    /** Pantry item row */
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },

    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.faint,
      borderRadius: radii.md,
      paddingHorizontal: 14,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.ink,
      fontFamily: fonts.body,
    },

    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: colors.faint,
    },
    chipActive: {
      backgroundColor: colors.primarySoft,
    },
    chipText: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      color: colors.muted,
    },
    chipTextActive: {
      color: colors.primary,
    },

    input: {
      borderRadius: radii.md,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.ink,
      backgroundColor: colors.faint,
      fontFamily: fonts.body,
    },
    inputMultiline: {
      minHeight: 88,
      textAlignVertical: 'top',
      paddingTop: 14,
    },

    softBanner: {
      borderRadius: radii.lg,
      backgroundColor: colors.primarySoft,
      padding: 14,
      gap: 10,
    },

    softPrimaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: radii.md,
      paddingVertical: 14,
      backgroundColor: colors.primarySoft,
    },
    softPrimaryBtnText: {
      fontSize: 15,
      fontFamily: fonts.bodySemiBold,
      color: colors.primary,
    },

    softDangerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: radii.md,
      paddingVertical: 15,
      backgroundColor: colors.dangerSoft,
    },
    softDangerBtnText: {
      fontSize: 15,
      fontFamily: fonts.bodySemiBold,
      color: colors.danger,
    },

    mutedBtn: {
      paddingVertical: 14,
      borderRadius: radii.md,
      alignItems: 'center',
      backgroundColor: colors.faint,
    },
    mutedBtnText: {
      fontSize: 16,
      fontFamily: fonts.bodySemiBold,
      color: colors.ink,
    },

    errorBox: {
      backgroundColor: colors.dangerSoft,
      borderRadius: radii.sm,
      padding: 12,
    },
    errorText: {
      color: colors.danger,
      fontSize: 14,
      fontFamily: fonts.body,
      lineHeight: 20,
    },

    listGap: { height: 8 },
    listGapSm: { height: 10 },
  });
}
