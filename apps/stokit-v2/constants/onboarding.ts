/**
 * Onboarding slide content + theme-aware illustration selection.
 *
 * Each slide carries BOTH a light and a dark illustration. The dark files are
 * currently identical copies of the light art (placeholders); dropping the
 * final dark PNGs at the same paths swaps them in with ZERO code changes.
 */
import type { ImageSourcePropType } from 'react-native';

export type OnboardingSlide = {
  key: string;
  /** Headline split into two lines; the second line is accented orange. */
  title: [string, string];
  subtitle: string;
  light: ImageSourcePropType;
  dark: ImageSourcePropType;
};

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    key: 'pantry',
    title: ['Shop smarter,', 'stock better.'],
    subtitle: 'Find the best deals and keep your pantry always ready.',
    light: require('../assets/onboarding/onboarding-pantry.png'),
    dark: require('../assets/onboarding/onboarding-pantry-dark.png'),
  },
  {
    key: 'household',
    title: ['One household,', 'everyone in sync.'],
    subtitle: 'Share lists, update in real time, and never miss a thing.',
    light: require('../assets/onboarding/onboarding-household.png'),
    dark: require('../assets/onboarding/onboarding-household-dark.png'),
  },
  {
    key: 'receipts',
    title: ['Track receipts,', 'know your spending.'],
    subtitle: 'Upload receipts, track spending by store, and make smarter decisions.',
    light: require('../assets/onboarding/onboarding-receipts.png'),
    dark: require('../assets/onboarding/onboarding-receipts-dark.png'),
  },
];

/** Selects the correct illustration for the active theme. */
export function slideArtwork(slide: OnboardingSlide, isDark: boolean): ImageSourcePropType {
  return isDark ? slide.dark : slide.light;
}
