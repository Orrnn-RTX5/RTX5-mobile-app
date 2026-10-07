/**
 * Chart Feature UI: ChartToolbarIcons
 * 
 * A collection of reusable, scalable SVG vector icons specifically designed
 * for the various drawing tools and indicators in the chart's sidebar toolbar.
 */

import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline, G } from 'react-native-svg';

export const CHART_HEADER_ICON_SIZE = 22;
// Pencil and menu-dot font glyphs need a smaller size to visually balance
// with the crosshair and clock SVGs in the header.
export const CHART_HEADER_GLYPH_SIZE = 18;

export const TvTradeClock = ({ color, size = CHART_HEADER_ICON_SIZE }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 66 66" fill="none">
    {/* MT5 has a wide outer capsule around a circular opening, rather than a stroked circle. */}
    <Path d="M31.5 10H27a24 24 0 0 0 0 48h4.5v-6.063a18 18 0 0 1 0-35.874Z" fill="#DA5244" />
    <Path d="M34.5 10H39a24 24 0 0 1 0 48h-4.5v-6.063a18 18 0 0 0 0-35.874Z" fill="#3687ED" />
    <Path d="M30 22h6v13l8 8-4 4-10-10Z" fill={color} />
  </Svg>
);

export const TvCrosshair = ({ color, size = 26, strokeWidth = 2, active = false }: { color: string; size?: number; strokeWidth?: number; active?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {active ? (
      <Path
        d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : (
      <>
        <Path
          d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <Circle cx="12" cy="12" r="1" fill={color} />
      </>
    )}
  </Svg>
);

export const TvTrendLine = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Line x1="7" y1="21" x2="21" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="7" cy="21" r="2" fill={color} />
    <Circle cx="21" cy="7" r="2" fill={color} />
  </Svg>
);

export const TvHorizontalLine = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Line x1="5" y1="14" x2="23" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="14" cy="14" r="2" fill={color} />
  </Svg>
);

export const TvHorizontalRay = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Line x1="7" y1="14" x2="22" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M19 11l3 3-3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="7" cy="14" r="2" fill={color} />
  </Svg>
);

export const TvVerticalLine = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Line x1="14" y1="5" x2="14" y2="23" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="14" cy="14" r="2" fill={color} />
  </Svg>
);

export const TvRay = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Line x1="7" y1="20" x2="20" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M18 7.5l3 0.2-0.4 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="7" cy="20" r="2" fill={color} />
  </Svg>
);

export const TvExtendedLine = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Line x1="5" y1="21" x2="23" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M8 18.5L5 21l3.8.3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M20 9.5L23 7l-3.8-.3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="11" cy="16.3" r="1.6" fill={color} />
    <Circle cx="17" cy="11.7" r="1.6" fill={color} />
  </Svg>
);

export const TvArrowMarker = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Line x1="7" y1="21" x2="20" y2="8" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    <Path d="M15.8 8.3H20v4.2" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="7" cy="21" r="1.8" fill={color} />
  </Svg>
);

export const TvParallelChannel = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M7 19l11-11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M10 22l11-11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M8.5 20.5l11-11" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity={0.65} />
    <Circle cx="7" cy="19" r="1.7" fill={color} />
    <Circle cx="18" cy="8" r="1.7" fill={color} />
    <Circle cx="10" cy="22" r="1.7" fill={color} />
  </Svg>
);

export const TvShortPosition = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="9" y="7" width="10" height="14" rx="1" stroke={color} strokeWidth="1.5" />
    <Line x1="9" y1="14" x2="19" y2="14" stroke={color} strokeWidth="1.5" />
    <Path d="M14 11v6M14 17l-2.2-2.2M14 17l2.2-2.2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvFib = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Line x1="6" y1="8" x2="22" y2="8" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
    <Line x1="6" y1="14" x2="22" y2="14" stroke={color} strokeWidth="1.5" />
    <Line x1="6" y1="20" x2="22" y2="20" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
    <Circle cx="14" cy="8" r="1.5" fill={color} />
    <Circle cx="14" cy="20" r="1.5" fill={color} />
    <Line x1="14" y1="8" x2="14" y2="20" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity={0.5} />
  </Svg>
);

