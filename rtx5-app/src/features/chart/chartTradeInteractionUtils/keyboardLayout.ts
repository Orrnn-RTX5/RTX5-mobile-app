/**
 * Keyboard layout helpers shared across the chart trade UI. They translate raw
 * keyboard geometry (height, screen-Y, host bottom) into normalised offsets
 * and decide whether the host should resize on Android.
 */

const KEYBOARD_HOST_RESIZE_MIN_DELTA = 64;
const KEYBOARD_HOST_RESIZE_RATIO = 0.25;

type KeyboardDockOffsetInput = {
  platform: string;
  keyboardHeight: number;
  keyboardScreenY?: number | null;
  containerBottom?: number | null;
  screenHeight: number;
  safeAreaBottom: number;
};

type KeyboardHostResizeInput = {
  platform: string;
  footerLotEditorFocused: boolean;
  showChartTradeSheet: boolean;
  keyboardVisibleHeight: number;
  keyboardFreeHostHeight: number;
  currentHostHeight: number;
};

export function resolveKeyboardDockOffset({
  platform,
  keyboardHeight,
  keyboardScreenY,
  containerBottom,
  screenHeight,
  safeAreaBottom,
}: KeyboardDockOffsetInput) {
  const normalizedKeyboardHeight =
    Number.isFinite(keyboardHeight) && keyboardHeight > 0
      ? keyboardHeight
      : 0;
  const normalizedScreenHeight =
    Number.isFinite(screenHeight) && screenHeight > 0
      ? screenHeight
      : 0;
  const normalizedSafeAreaBottom =
    Number.isFinite(safeAreaBottom) && safeAreaBottom > 0
      ? safeAreaBottom
      : 0;

  if (normalizedKeyboardHeight <= 0) {
    return 0;
  }

  if (Number.isFinite(keyboardScreenY)) {
    const effectiveWindowBottom = Math.min(
      Number.isFinite(containerBottom) ? (containerBottom as number) : Number.POSITIVE_INFINITY,
      normalizedScreenHeight > 0 ? normalizedScreenHeight : Number.POSITIVE_INFINITY,
    );

    if (Number.isFinite(effectiveWindowBottom)) {
      return Math.max(0, effectiveWindowBottom - (keyboardScreenY as number));
    }
  }

  return Math.max(
    0,
    normalizedKeyboardHeight - (platform === 'android' ? normalizedSafeAreaBottom : 0),
  );
}

export function resolveKeyboardResizesHost({
  platform,
  footerLotEditorFocused,
  showChartTradeSheet,
  keyboardVisibleHeight,
  keyboardFreeHostHeight,
  currentHostHeight,
}: KeyboardHostResizeInput) {
  const normalizedKeyboardHeight =
    Number.isFinite(keyboardVisibleHeight) && keyboardVisibleHeight > 0
      ? keyboardVisibleHeight
      : 0;
  const normalizedKeyboardFreeHostHeight =
    Number.isFinite(keyboardFreeHostHeight) && keyboardFreeHostHeight > 0
      ? keyboardFreeHostHeight
      : 0;
  const normalizedCurrentHostHeight =
    Number.isFinite(currentHostHeight) && currentHostHeight > 0
      ? currentHostHeight
      : 0;

  if (
    platform !== 'android' ||
    !footerLotEditorFocused ||
    showChartTradeSheet ||
    normalizedKeyboardHeight <= 0 ||
    normalizedKeyboardFreeHostHeight <= 0 ||
    normalizedCurrentHostHeight <= 0
  ) {
    return false;
  }

  const hostShrink = normalizedKeyboardFreeHostHeight - normalizedCurrentHostHeight;
  const resizeThreshold = Math.min(
    normalizedKeyboardHeight,
    Math.max(KEYBOARD_HOST_RESIZE_MIN_DELTA, normalizedKeyboardHeight * KEYBOARD_HOST_RESIZE_RATIO),
  );

  return hostShrink >= resizeThreshold;
}
