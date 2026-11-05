type InitialHeightInput = {
  instantOpen: boolean;
  screenHeight: number;
  windowHeight: number;
};

type LayoutHeightInput = {
  previousHeight: number;
  layoutHeight: number;
  instantOpen: boolean;
  hasMeasuredLayout: boolean;
};

type OpenHeightInput = InitialHeightInput & {
  previousHeight: number;
};

type FloorInput = {
  detent: 'auto' | 'adaptive' | 'large';
  searchable?: boolean;
  availableWindowHeight: number;
};

type Mt5EntryTranslateInput = {
  estimatedTranslateY: number;
  measuredSheetBodyHeight: number;
};

type VisibilityBarrierInput = {
  visible: boolean;
  hiddenImperatively: boolean;
  configSwapParked: boolean;
  startingClose: boolean;
  retainedCommitOwnsHost: boolean;
};

const MIN_FALLBACK_HEIGHT = 260;
const MIN_BOTTOM_INSET = 12;
const ANDROID_STABLE_BOTTOM_INSET = 24;
const LARGE_DETENT_MIN_HEIGHT = 360;
const LARGE_DETENT_HEIGHT_RATIO = 0.88;
const SEARCHABLE_ADAPTIVE_MIN_HEIGHT = 320;
const SEARCHABLE_ADAPTIVE_HEIGHT_RATIO = 0.54;
const ADAPTIVE_MIN_HEIGHT = 420;
const ADAPTIVE_HEIGHT_RATIO = 0.46;

const normalizeHeight = (height: number) =>
  Number.isFinite(height) && height > 0 ? height : 0;

export function resolveActionSheetVisibilityBarrierOpen({
  visible,
  hiddenImperatively,
  configSwapParked,
  startingClose,
  retainedCommitOwnsHost,
}: VisibilityBarrierInput): boolean {
  // An imperative hide/config park is the last native-pixel authority. React
  // must never reopen that barrier from a stale close or retained snapshot on
  // the following render; valid retained adoption clears these refs first.
  if (hiddenImperatively || configSwapParked) {
    return false;
  }

  return visible || startingClose || retainedCommitOwnsHost;
}

export function resolveActionSheetMt5EntryTranslateY({
  estimatedTranslateY,
  measuredSheetBodyHeight,
}: Mt5EntryTranslateInput): number {
  const resolvedTranslateY = normalizeHeight(estimatedTranslateY);
  if (resolvedTranslateY > 0) {
    return resolvedTranslateY;
  }

  return Math.max(1, normalizeHeight(measuredSheetBodyHeight) + 1);
}

export function resolveActionSheetBottomInset(
  safeAreaBottom: number,
  platform: 'android' | 'ios' | string,
): number {
  const normalizedSafeAreaBottom = normalizeHeight(safeAreaBottom);

  if (platform === 'android') {
    return normalizedSafeAreaBottom > 0
      ? ANDROID_STABLE_BOTTOM_INSET
      : MIN_BOTTOM_INSET;
  }

  return Math.max(normalizedSafeAreaBottom, MIN_BOTTOM_INSET);
}

export function resolveActionSheetFloor({
  detent,
  searchable,
  availableWindowHeight,
}: FloorInput): number {
  const normalizedAvailableWindowHeight = Math.max(
    MIN_FALLBACK_HEIGHT,
    normalizeHeight(availableWindowHeight),
  );

  if (detent === 'large') {
    return Math.round(Math.max(
      LARGE_DETENT_MIN_HEIGHT,
      normalizedAvailableWindowHeight * LARGE_DETENT_HEIGHT_RATIO,
    ));
  }

  if (detent === 'adaptive') {
    if (searchable) {
      return Math.round(Math.max(
        SEARCHABLE_ADAPTIVE_MIN_HEIGHT,
        normalizedAvailableWindowHeight * SEARCHABLE_ADAPTIVE_HEIGHT_RATIO,
      ));
    }

    return Math.round(Math.max(
      ADAPTIVE_MIN_HEIGHT,
      normalizedAvailableWindowHeight * ADAPTIVE_HEIGHT_RATIO,
    ));
  }

  return 0;
}

export function resolveActionSheetInitialMeasuredHeight({
  screenHeight,
  windowHeight,
}: InitialHeightInput): number {
  const normalizedScreenHeight = normalizeHeight(screenHeight);
  const normalizedWindowHeight = normalizeHeight(windowHeight);

  return normalizedWindowHeight || normalizedScreenHeight || MIN_FALLBACK_HEIGHT;
}

export function resolveActionSheetOpenMeasuredHeight({
  previousHeight,
  instantOpen,
  screenHeight,
  windowHeight,
}: OpenHeightInput): number {
  const initialHeight = resolveActionSheetInitialMeasuredHeight({
    instantOpen,
    screenHeight,
    windowHeight,
  });

  if (!instantOpen) {
    return initialHeight;
  }

  const normalizedPreviousHeight = normalizeHeight(previousHeight);
  const normalizedScreenHeight = normalizeHeight(screenHeight);
  const normalizedWindowHeight = normalizeHeight(windowHeight);
  const deviceHeightCap = Math.max(
    normalizedScreenHeight,
    normalizedWindowHeight,
    MIN_FALLBACK_HEIGHT,
  );

  return Math.min(
    Math.max(normalizedPreviousHeight, initialHeight),
    deviceHeightCap,
  );
}

export function resolveActionSheetMeasuredHeight({
  previousHeight,
  layoutHeight,
  instantOpen,
  hasMeasuredLayout,
}: LayoutHeightInput): number {
  const normalizedLayoutHeight = normalizeHeight(layoutHeight);

  if (normalizedLayoutHeight === 0) {
    return previousHeight;
  }

  // Android reports a physical screen height before the transparent Modal's
  // real layout height is available. Replacing that first value with the
  // shorter Modal height makes sheets visibly drop after they appear, so every
  // layout pass only ratchets upward.
  return Math.max(previousHeight, normalizedLayoutHeight);
}
