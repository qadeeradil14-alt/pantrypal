// Single source of truth for the PantryPal design system.
// All screens should import from here instead of hard-coding hex values.
export const colors = {
  // Backgrounds
  background: '#FAFAFA',
  surface: '#FFFFFF',

  // Text
  ink: '#111827',
  muted: '#6B7280',
  placeholder: '#9CA3AF',

  // Borders / dividers
  faint: '#F3F4F6',
  border: '#E5E7EB',

  // Primary — green
  primary: '#16A34A',
  primarySoft: '#D1FAE5',
  primaryDeep: '#166534',

  // Low / alert — orange
  low: '#F97316',
  lowText: '#C2410C',
  lowSoft: '#FFF8F0',
  lowBadgeBg: '#FED7AA',
  lowBadgeText: '#9A3412',

  // Destructive
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  dangerText: '#B91C1C',

  // Category tints (section headers, optional)
  fridge: '#E8F2D8',
  freezer: '#DBECF6',
  pantry: '#F7E4BE',

  // Disabled
  disabled: '#D1D5DB',
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

// React Native shadow (iOS). Android uses elevation on the component itself.
export const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 16,
};
