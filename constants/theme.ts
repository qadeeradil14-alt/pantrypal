export const lightColors = {
  background: '#FFF8F0',
  surface: '#FFFFFF',
  primary: '#E84A3D',
  primarySoft: '#FFF0EE',
  primaryDeep: '#C53B2F',
  ink: '#1A1A2A',
  inkSoft: '#3D3845',
  muted: '#8E9BAE',
  placeholder: '#AABBC8',
  faint: '#F0E8E0',
  border: '#E8DED4',
  success: '#22C55E',
  successSoft: '#F0FFF4',
  warning: '#F59E0B',
  warningSoft: '#FFFBEB',
  danger: '#E84A3D',
  dangerSoft: '#FFF0EE',
  low: '#F59E0B',
  lowSoft: '#FFFBEB',
  lowText: '#92400E',
  lowBadgeBg: '#FDE68A',
  lowBadgeText: '#78350F',
  disabled: '#D0C8C0',
  // compat aliases used by screens not yet migrated
  dangerText: '#991B1B',
  accent: '#16A34A',
  accentSoft: '#EAF9EF',
  surfaceDeep: '#1A1A2A',
  surfaceWarm: '#FFF8F0',
  surfaceTint: '#FFF0EE',
  inkSoftAlt: '#3D3845',
  lowText2: '#92400E',
};

export const darkColors: typeof lightColors = {
  background: '#0F0F0F',
  surface: '#1C1C1E',
  primary: '#E84A3D',
  primarySoft: '#2A1010',
  primaryDeep: '#F06054',
  ink: '#F2F2F7',
  inkSoft: '#EBEBF5',
  muted: '#8E8E93',
  placeholder: '#636366',
  faint: '#2C2C2E',
  border: '#38383A',
  success: '#32D74B',
  successSoft: '#0D2018',
  warning: '#FF9F0A',
  warningSoft: '#1F1400',
  danger: '#E84A3D',
  dangerSoft: '#2A1010',
  low: '#FF9F0A',
  lowSoft: '#1F1400',
  lowText: '#FFD60A',
  lowBadgeBg: '#2A1A00',
  lowBadgeText: '#FFD60A',
  disabled: '#3A3A3C',
  dangerText: '#FF453A',
  accent: '#32D74B',
  accentSoft: '#0D2018',
  surfaceDeep: '#000000',
  surfaceWarm: '#1C1C1E',
  surfaceTint: '#2A1010',
  inkSoftAlt: '#EBEBF5',
  lowText2: '#FFD60A',
};

export type AppColors = typeof lightColors;

// Backward compat — existing screens that import `colors` still work
export const colors = lightColors;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
};

export const shadow = {
  shadowColor: '#1A1A2A',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 3,
};

export const tightShadow = {
  shadowColor: '#1A1A2A',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 2,
};