export const TvFibExtension = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Line x1="6" y1="8" x2="22" y2="8" stroke={color} strokeWidth="1.4" />
    <Line x1="6" y1="13" x2="22" y2="13" stroke={color} strokeWidth="1.4" strokeDasharray="2 2" />
    <Line x1="6" y1="18" x2="22" y2="18" stroke={color} strokeWidth="1.4" strokeDasharray="2 2" />
    <Line x1="6" y1="23" x2="22" y2="23" stroke={color} strokeWidth="1.4" />
    <Path d="M10 8l7 15" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity={0.55} />
    <Circle cx="10" cy="8" r="1.5" fill={color} />
    <Circle cx="17" cy="23" r="1.5" fill={color} />
  </Svg>
);

export const TvBrush = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M18.5 5.5c1 1 2.5 3.5 1 5l-5.5 5.5c-2 2-5 3.5-7.5 3.5 0-2 1.5-5 3.5-7.5l5.5-5.5c1.5-1.5 4-2 5-1z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Path d="M12 13l3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvFreehandBrush = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path
      d="M5.5 18.5c2.2-4 4.2-5.4 6-4.2 1.8 1.2 1.4 4.6 4 4.9 2.4.3 4.2-2.1 6.8-7.2"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M18.6 5.6l3.8 3.8-4.2 4.2-3.8-3.8 4.2-4.2z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
    <Path d="M15 10.2l-1.6 4.4 4.4-1.6" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvRectangle = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="6" y="8" width="16" height="12" rx="1.5" stroke={color} strokeWidth="1.5" />
    <Rect x="9" y="11" width="10" height="6" rx="0.8" fill={color} opacity={0.14} />
    <Circle cx="6" cy="8" r="1.5" fill={color} />
    <Circle cx="22" cy="20" r="1.5" fill={color} />
  </Svg>
);

export const TvEllipse = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path
      d="M6 14c0-4.1 3.6-7 8-7s8 2.9 8 7-3.6 7-8 7-8-2.9-8-7z"
      stroke={color}
      strokeWidth="1.5"
      fill={color}
      fillOpacity={0.12}
    />
    <Circle cx="6" cy="14" r="1.5" fill={color} />
    <Circle cx="22" cy="14" r="1.5" fill={color} />
  </Svg>
);

export const TvPatterns = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Polyline points="7,21 11,8 14,18 18,10 21,21" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Circle cx="7" cy="21" r="1.5" fill={color} />
    <Circle cx="11" cy="8" r="1.5" fill={color} />
    <Circle cx="14" cy="18" r="1.5" fill={color} />
    <Circle cx="18" cy="10" r="1.5" fill={color} />
    <Circle cx="21" cy="21" r="1.5" fill={color} />
  </Svg>
);

export const TvPrediction = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="9" y="7" width="10" height="14" rx="1" stroke={color} strokeWidth="1.5" />
    <Line x1="9" y1="14" x2="19" y2="14" stroke={color} strokeWidth="1.5" />
    <Path d="M14 11v6" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export const TvTpSl = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M8 9h10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M8 19h10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M14 6v16" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeDasharray="2 2" opacity="0.35" />
    <Circle cx="8" cy="9" r="1.6" fill="#2962FF" />
    <Circle cx="8" cy="19" r="1.6" fill="#F23645" />
    <Path d="M20 12V6M20 6l-2.5 2.5M20 6l2.5 2.5" stroke="#2962FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M20 16v6M20 22l-2.5-2.5M20 22l2.5-2.5" stroke="#F23645" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvSmiley = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Circle cx="14" cy="14" r="8" stroke={color} strokeWidth="1.5" />
    <Path d="M10 16.5a4.5 4.5 0 008 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="10.5" cy="11.5" r="1" fill={color} />
    <Circle cx="17.5" cy="11.5" r="1" fill={color} />
  </Svg>
);

export const TvText = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M6 7h16M14 7v15M11 22h6M6 7v3M22 7v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvMeasure = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="5" y="8" width="18" height="12" rx="2" transform="rotate(-30 5 8)" stroke={color} strokeWidth="1.5" />
    <Line x1="10" y1="7" x2="11" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="14" y1="5" x2="16" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="19" y1="2" x2="20" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvMagnet = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M8 7v7c0 3.314 2.686 6 6 6s6-2.686 6-6V7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M8 7h4v5H8V7zM16 7h4v5h-4V7z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Line x1="8" y1="12" x2="12" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="16" y1="12" x2="20" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="14" cy="20" r="1.4" fill={color} />
  </Svg>
);

