// ─── PantryPal design system ─────────────────────────────────────────────────
// Slow Kitchen — Warm Editorial. Espresso + softened copper.
// See DESIGN.md for full rationale, token reference, and light-mode values.

export const lightColors = {
  background: '#F5EFE6',
  surface: '#FFFBF5',
  primary: '#C98752',
  onPrimary: '#221A12', // dark espresso text/icons on copper buttons (4.6:1)
  primarySoft: '#F7EADB',
  primaryDeep: '#A45F34',
  ink: '#221A12',
  inkSoft: '#4A3020',
  muted: '#907660',
  placeholder: '#B09070',
  faint: '#EDE4D8',
  border: '#D8CABC',
  success: '#3D6B4F',
  successSoft: '#E0EEE6',
  warning: '#C98752',
  warningSoft: '#F7EADB',
  danger: '#A03030',
  dangerSoft: '#F9E0E0',
  low: '#C98752',
  lowSoft: '#F7EADB',
  lowText: '#8B5127',
  lowBadgeBg: '#F8D9B8',
  lowBadgeText: '#8B5127',
  disabled: '#C8B8A0',
  // compat aliases
  dangerText: '#8B1C1C',
  accent: '#C98752',
  accentSoft: '#F7EADB',
  surfaceDeep: '#221A12',
  surfaceWarm: '#FFFBF5',
  surfaceTint: '#F7EADB',
  inkSoftAlt: '#4A3020',
  lowText2: '#8B5127',
};

export const darkColors: typeof lightColors = {
  background: '#1C1812',
  surface: '#271F19',
  primary: '#D99A68',
  onPrimary: '#1C1812', // dark espresso text/icons on copper buttons (6.2:1)
  primarySoft: '#2A1A0A',
  primaryDeep: '#C07848',
  ink: '#F0E8DC',
  inkSoft: '#D8C4A8',
  muted: '#9E8770', // lightened from #8C7A68 to clear 4.5:1 on surface
  placeholder: '#6E5A48',
  faint: '#221A12',
  border: '#3A2E24',
  success: '#5A9E70',
  successSoft: '#162818',
  warning: '#D99A68',
  warningSoft: '#2A1A0A',
  danger: '#C05050',
  dangerSoft: '#2A1010',
  low: '#D99A68',
  lowSoft: '#2A1A0A',
  lowText: '#F4A870',
  lowBadgeBg: '#3D2010',
  lowBadgeText: '#F4A870',
  disabled: '#4A3C2E',
  dangerText: '#E07070',
  accent: '#D99A68',
  accentSoft: '#2A1A0A',
  surfaceDeep: '#18110A',
  surfaceWarm: '#271F19',
  surfaceTint: '#2A1A0A',
  inkSoftAlt: '#D8C4A8',
  lowText2: '#F4A870',
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
  welcomeDisplay:     'Fraunces-SemiBold',
  welcomeBrand:       'Fraunces-Medium',
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
