/**
 * High-contrast semantic colors reserved for the live open-position P/L value.
 *
 * These intentionally do not reuse the TP/SL line colors: those colors also
 * appear in projected stop labels, while this palette must stay prominent as
 * the value updates over same-hue candle bodies.
 */
import { GDark, GLight } from '../../../ui/theme/glass';

export const LIVE_CHART_PNL_COLORS = {
  darkCanvas: {
    profit: GDark.trading.profit,
    loss: '#FF4D4F',
  },
  lightCanvas: {
    profit: GLight.trading.profit,
    loss: '#C62828',
  },
} as const;

type RgbColor = readonly [red: number, green: number, blue: number];

const parseHexColor = (color: string): RgbColor | null => {
  const match = color.trim().match(/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (!match) return null;

  const value = match[1].length === 4
    ? match[1].slice(0, 3)
    : match[1].slice(0, 6);
  if (value.length === 3) {
    return [
      Number.parseInt(`${value[0]}${value[0]}`, 16),
      Number.parseInt(`${value[1]}${value[1]}`, 16),
      Number.parseInt(`${value[2]}${value[2]}`, 16),
    ];
  }

  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

const parseRgbColor = (color: string): RgbColor | null => {
  const match = color.trim().match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(?:\d+(?:\.\d+)?|\.\d+)\s*)?\)$/i,
  );
  if (!match) return null;

  const channels = match.slice(1, 4).map(Number);
  if (channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) {
    return null;
  }
  return [channels[0], channels[1], channels[2]];
};

const parseCssColor = (color: string): RgbColor | null => {
  const normalized = color.trim().toLowerCase();
  if (normalized === 'black') return [0, 0, 0];
  if (normalized === 'white') return [255, 255, 255];
  return parseHexColor(normalized) ?? parseRgbColor(normalized);
};

const toLinearChannel = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const getRelativeLuminance = (color: RgbColor): number => (
  0.2126 * toLinearChannel(color[0])
  + 0.7152 * toLinearChannel(color[1])
  + 0.0722 * toLinearChannel(color[2])
);

const getContrastRatio = (left: RgbColor, right: RgbColor): number => {
  const brighter = Math.max(getRelativeLuminance(left), getRelativeLuminance(right));
  const darker = Math.min(getRelativeLuminance(left), getRelativeLuminance(right));
  return (brighter + 0.05) / (darker + 0.05);
};

const pickCanvasContrastColor = (
  background: string,
  darkCanvasColor: string,
  lightCanvasColor: string,
): string => {
  const parsedBackground = parseCssColor(background);
  const parsedDarkCanvasColor = parseCssColor(darkCanvasColor);
  const parsedLightCanvasColor = parseCssColor(lightCanvasColor);
  if (!parsedBackground || !parsedDarkCanvasColor || !parsedLightCanvasColor) {
    return darkCanvasColor;
  }

  return getContrastRatio(parsedBackground, parsedDarkCanvasColor)
    >= getContrastRatio(parsedBackground, parsedLightCanvasColor)
    ? darkCanvasColor
    : lightCanvasColor;
};

export const resolveLiveChartPnlColor = (
  pnl: number,
  chartBackground: string,
  neutralColor: string,
): string => {
  if (pnl === 0 || !Number.isFinite(pnl)) return neutralColor;

  const semanticColors = pnl > 0
    ? {
        darkCanvas: LIVE_CHART_PNL_COLORS.darkCanvas.profit,
        lightCanvas: LIVE_CHART_PNL_COLORS.lightCanvas.profit,
      }
    : {
        darkCanvas: LIVE_CHART_PNL_COLORS.darkCanvas.loss,
        lightCanvas: LIVE_CHART_PNL_COLORS.lightCanvas.loss,
      };

  return pickCanvasContrastColor(
    chartBackground,
    semanticColors.darkCanvas,
    semanticColors.lightCanvas,
  );
};
