import React from 'react';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

/**
 * Stokit bag mark. Transparent background so it sits on any surface.
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
        d="M 352 350 V 272 C 352 124 672 124 672 272 V 350"
        stroke={color}
        strokeOpacity={0.18}
        strokeWidth={58}
        strokeLinecap="round"
      />
      <Path
        d="M 258 492 V 716 C 258 826 334 890 444 890 H 580 C 690 890 766 826 766 716 V 492"
        stroke={color}
        strokeOpacity={0.18}
        strokeWidth={58}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
    </Svg>
  );
}
