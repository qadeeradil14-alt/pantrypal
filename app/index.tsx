import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '../hooks/useTheme';

export default function Index() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
