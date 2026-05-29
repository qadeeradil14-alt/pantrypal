// ─── PantryPal design system ─────────────────────────────────────────────────
// Neutral-first, with fresh grocery green as the main action color.
// See DESIGN.md for full rationale, token reference, and light-mode values.

export const lightColors = {
  background: '#F2F4ED',
  surface: '#FFFFFF',
  primary: '#2F7D5C',
  primarySoft: '#EAF4EE',
  primaryDeep: '#235F46',
  ink: '#171A18',
  inkSoft: '#303833',
  muted: '#65736A',
  placeholder: '#9AA59D',
  faint: '#E8ECE7',
  border: '#DDE4DE',
  success: '#2F7D5C',
  successSoft: '#EAF4EE',
  warning: '#B56A24',
  warningSoft: '#FFF3E4',
  danger: '#A93838',
  dangerSoft: '#FFECEC',
  low: '#B56A24',
  lowSoft: '#FFF3E4',
  lowText: '#7B3F10',
  lowBadgeBg: '#F9D7A5',
  lowBadgeText: '#7B3F10',
  disabled: '#C8D0CA',
  // compat aliases
  dangerText: '#991B1B',
  accent: '#2F7D5C',
  accentSoft: '#EAF4EE',
  surfaceDeep: '#171A18',
  surfaceWarm: '#F2F4ED',
  surfaceTint: '#EAF4EE',
  inkSoftAlt: '#303833',
  lowText2: '#7B3F10',
};

export const darkColors: typeof lightColors = {
  background: '#101412',
  surface: '#1A201D',
  primary: '#72C79A',
  primarySoft: '#10271A',
  primaryDeep: '#9BE0B8',
  ink: '#EEF3EF',
  inkSoft: '#DCE5DF',
  muted: '#9AA69E',
  placeholder: '#657069',
  faint: '#151A17',
  border: '#2A342E',
  success: '#72C79A',
  successSoft: '#10271A',
  warning: '#E6A15E',
  warningSoft: '#2C1D0F',
  danger: '#E06C6C',
  dangerSoft: '#2A1010',
  low: '#E6A15E',
  lowSoft: '#2C1D0F',
  lowText: '#F4C796',
  lowBadgeBg: '#3A2412',
  lowBadgeText: '#F4C796',
  disabled: '#303833',
  dangerText: '#F08A8A',
  accent: '#72C79A',
  accentSoft: '#10271A',
  surfaceDeep: '#080B09',
  surfaceWarm: '#1A201D',
  surfaceTint: '#10271A',
  inkSoftAlt: '#DCE5DF',
  lowText2: '#F4C796',
};

export type AppColors = typeof lightColors;

// ── Font family constants ──────────────────────────────────────────────────
// Use these everywhere instead of raw strings to catch typos at compile time.
export const fonts = {
  display:            'PlayfairDisplay-Bold',
  displayItalic:      'PlayfairDisplay-BoldItalic',
  displayExtraBold:   'PlayfairDisplay-ExtraBold',
  displayExtraBoldItalic: 'PlayfairDisplay-ExtraBoldItalic',
  displayRegular:     'PlayfairDisplay-Regular',
  displayRegularItalic: 'PlayfairDisplay-Italic',
  body:               'DMSans-Regular',
  bodyLight:          'DMSans-Light',
  bodyMedium:         'DMSans-Medium',
  bodySemiBold:       'DMSans-SemiBold',
  mono:               'DMMono-Regular',
  monoMedium:         'DMMono-Medium',
} as const;

// Backward compat — existing screens that import `colors` still work
export const colors = lightColors;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
};

export const shadow = {
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
};

export const tightShadow = {
  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
};
