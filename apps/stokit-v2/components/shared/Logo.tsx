import React from 'react';
import Svg, { Path } from 'react-native-svg';

export function Logo({ size = 40, color = '#a86f3f', accent = '#c85c3a' }: { size?: number, color?: string, accent?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" fill="none">
      {/* Handle */}
      <Path
        d="M336 392c38-102 90-154 176-154s138 52 176 154"
        fill="none"
        stroke={color}
        strokeWidth={54}
        strokeLinecap="round"
      />
      {/* Basket Body */}
      <Path
        d="M262 410h500l-72 316c-10 45-42 69-88 69H422c-46 0-78-24-88-69l-72-316Z"
        fill={color}
      />
      {/* Inner Basket Shadow */}
      <Path
        d="M348 485h328l-44 207c-5 24-22 36-47 36H439c-25 0-42-12-47-36l-44-207Z"
        fill="#17130F"
        opacity={0.92}
      />
      {/* Heart */}
      <Path
        d="M414 558c0-37 27-64 64-64 17 0 30 6 42 18 12-12 25-18 42-18 37 0 64 27 64 64 0 61-47 117-106 153-59-36-106-92-106-153Z"
        fill={accent}
      />
      {/* Checkmark inside heart */}
      <Path
        d="M477 587l35 35 71-84"
        fill="none"
        stroke="#ffffff"
        strokeWidth={28}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
