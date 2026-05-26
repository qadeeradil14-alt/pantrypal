import { useThemeStore } from '../store/theme';
import { lightColors, darkColors, radii, shadow, tightShadow } from '../constants/theme';

export function useTheme() {
  const { isDark, toggle } = useThemeStore();
  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
    toggleTheme: toggle,
    radii,
    shadow,
    tightShadow,
  };
}
