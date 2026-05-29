import { lightColors, radii, shadow, tightShadow, fonts } from '../constants/theme';

// Dark mode has been removed — PantryPal is light-only.
export function useTheme() {
  return {
    colors: lightColors,
    isDark: false,
    toggleTheme: () => {},
    radii,
    shadow,
    tightShadow,
    fonts,
  };
}
