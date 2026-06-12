/**
 * Stokit V2 — Market Fresh palette (tomato red / crisp white).
 *
 * Bold, vivid, and energetic. Light is primary; dark mode toggled via useTheme.
 * Layout, fonts, spacing, and all logic are unchanged from V2.
 */

export const lightColors = {
  // Surfaces — crisp white
  background: '#FFFFFF',
  backgroundElevated: '#FFFFFF',
  surface: '#F7F8FC',
  surfaceRaised: '#ECEEF4',
  faint: '#F3F4F6',

  // Accents — tomato red
  primary: '#E8432D',
  primaryBright: '#FF6B52',
  gold: '#D97706',
  onPrimary: '#FFFFFF',
  primarySoft: '#FDECEA',

  // Text — near-black hierarchy
  ink: '#111827',
  inkSoft: '#374151',
  muted: '#9CA3AF',
  faintText: '#9CA3AF',

  // Lines
  border: '#E5E7EB',
  borderSoft: '#F3F4F6',

  // Status
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#3B82F6',
} as const;

export const fonts = {
  // Display / headings — elegant serif
  serif: 'PlayfairDisplay_700Bold',
  serifItalic: 'PlayfairDisplay_700Bold_Italic',
  serifRegular: 'PlayfairDisplay_400Regular',
  // Body / UI
  sans: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansSemibold: 'DMSans_600SemiBold',
  // Data / numerics
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

export const darkColors = {
  background: '#0F1117',
  backgroundElevated: '#1A1D27',
  surface: '#1A1D27',
  surfaceRaised: '#222640',
  faint: '#1F2235',
  primary: '#FF6B52',
  primaryBright: '#FF8B72',
  gold: '#FBBF24',
  onPrimary: '#FFFFFF',
  primarySoft: '#2D1410',
  ink: '#F9FAFB',
  inkSoft: '#E5E7EB',
  muted: '#6B7280',
  faintText: '#6B7280',
  border: '#2D3148',
  borderSoft: '#1F2235',
  success: '#34D399',
  successSoft: '#0D2018',
  warning: '#FBBF24',
  warningSoft: '#262012',
  danger: '#F87171',
  dangerSoft: '#2D1212',
  info: '#60A5FA',
};

// Backward-compat alias — existing module-level imports still work
export const colors = lightColors;

// String-valued type so darkColors (without as const) satisfies it
export type AppColors = { [K in keyof typeof lightColors]: string };

export const type = {
  pageTitle: { fontFamily: fonts.serifItalic, fontSize: 40, lineHeight: 46 },
  sectionTitle: { fontFamily: fonts.serifItalic, fontSize: 22, lineHeight: 28 },
  cardTitle: { fontFamily: fonts.sansSemibold, fontSize: 16 },
  body: { fontFamily: fonts.sans, fontSize: 15 },
  label: { fontFamily: fonts.sansSemibold, fontSize: 13 },
  caption: { fontFamily: fonts.sans, fontSize: 12 },
  meta: { fontFamily: fonts.mono, fontSize: 12 },
  bigStat: { fontFamily: fonts.mono, fontSize: 30 },
} as const;

// Canonical icon sizes — prefer these over inline numbers in new code
export const iconSizes = { xs: 14, sm: 16, md: 20, lg: 24, xl: 32 } as const;

export const shadow = {
  card: {
    shadowColor: '#221A12',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
} as const;

export const theme = { colors, fonts, spacing, radii, type, iconSizes, shadow };
export default theme;
