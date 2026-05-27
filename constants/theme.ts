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
  // Charcoal-first: warmth lives in the copper accent, not the canvas.
  // Surfaces are near-neutral so cards read clearly without a brown haze.
  background: '#131211',    // near-black — cool enough to drop the brown cast
  surface: '#1F1D1B',       // dark charcoal card — clear lift from background
  primary: '#D4874E',       // copper — the single warm anchor
  primarySoft: '#261608',
  primaryDeep: '#E09A5F',
  ink: '#F0EDE8',           // crisp near-white, less saturated than before
  inkSoft: '#E4E0DA',
  muted: '#8C8784',         // neutral-gray, not warm-gray
  placeholder: '#5C5856',
  faint: '#181716',
  border: '#2E2C2A',        // near-neutral border — cards stand out cleanly
  success: '#5A9E70',
  successSoft: '#0D2A14',
  warning: '#D4874E',       // copper doubles as "low" warning in dark mode
  warningSoft: '#261608',
  danger: '#C05050',
  dangerSoft: '#2A0D0D',
  low: '#D4874E',
  lowSoft: '#261608',
  lowText: '#F0C890',
  lowBadgeBg: '#3A2010',
  lowBadgeText: '#F0C890',
  disabled: '#323030',
  dangerText: '#E07070',
  accent: '#5A9E70',
  accentSoft: '#0D2A14',
  surfaceDeep: '#0B0A09',
  surfaceWarm: '#1F1D1B',
  surfaceTint: '#261608',
  inkSoftAlt: '#E4E0DA',
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
