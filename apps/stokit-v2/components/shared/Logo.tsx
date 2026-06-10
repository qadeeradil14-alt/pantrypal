import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

export function Logo({ size = 40, color = '#FFFFFF', accent = '#FF3B30' }: { size?: number, color?: string, accent?: string }) {
  return (
    <Svg width={size} height={size} viewBox="120 90 272 360" fill="none">
      <Defs>
        <LinearGradient id="bagGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={accent} />
          <Stop offset="100%" stopColor="#FF2D55" />
        </LinearGradient>
      </Defs>
      {/* Bag Handle */}
      <Path
        d="M 200 200 V 160 C 200 128, 224 104, 256 104 C 288 104, 312 128, 312 160 V 200"
        stroke={color}
        strokeWidth={24}
        strokeLinecap="round"
        fill="none"
      />
      {/* Bag Body */}
      <Path
        d="M 144 200 C 128 200, 120 216, 128 232 L 160 408 C 160 424, 176 432, 192 432 H 320 C 336 432, 352 424, 352 408 L 384 232 C 392 216, 384 200, 368 200 Z"
        fill="url(#bagGrad)"
      />
      {/* S Initial on Bag */}
      <Path
        d="M 280 272 C 280 256, 232 256, 232 288 C 232 320, 280 320, 280 352 C 280 384, 232 384, 232 368"
        stroke={color}
        strokeWidth={20}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
