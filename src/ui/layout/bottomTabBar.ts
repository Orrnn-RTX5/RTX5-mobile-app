export const MT5_BOTTOM_TAB_BAR_BASE_HEIGHT = 84;
export const MT5_BOTTOM_TAB_BAR_LANDSCAPE_BASE_HEIGHT = 64;
export const BOTTOM_TAB_BAR_EXTRA_HEIGHT = 2;

type BottomTabBarHeightInput = {
  safeAreaBottom: number;
  isChartTab?: boolean;
  isLandscape?: boolean;
  viewportHeight?: number;
  fontScale?: number;
};

const BOTTOM_TAB_LABEL_LINE_HEIGHT = 16;
export const BOTTOM_TAB_LABEL_MAX_FONT_MULTIPLIER = 1.6;

const isCompactViewport = (isLandscape: boolean, viewportHeight?: number) =>
  isLandscape || (viewportHeight !== undefined && viewportHeight < 600);

export function resolveBottomTabBarHeight({
  safeAreaBottom,
  isChartTab = false,
  isLandscape = false,
  viewportHeight,
  fontScale = 1,
}: BottomTabBarHeightInput) {
  void isChartTab;
  const compact = isCompactViewport(isLandscape, viewportHeight);
  const baseHeight = compact
    ? MT5_BOTTOM_TAB_BAR_LANDSCAPE_BASE_HEIGHT
    : MT5_BOTTOM_TAB_BAR_BASE_HEIGHT;
  // Keep the icon, scaled label, and a 44px touch target inside the bar even
  // on a short window. Insets belong to the bar, never to a scaled phone frame.
  const labelScale = Math.max(1, Math.min(fontScale, BOTTOM_TAB_LABEL_MAX_FONT_MULTIPLIER));
  const contentHeight = 28 + BOTTOM_TAB_LABEL_LINE_HEIGHT * labelScale + 4 + (compact ? 8 : 16);

  return Math.ceil(Math.max(baseHeight, contentHeight, 44))
    + Math.max(safeAreaBottom, 0)
    + BOTTOM_TAB_BAR_EXTRA_HEIGHT;
}

export function resolveBottomTabBarLayout({
  availableWidth,
  viewportHeight,
  safeAreaBottom,
  isLandscape,
  fontScale = 1,
}: BottomTabBarHeightInput & { availableWidth: number; isLandscape: boolean }) {
  const compact = isCompactViewport(isLandscape, viewportHeight);
  const labelScale = Math.max(1, Math.min(fontScale, BOTTOM_TAB_LABEL_MAX_FONT_MULTIPLIER));

  return {
    height: resolveBottomTabBarHeight({ safeAreaBottom, isLandscape, viewportHeight, fontScale }),
    paddingTop: compact ? 4 : 8,
    paddingBottom: Math.max(safeAreaBottom, compact ? 4 : 8),
    // Five equal tab items need room for both the icon and a readable label.
    // Rotation alone is insufficient on small phones or with larger text.
    useInlineLabels: isLandscape && availableWidth / 5 >= 112 * labelScale,
  };
}
