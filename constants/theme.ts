// ─── Slow Kitchen design system ───────────────────────────────────────────────
// Dark-first. Espresso background, copper accent, cream ink.
// See DESIGN.md for full rationale, token reference, and light-mode values.

export const lightColors = {
  background: '#F5EFE6',
  surface: '#FFFBF5',
  primary: '#C07038',       // copper (darker for light mode contrast)
  primarySoft: '#FFF0E0',
  primaryDeep: '#A05A28',
  ink: '#221A12',
  inkSoft: '#3A2A1A',
  muted: '#907660',
  placeholder: '#B0A090',
  faint: '#EDE4D8',
  border: '#D8CABC',
  success: '#3D6B4F',
  successSoft: '#EAF4EE',
  warning: '#C07038',       // copper doubles as "low" warning in light mode
  warningSoft: '#FFF0E0',
  danger: '#A03030',
  dangerSoft: '#FFEDED',
  low: '#C07038',
  lowSoft: '#FFF0E0',
  lowText: '#7A4010',
  lowBadgeBg: '#F8D8A0',
  lowBadgeText: '#7A4010',
  disabled: '#C8BDB0',
  // compat aliases
  dangerText: '#991B1B',
  accent: '#3D6B4F',
  accentSoft: '#EAF4EE',
  surfaceDeep: '#221A12',
  surfaceWarm: '#F5EFE6',
  surfaceTint: '#FFF0E0',
  inkSoftAlt: '#3A2A1A',
  lowText2: '#7A4010',
};

export const darkColors: typeof lightColors = {
  background: '#1C1812',    // espresso
  surface: '#2E231A',       // lifted — cards must stand out from background
  primary: '#D4874E',       // copper
  primarySoft: '#2A1A0A',
  primaryDeep: '#E09A5F',
  ink: '#F0E8DC',           // cream
  inkSoft: '#E8D8C4',
  muted: '#9C8A76',
  placeholder: '#6A5A4A',
  faint: '#251C14',
  border: '#4A3A2C',        // stronger border so cards have a clear edge
  success: '#5A9E70',
  successSoft: '#0D2A14',
  warning: '#D4874E',       // copper doubles as "low" warning in dark mode
  warningSoft: '#2A1A0A',
  danger: '#C05050',
  dangerSoft: '#2A0D0D',
  low: '#D4874E',
  lowSoft: '#2A1A0A',
  lowText: '#F0C890',
  lowBadgeBg: '#3A2010',
  lowBadgeText: '#F0C890',
  disabled: '#3A3028',
  dangerText: '#E07070',
  accent: '#5A9E70',
  accentSoft: '#0D2A14',
  surfaceDeep: '#0F0D0A',
  surfaceWarm: '#2E231A',
  surfaceTint: '#2A1A0A',
  inkSoftAlt: '#E8D8C4',
  lowText2: '#F0C890',
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
  shadowColor: '#1C1812',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 3,
};

export const tightShadow = {
  shadowColor: '#1C1812',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 2,
};
