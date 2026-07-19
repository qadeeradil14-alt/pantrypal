import React from 'react';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

/**
 * Stokit "Pantry Label" mark. Transparent background so it sits on any surface.
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
      <Path
        d="M 238 218 Q 238 178 278 178 H 634 Q 670 178 695 203 L 820 328 Q 842 350 842 382 V 788 Q 842 836 794 836 H 286 Q 238 836 238 788 Z"
        fill={color}
        fillOpacity={0.055}
        stroke={color}
        strokeOpacity={0.14}
        strokeWidth={20}
      />
      <Circle cx={690} cy={312} r={28} fill={color} fillOpacity={0.14} />
      <SvgText
        x={512}
        y={672}
        textAnchor="middle"
        fontFamily="Helvetica Neue"
        fontSize={480}
        fontWeight="700"
        fill={accent}
      >
        S
      </SvgText>
      <Path d="M 374 742 H 650" stroke={color} strokeOpacity={0.15} strokeWidth={18} strokeLinecap="round" />
      <Path d="M 430 700 V 742 M 512 688 V 742 M 594 700 V 742" stroke={color} strokeOpacity={0.15} strokeWidth={16} strokeLinecap="round" />
    </Svg>
  );
}