export const TvZoom = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.5" />
    <Line x1="17" y1="17" x2="22" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="9" y1="12" x2="15" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="12" y1="9" x2="12" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvPencil = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M19.5 5.5l3 3-13 13-4.5 1 1-4.5 13-13z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Path d="M16 9l3 3" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
  </Svg>
);

export const TvLock = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="7" y="12" width="14" height="10" rx="2" stroke={color} strokeWidth="1.5" />
    <Path d="M10 12V8c0-2.209 1.791-4 4-4s4 1.791 4 4v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="14" cy="17" r="1.5" fill={color} />
  </Svg>
);

export const TvStayInDrawingMode = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M16 5l4 4-8 8-4 1 1-4 8-8z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Path d="M14 7l4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Rect x="15" y="16" width="7" height="5" rx="1" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.2" />
    <Path d="M16.5 16v-1.5a2 2 0 014 0v1.5" stroke={color} strokeWidth="1" />
  </Svg>
);

export const TvHide = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M4 13c0 0 4-6 10-6s10 6 10 6-3 5-7.5 5.8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M4 13c0 0 2.5 4.5 7 5.7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="14" cy="13" r="3" stroke={color} strokeWidth="1.5" />
    <Path d="M22 17l-3 3-2-2 3-3 2 2zM17 22c-1 1-2 1-2 0s1-2 2-2" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
  </Svg>
);

export const TvTrash = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M5 8h18M11 5h6M8 8v14a2 2 0 002 2h8a2 2 0 002-2V8M12 12v6M16 12v6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvLayers = ({ color, size = 26 }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
    <Path d="M14 6l-8 4 8 4 8-4-8-4z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Path d="M6 14l8 4 8-4M6 19l8 4 8-4" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
  </Svg>
);

export const TvCandles = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="8" y="10" width="4" height="8" rx="0.5" stroke={color} strokeWidth="1.5" />
    <Line x1="10" y1="6" x2="10" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="10" y1="18" x2="10" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Rect x="16" y="8" width="4" height="6" rx="0.5" stroke={color} strokeWidth="1.5" />
    <Line x1="18" y1="4" x2="18" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="18" y1="14" x2="18" y2="20" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvFx = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M9 20V14M9 14h3M9 14C9 8 13 8 13 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M14 20l5-6m-5 0l5 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** MT5-style chart-window layout icon: two offset, overlapping panes. */
export const TvTileWindows = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path
      d="M6 18V7h14v3M6 18h3"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Rect x="9" y="10" width="13" height="11" rx="0.8" stroke={color} strokeWidth="1.6" />
  </Svg>
);

export const TvGrid4 = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="6" y="6" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    <Rect x="16" y="6" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    <Rect x="6" y="16" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    <Rect x="16" y="16" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export const TvUndo = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M10 10l-4 4 4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M6 14h8c4.418 0 8 3.582 8 8v1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvRedo = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M18 10l4 4-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M22 14h-8c-4.418 0-8 3.582-8 8v1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvSaveSquare = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="7" y="7" width="14" height="14" rx="2" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export const TvPitchfork = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M12 9V8c0-1.1.9-2 2-2s2 .9 2 2v1" stroke={color} strokeWidth="1.5" />
    <Path d="M7 11V6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M21 11V6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M7 11c0 3.866 3.134 7 7 7s7-3.134 7-7" stroke={color} strokeWidth="1.5" />
    <Path d="M14 18v6" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export const TvGannFan = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M7 21H23" stroke={color} strokeWidth="1.3" />
    <Path d="M7 21L23 21" stroke={color} strokeWidth="1.3" opacity={0.6} />
    <Path d="M7 21L23 5" stroke={color} strokeWidth="1.5" />
    <Path d="M7 21L23 12" stroke={color} strokeWidth="1.2" opacity={0.75} />
    <Path d="M7 21L23 16.5" stroke={color} strokeWidth="1.2" opacity={0.6} />
    <Path d="M7 21L15 5" stroke={color} strokeWidth="1.2" opacity={0.75} />
    <Path d="M7 21L11 5" stroke={color} strokeWidth="1.2" opacity={0.6} />
    <Circle cx="7" cy="21" r="2" fill={color} />
  </Svg>
);

