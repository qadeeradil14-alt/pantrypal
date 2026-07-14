import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveAvatarDisplay } from '../../core/services/profileAvatar';
import { fonts } from '../../theme';

type AvatarProps = {
  photoUrl?: string | null;
  displayName?: string;
  color: string;
  size: number;
  borderColor?: string;
  borderWidth?: number;
};

export function Avatar({
  photoUrl,
  displayName = '',
  color,
  size,
  borderColor = color,
  borderWidth = 1.5,
}: AvatarProps) {
  const [imageFailed, setImageFailed] = React.useState(false);
  React.useEffect(() => setImageFailed(false), [photoUrl]);
  const display = resolveAvatarDisplay(imageFailed ? null : photoUrl, displayName);
  const circleStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderColor,
    borderWidth,
  };

  if (display.kind === 'photo') {
    return (
      <Image
        source={{ uri: display.uri }}
        style={[styles.circle, circleStyle]}
        resizeMode="cover"
        onError={() => setImageFailed(true)}
        accessibilityLabel={`${displayName || 'User'} profile photo`}
      />
    );
  }

  return (
    <View style={[styles.circle, circleStyle, { backgroundColor: `${color}33` }]}>
      {display.kind === 'initials' ? (
        <Text style={[styles.initials, { color, fontSize: Math.max(11, size * 0.34) }]}>{display.text}</Text>
      ) : (
        <Ionicons name="person" size={size * 0.5} color={color} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { fontFamily: fonts.sansSemibold },
});
