import { lightColors, darkColors, type AppColors } from '../theme';
import { useThemeStore } from '../store/theme';

export function useTheme(): { colors: AppColors; isDark: boolean; toggle: () => void } {
  const { isDark, toggle } = useThemeStore();
  return { colors: isDark ? darkColors : lightColors, isDark, toggle };
}