export const TvRegressionChannel = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M6 9L22 5" stroke={color} strokeWidth="1.2" strokeDasharray="2 2" opacity={0.7} />
    <Path d="M6 15L22 11" stroke={color} strokeWidth="1.6" />
    <Path d="M6 21L22 17" stroke={color} strokeWidth="1.2" strokeDasharray="2 2" opacity={0.7} />
    <Circle cx="9" cy="18" r="1.4" fill={color} />
    <Circle cx="13" cy="12" r="1.4" fill={color} />
    <Circle cx="17" cy="15" r="1.4" fill={color} />
    <Circle cx="19" cy="9.5" r="1.4" fill={color} />
  </Svg>
);

export const TvElliottWave = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Polyline
      points="5,20 9,13 12,16 17,7 20,10 23,4"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Circle cx="9" cy="13" r="1.4" fill={color} />
    <Circle cx="12" cy="16" r="1.4" fill={color} />
    <Circle cx="17" cy="7" r="1.4" fill={color} />
    <Circle cx="20" cy="10" r="1.4" fill={color} />
    <Circle cx="23" cy="4" r="1.4" fill={color} />
  </Svg>
);

export const TvXabcd = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Polyline
      points="5,7 12,21 17,9 21,19 24,6"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path d="M5 7L17 9" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity={0.6} />
    <Path d="M17 9L24 6" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity={0.6} />
    <Circle cx="5" cy="7" r="1.4" fill={color} />
    <Circle cx="12" cy="21" r="1.4" fill={color} />
    <Circle cx="17" cy="9" r="1.4" fill={color} />
    <Circle cx="21" cy="19" r="1.4" fill={color} />
    <Circle cx="24" cy="6" r="1.4" fill={color} />
  </Svg>
);

export const TvRadialObjects = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Path
      d="M10 3.6L4.1 6.8L10 10L15.9 6.8L10 3.6Z"
      stroke={color}
      strokeWidth="1.35"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M4.6 10.2L10 13.2L15.4 10.2"
      stroke={color}
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M4.6 13.5L10 16.4L15.4 13.5"
      stroke={color}
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

export const TvRadialShapes = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Path
      d="M6 3.5 H2.5 V16.5 H6"
      stroke={color}
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Circle
      cx="13"
      cy="7"
      r="3"
      stroke={color}
      strokeWidth="1.35"
      fill="none"
    />
    <Path
      d="M13 10 L8 17 L18 17 Z"
      stroke={color}
      strokeWidth="1.35"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

export const TvRadialPencil = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Path
      d="M5 13.9L4.2 16L6.3 15.2L14.8 6.7L13.5 5.4L5 13.9Z"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M12.7 4.8L14 3.5C14.5 3 15.2 3 15.7 3.5L16.7 4.5C17.2 5 17.2 5.7 16.7 6.2L15.4 7.5"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M11.9 6.9L15.2 10.2"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const TvRadialSettings = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Line x1="3.5" y1="5.5" x2="16.5" y2="5.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="3.5" y1="10" x2="16.5" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="3.5" y1="14.5" x2="16.5" y2="14.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Circle cx="7.5" cy="5.5" r="1.6" fill="#FFFFFF" stroke={color} strokeWidth="1.3" />
    <Circle cx="12.5" cy="10" r="1.6" fill="#FFFFFF" stroke={color} strokeWidth="1.3" />
    <Circle cx="8.5" cy="14.5" r="1.6" fill="#FFFFFF" stroke={color} strokeWidth="1.3" />
  </Svg>
);

export const TvRadialPlus = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Line x1="10" y1="3.6" x2="10" y2="7.4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="10" y1="12.6" x2="10" y2="16.4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="3.6" y1="10" x2="7.4" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="12.6" y1="10" x2="16.4" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="10" y1="7.9" x2="10" y2="12.1" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="7.9" y1="10" x2="12.1" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
  </Svg>
);

export const TvRadialOneClick = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Path
      d="M10.9 2.8L5.8 10.1H9.2L8.2 17.2L14.4 9.1H10.8L10.9 2.8Z"
      stroke={color}
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

export const TvRadialIndicators = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Path d="M2.5 12.1H4.9L6.9 8.1L8.9 13.2L11.1 9.6L13.2 10.2L17.5 6.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
