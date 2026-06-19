import React from 'react';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

/**
 * Stokit "Midnight S" mark — a faithful in-app copy of the approved app icon
 * (assets/icon-light.svg / icon-dark.svg): a faint ghost shopping bag with a
 * bold red "S" as the hero. Transparent background so it sits on any surface.
 *
 *  - `color`  drives the ghost bag (pass the theme ink so it adapts light/dark).
 *  - `accent` is the bold S; defaults to the brand red used by the icon.
 */
export function Logo({
  size = 40,
  color = '#111827',
  accent = '#E8432D',
}: {
  size?: number;
  color?: string;
  accent?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" fill="none">
      {/* Bag handle — faint ghost */}
      <Path
        d="M 283 488 L 283 370 C 283 260 346 197 512 197 C 678 197 740 260 740 370 L 740 488"
        stroke={color}
        strokeOpacity={0.12}
        strokeWidth={47}
        strokeLinecap="round"
        fill="none"
      />
      {/* Bag body — faint ghost */}
      <Path
        d="M 150 488 C 118 488 102 520 110 559 L 197 866 C 197 906 236 921 268 921 L 756 921 C 788 921 827 906 827 866 L 914 559 C 922 520 906 488 874 488 Z"
        fill={color}
        fillOpacity={0.045}
        stroke={color}
        strokeOpacity={0.1}
        strokeWidth={9}
      />
      {/* Bold S — the hero, matches the icon exactly */}
      <SvgText
        x={512}
        y={800}
        textAnchor="middle"
        fontFamily="Helvetica Neue"
        fontSize={600}
        fontWeight="700"
        fill={accent}
      >
        S
      </SvgText>
    </Svg>
  );
}
