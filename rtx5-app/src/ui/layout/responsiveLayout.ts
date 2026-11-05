export type ViewportSize = Readonly<{ width: number; height: number; fontScale?: number }>;
export type LayoutInsets = Readonly<{ top: number; right: number; bottom: number; left: number }>;

const finitePositive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;
const safeInset = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

/** Breakpoints use the usable app window, including split-screen and rotation. */
export function resolveResponsiveLayout(viewport: ViewportSize, insets: LayoutInsets) {
  const width = finitePositive(viewport.width, 1);
  const height = finitePositive(viewport.height, 1);
  const fontScale = finitePositive(viewport.fontScale ?? 1, 1);
  const availableWidth = Math.max(1, width - safeInset(insets.left) - safeInset(insets.right));
  const availableHeight = Math.max(1, height - safeInset(insets.top) - safeInset(insets.bottom));
  // Larger text needs the same single-column layout as a narrower window.
  const readableWidth = availableWidth / Math.max(1, fontScale);
  const isCompact = readableWidth < 360;
  const isWide = readableWidth >= 768;
  const horizontalPadding = isCompact ? 12 : isWide ? 24 : 16;

  return {
    width, height, fontScale, availableWidth, availableHeight,
    isCompact, isWide,
    isShort: availableHeight < 500,
    isLandscape: width > height,
    horizontalPadding,
    contentMaxWidth: Math.min(availableWidth, isWide ? 960 : 600),
  };
}
