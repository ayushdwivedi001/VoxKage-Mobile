import React from 'react';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

// Gradient V Logo SVG (No box, clean geometric layered ribbons)
export const LogoV = ({ size = 64 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Defs>
      <SvgGradient id="logoGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
        <Stop offset="50%" stopColor="#2563eb" stopOpacity={0.9} />
        <Stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.9} />
      </SvgGradient>
      <SvgGradient id="logoGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
        <Stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.9} />
        <Stop offset="50%" stopColor="#0f172a" stopOpacity={0.9} />
        <Stop offset="100%" stopColor="#020617" stopOpacity={0.9} />
      </SvgGradient>
    </Defs>
    <Path
      d="M20 18 L46 82 L56 82 L32 18 Z"
      fill="url(#logoGrad1)"
    />
    <Path
      d="M80 18 L54 82 L44 82 L68 18 Z"
      fill="url(#logoGrad2)"
    />
  </Svg>
);
