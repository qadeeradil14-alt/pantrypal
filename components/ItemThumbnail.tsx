import { Text, StyleSheet } from 'react-native';
import { getItemEmoji } from '../constants/itemEmojis';

interface Props {
  name: string;
  category?: string | null;
  size?: number;
}

export default function ItemThumbnail({ name, category, size = 32 }: Props) {
  return (
    <Text style={[styles.emoji, { width: size, fontSize: Math.round(size * 0.9) }]}>
      {getItemEmoji(name, category ?? '')}
    </Text>
  );
}

const styles = StyleSheet.create({
  emoji: {
    textAlign: 'center',
  },
});
