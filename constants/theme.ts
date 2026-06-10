// ─── Stokit design system ─────────────────────────────────────────────────────
// Market Fresh — Bold & Vivid. Tomato red primary, crisp white base.
// See DESIGN.md for full rationale, token reference, and dark-mode values.

export const lightColors = {
  background: '#FFFFFF',
  surface: '#F7F8FC',
  primary: '#E8432D',
  onPrimary: '#FFFFFF',
  primarySoft: '#FDECEA',
  primaryDeep: '#C0311F',
  ink: '#111827',
  inkSoft: '#374151',
  muted: '#9CA3AF',
  placeholder: '#D1D5DB',
  faint: '#F3F4F6',
  border: '#E5E7EB',
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  low: '#D97706',
  lowSoft: '#FEF3C7',
  lowText: '#92400E',
  lowBadgeBg: '#FEF3C7',
  lowBadgeText: '#92400E',
  disabled: '#D1D5DB',
  // compat aliases
  dangerText: '#991B1B',
  accent: '#E8432D',
  accentSoft: '#FDECEA',
  surfaceDeep: '#111827',
  surfaceWarm: '#FFFFFF',
  surfaceTint: '#FDECEA',
  inkSoftAlt: '#374151',
  lowText2: '#92400E',
};

export const darkColors: typeof lightColors = {
  background: '#0F1117',
  surface: '#1A1D27',
  primary: '#FF6B52',
  onPrimary: '#FFFFFF',
  primarySoft: '#2D1410',
  primaryDeep: '#E8432D',
  ink: '#F9FAFB',
  inkSoft: '#E5E7EB',
  muted: '#6B7280',
  placeholder: '#4B5563',
  faint: '#1F2235',
  border: '#2D3148',
  success: '#34D399',
  successSoft: '#0D2018',
  warning: '#FBBF24',
  warningSoft: '#262012',
  danger: '#F87171',
  dangerSoft: '#2D1212',
  low: '#FBBF24',
  lowSoft: '#262012',
  lowText: '#FBBF24',
  lowBadgeBg: '#2D2410',
  lowBadgeText: '#FBBF24',
  disabled: '#374151',
  dangerText: '#F87171',
  accent: '#FF6B52',
  accentSoft: '#2D1410',
  surfaceDeep: '#0F1117',
  surfaceWarm: '#1A1D27',
  surfaceTint: '#2D1410',
  inkSoftAlt: '#E5E7EB',
  lowText2: '#FBBF24',
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
