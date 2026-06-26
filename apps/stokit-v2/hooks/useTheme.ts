import { useColorScheme } from 'react-native';
import { lightColors, darkColors, type AppColors } from '../theme';
import { useThemeStore } from '../store/theme';

export function useTheme(): { colors: AppColors; isDark: boolean; toggle: () => void } {
  const systemScheme = useColorScheme();
  const { isDark: stored, setIsDark } = useThemeStore();
  // Explicit user preference overrides system; null means "follow iOS appearance"
  const isDark = stored ?? (systemScheme === 'dark');
  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
    toggle: () => setIsDark(!isDark),
  };
}
