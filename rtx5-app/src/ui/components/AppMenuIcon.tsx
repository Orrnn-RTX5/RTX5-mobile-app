import React, { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

// Use one balanced staggered vector menu icon across all screen headers; the parent retains its full tap area.
export const AppMenuIcon = memo(function AppMenuIcon({
  color,
  size = 22,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 6H20.5M3.5 12H16M3.5 18H11.5"
        stroke={color}
        strokeWidth="2.15"
        strokeLinecap="round"
      />
    </Svg>
  );
});
