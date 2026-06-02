import { Text, StyleSheet } from 'react-native';
import { getItemEmoji } from '../constants/itemEmojis';
import AppIcon from './AppIcon';

interface Props {
  name: string;
  category?: string | null;
  size?: number;
}

/** Item row avatar: product emoji when we recognize the name, otherwise the Stokit app icon. */
export default function ItemThumbnail({ name, category, size = 32 }: Props) {
  const emoji = getItemEmoji(name, category ?? '');
  if (emoji) {
    return <Text style={[styles.emoji, { fontSize: Math.round(size * 0.9) }]}>{emoji}</Text>;
  }
  return <AppIcon size={size} />;
}

const styles = StyleSheet.create({
  emoji: {
    width: 32,
    textAlign: 'center',
  },
});
