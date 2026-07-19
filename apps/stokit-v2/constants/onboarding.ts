/**
 * Onboarding slide content + theme-aware illustration selection.
 *
 * Each slide carries both a light and a dark illustration so artwork remains
 * legible without a contrasting panel in either theme.
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
    title: ['Your pantry,', 'in order.'],
    subtitle: 'See what you have\nand what to buy.',
    light: require('../assets/onboarding/onboarding-pantry.png'),
    dark: require('../assets/onboarding/onboarding-pantry-dark.png'),
  },
  {
    key: 'household',
    title: ['One list,', 'together.'],
    subtitle: 'Keep everyone in sync,\nwherever they are.',
    light: require('../assets/onboarding/onboarding-household.png'),
    dark: require('../assets/onboarding/onboarding-household-dark.png'),
  },
  {
    key: 'receipts',
    title: ['Receipts,', 'simplified.'],
    subtitle: 'Track what you spend,\nstore by store.',
    light: require('../assets/onboarding/onboarding-receipts.png'),
    dark: require('../assets/onboarding/onboarding-receipts-dark.png'),
  },
];

/** Selects the correct illustration for the active theme. */
export function slideArtwork(slide: OnboardingSlide, isDark: boolean): ImageSourcePropType {
  return isDark ? slide.dark : slide.light;
}
