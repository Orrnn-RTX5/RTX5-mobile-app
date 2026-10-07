/**
 * Global Reusable ActionSheet component.
 *
 * Provides a native-feeling bottom sheet overlay for contextual actions.
 * Highly configurable and typically controlled via the global `useUIState`
 * store rather than local component state.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  type GestureResponderEvent,
  type TextStyle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  cancelAnimation as cancelReanimatedAnimation,
  Easing as ReanimatedEasing,
  executeOnUIRuntimeSync,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/useTheme';
import { useThemeMode } from '../../../state/themeMode';
import { FastPressable } from '../FastPressable';
import { scheduleAfterVisualFrame } from '../../../utils/afterVisualFrame';
import { registerInteractionLifecycleHandler } from '../../../utils/interactionLifecycle';
import { useTranslation } from '../../../i18n/useTranslation';
import {
  scheduleActionSheetVisualHandoffCloseCommit,
  scheduleDismissSettledAction,
} from './dismissTimer';
import {
  resolveActionSheetBottomInset,
  resolveActionSheetFloor,
  resolveActionSheetInitialMeasuredHeight,
  resolveActionSheetMeasuredHeight,
  resolveActionSheetMt5EntryTranslateY,
  resolveActionSheetOpenMeasuredHeight,
  resolveActionSheetVisibilityBarrierOpen,
} from './layout';
import { ACTION_SHEET_SUBTITLE_ROW_MIN_HEIGHT, makeActionSheetStyles } from './styles';
import { filterActionSheetActions } from './search';
import {
  acknowledgeRetainedActionSheetVisible,
  cancelRetainedActionSheetPreview,
  getRetainedActionSheetVisualSnapshot,
  registerRetainedActionSheetHostParker,
  registerRetainedActionSheetVisualApplier,
  syncRetainedActionSheetVisual,
  type RetainedActionSheetVisualSnapshot,
} from './retainedActionSheetVisualController';

type ActionSheetAction = {
  label: string;
  subtitle?: string;
  selected?: boolean;
  muted?: boolean;
  danger?: boolean;
  textColor?: string;
  textFontWeight?: TextStyle['fontWeight'];
  disabled?: boolean;
  activateOnPressIn?: boolean;
  deferCloseCommitForVisualHandoff?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
};

type ActionSheetEntryMotion = 'instant' | 'mt5Slide' | 'standard';
// `fast` is reserved for a dedicated, already-preloaded host; shared sheets
// keep the default MT5 timing so this option cannot alter them accidentally.
type ActionSheetMt5SlideMotionProfile = 'default' | 'fast';

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  titleAlign?: 'left' | 'center';
  compactText?: boolean;
  presentation?: 'default' | 'mt5Plain' | 'mt5TimeframeGrid';
  showActionIcons?: boolean;
  deferOffscreenActions?: boolean;
  maximumVisibleActionRows?: number;
  actions: ActionSheetAction[];
  onClose: () => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  detent?: 'auto' | 'adaptive' | 'large';
  minimumTopInset?: number;
  instantOpen?: boolean;
  entryMotion?: ActionSheetEntryMotion;
  /** Selects MT5 slide timing only; it does not change layout or sheet content. */
  mt5SlideMotionProfile?: ActionSheetMt5SlideMotionProfile;
  immediateHostHideOnClose?: boolean;
  visualKey?: string;
  runActionAfterClose?: boolean;
  androidKeyboardAvoidance?: 'event' | 'resize';
  keepFullHeightOnKeyboard?: boolean;
};

type CachedActionSheetConfig = Pick<
  ActionSheetProps,
  'title' | 'titleAlign' | 'compactText' | 'presentation' | 'showActionIcons' | 'deferOffscreenActions' | 'maximumVisibleActionRows' | 'actions' | 'searchable' | 'searchPlaceholder' | 'detent' | 'minimumTopInset' | 'instantOpen' | 'entryMotion' | 'mt5SlideMotionProfile' | 'immediateHostHideOnClose' | 'visualKey' | 'runActionAfterClose' | 'androidKeyboardAvoidance' | 'keepFullHeightOnKeyboard'
>;

const ACTION_SHEET_ROW_MIN_HEIGHT = 48;
const ACTION_SHEET_MT5_PLAIN_ROW_MIN_HEIGHT = 47;
const ACTION_SHEET_MT5_PLAIN_ACTIONS_BOTTOM_PADDING = 8;
const ACTION_SHEET_TIMEFRAME_GRID_COLUMNS = 4;
const ACTION_SHEET_TIMEFRAME_GRID_ROW_HEIGHT = 40;
const ACTION_SHEET_TIMEFRAME_GRID_ROW_GAP = 8;
const ACTION_SHEET_TIMEFRAME_GRID_VERTICAL_PADDING = 16;
const ACTION_SHEET_BACKDROP_OPEN_GUARD_MS = 60;
const ACTION_SHEET_OPEN_TRANSLATE_Y = 12;
const ACTION_SHEET_INSTANT_OPEN_OPACITY = 1;
const ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y = 0;
const ACTION_SHEET_OPEN_OVERLAY_DURATION_MS = 50;
const ACTION_SHEET_OPEN_SHEET_DURATION_MS = 50;
const ACTION_SHEET_MT5_OPEN_OVERLAY_DURATION_MS = 180;
const ACTION_SHEET_MT5_OPEN_SHEET_DURATION_MS = 210;
// The chart symbol picker has its own retained host, so it can use a shorter
// measured reveal without speeding up every shared ActionSheet destination.
const ACTION_SHEET_MT5_FAST_OPEN_OVERLAY_DURATION_MS = 100;
const ACTION_SHEET_MT5_FAST_OPEN_SHEET_DURATION_MS = 140;
const ACTION_SHEET_MT5_OPEN_PRIME_DELAY_MS = 18;
const ACTION_SHEET_CLOSE_OVERLAY_DURATION_MS = 50;
const ACTION_SHEET_CLOSE_SHEET_DURATION_MS = 50;
const ACTION_SHEET_INLINE_ACTION_LIMIT = 12;
const ACTION_SHEET_KEEP_HOST_MOUNTED = true;
const ACTION_SHEET_ROW_PRESS_CANCEL_MOVE_PX = 10;

const writeMt5ActionSheetValuesOnUI = (
  hostValue: SharedValue<number>,
  overlayValue: SharedValue<number>,
  sheetValue: SharedValue<number>,
  opacity: number,
  translateY: number,
) => {
  executeOnUIRuntimeSync((
    nextHostValue: SharedValue<number>,
    nextOverlayValue: SharedValue<number>,
    nextSheetValue: SharedValue<number>,
    nextOpacity: number,
    nextTranslateY: number,
  ) => {
    'worklet';
    cancelReanimatedAnimation(nextHostValue);
    cancelReanimatedAnimation(nextOverlayValue);
    cancelReanimatedAnimation(nextSheetValue);
    nextHostValue.value = 0;
    nextOverlayValue.value = nextOpacity;
    nextSheetValue.value = nextTranslateY;
  })(hostValue, overlayValue, sheetValue, opacity, translateY);
};

const startActionSheetEntryAnimation = ({
  mode,
  mt5SlideMotionProfile = 'default',
  overlayOpacity,
  sheetTranslateY,
  mt5TranslateY,
  mt5HostOpacity,
  mt5OverlayOpacity,
  mt5SheetTranslateY,
}: {
  mode: ActionSheetEntryMotion;
  mt5SlideMotionProfile?: ActionSheetMt5SlideMotionProfile;
  overlayOpacity: Animated.Value;
  sheetTranslateY: Animated.Value;
  mt5TranslateY: number;
  mt5HostOpacity?: SharedValue<number>;
  mt5OverlayOpacity?: SharedValue<number>;
  mt5SheetTranslateY?: SharedValue<number>;
}) => {
  overlayOpacity.stopAnimation();
  sheetTranslateY.stopAnimation();

  if (mode === 'instant') {
    overlayOpacity.setValue(ACTION_SHEET_INSTANT_OPEN_OPACITY);
    sheetTranslateY.setValue(ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y);
    return;
  }

  const isMt5Slide = mode === 'mt5Slide';
  // Resolve one duration pair here so both UI-thread Reanimated and the
  // Animated fallback follow exactly the same selected motion profile.
  const useFastMt5Slide = isMt5Slide && mt5SlideMotionProfile === 'fast';
  const mt5OverlayDurationMs = useFastMt5Slide
    ? ACTION_SHEET_MT5_FAST_OPEN_OVERLAY_DURATION_MS
    : ACTION_SHEET_MT5_OPEN_OVERLAY_DURATION_MS;
  const mt5SheetDurationMs = useFastMt5Slide
    ? ACTION_SHEET_MT5_FAST_OPEN_SHEET_DURATION_MS
    : ACTION_SHEET_MT5_OPEN_SHEET_DURATION_MS;
  if (isMt5Slide && mt5HostOpacity && mt5OverlayOpacity && mt5SheetTranslateY) {
    executeOnUIRuntimeSync((
      hostValue: SharedValue<number>,
      overlayValue: SharedValue<number>,
      sheetValue: SharedValue<number>,
      entryTranslateY: number,
      primeDelayMs: number,
      overlayDurationMs: number,
      sheetDurationMs: number,
    ) => {
      'worklet';
      cancelReanimatedAnimation(hostValue);
      cancelReanimatedAnimation(overlayValue);
      cancelReanimatedAnimation(sheetValue);
      hostValue.value = 0;
      overlayValue.value = 0;
      sheetValue.value = entryTranslateY;
      // Reveal only after the parked entry pose is installed in this same UI
      // worklet. React can restore the parent host on any frame without ever
      // exposing the previous open's final sheet position.
      // Keep one native frame fully parked after React swaps the retained rows.
      // Without this compositor barrier Android can paint the new subtree once
      // at the previous sheet's completed translate before animated props flush.
      hostValue.value = withDelay(
        primeDelayMs,
        withTiming(1, { duration: 0 }),
      );
      overlayValue.value = withDelay(
        primeDelayMs,
        withTiming(1, {
          duration: overlayDurationMs,
          easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
        }),
      );
      sheetValue.value = withDelay(
        primeDelayMs,
        withTiming(0, {
          duration: sheetDurationMs,
          easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
        }),
      );
    })(
      mt5HostOpacity,
      mt5OverlayOpacity,
      mt5SheetTranslateY,
      mt5TranslateY,
      ACTION_SHEET_MT5_OPEN_PRIME_DELAY_MS,
      mt5OverlayDurationMs,
      mt5SheetDurationMs,
    );
    return;
  }

  overlayOpacity.setValue(0);
  sheetTranslateY.setValue(isMt5Slide ? mt5TranslateY : ACTION_SHEET_OPEN_TRANSLATE_Y);
  Animated.parallel([
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: isMt5Slide
        ? mt5OverlayDurationMs
        : ACTION_SHEET_OPEN_OVERLAY_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    Animated.timing(sheetTranslateY, {
      toValue: 0,
      duration: isMt5Slide
        ? mt5SheetDurationMs
        : ACTION_SHEET_OPEN_SHEET_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
  ]).start();
};

const startActionSheetExitAnimation = ({
  instantOpen,
  overlayOpacity,
  sheetTranslateY,
  onComplete,
}: {
  instantOpen: boolean;
  overlayOpacity: Animated.Value;
  sheetTranslateY: Animated.Value;
  onComplete?: (result: { finished: boolean }) => void;
}) => {
  const closeSheetTranslateY = instantOpen ? 80 : ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y;

  overlayOpacity.stopAnimation();
  sheetTranslateY.stopAnimation();
  Animated.parallel([
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: instantOpen ? 60 : ACTION_SHEET_CLOSE_OVERLAY_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    Animated.timing(sheetTranslateY, {
      toValue: closeSheetTranslateY,
      duration: instantOpen ? 80 : ACTION_SHEET_CLOSE_SHEET_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
  ]).start((result) => {
    if (result.finished) {
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(closeSheetTranslateY);
    }
    onComplete?.(result);
  });
};

type ActionSheetPressPoint = {
  x: number;
  y: number;
};

type ActionSheetPressGesture = {
  start: ActionSheetPressPoint | null;
  cancelled: boolean;
};

const getActionSheetPressPoint = (event: GestureResponderEvent): ActionSheetPressPoint => ({
  x: event.nativeEvent.pageX,
  y: event.nativeEvent.pageY,
});

const hasActionSheetPressMovedBeyondThreshold = (
  start: ActionSheetPressPoint,
  end: ActionSheetPressPoint,
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return (dx * dx + dy * dy) > ACTION_SHEET_ROW_PRESS_CANCEL_MOVE_PX * ACTION_SHEET_ROW_PRESS_CANCEL_MOVE_PX;
};

// Comfortable tap-to-dismiss zone above the sheet, beyond the safe-area inset.
// Without this, a tall sheet can extend to within a few pixels of the status
// bar — and on phones with edge gestures (Android nav-gesture, iOS notch
// pull-down), tapping that thin strip triggers the OS gesture instead of
// dismissing the sheet. 80dp guarantees the user has a usable strip of
// overlay above the sheet that's well clear of the system gesture region.
const TAPPABLE_TOP_DISMISS_MARGIN = 80;

const actionSheetHostStyles = StyleSheet.create({
  visibilityBarrier: {
    ...StyleSheet.absoluteFillObject,
    elevation: 9999,
    zIndex: 9999,
  },
});

export function ActionSheet({
  visible,
  title,
  titleAlign,
  compactText = false,
  presentation = 'default',
  showActionIcons = false,
  deferOffscreenActions = false,
  maximumVisibleActionRows,
  actions,
  onClose,
  searchable = false,
  searchPlaceholder,
  detent = 'auto',
  minimumTopInset = 100,
  instantOpen = false,
  entryMotion,
  mt5SlideMotionProfile = 'default',
  immediateHostHideOnClose = false,
  visualKey,
  runActionAfterClose = true,
  androidKeyboardAvoidance = 'event',
  keepFullHeightOnKeyboard = false,
}: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  const T = useTheme();
  const themeMode = useThemeMode();
  const isDark = themeMode === 'dark';
  const styles = useMemo(() => makeActionSheetStyles(T, isDark), [T, isDark]);
  const { t } = useTranslation();
  const screenHeight = Dimensions.get('screen').height;
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  const initialMeasuredHeight = resolveActionSheetInitialMeasuredHeight({
    instantOpen,
    screenHeight,
    windowHeight,
  });
  const [mounted, setMounted] = useState(ACTION_SHEET_KEEP_HOST_MOUNTED || visible);
  const [query, setQuery] = useState('');
  const [currentOverlayHeight, setCurrentOverlayHeight] = useState(initialMeasuredHeight);
  const [currentSheetHostHeight, setCurrentSheetHostHeight] = useState(initialMeasuredHeight);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [, refreshMt5ConfigSwapGuard] = useState(0);
  // Measured height from the host layout. Start from the visible window height
  // so the first frame already has the final sheet geometry.
  const [measuredHeight, setMeasuredHeight] = useState(initialMeasuredHeight);
  const initialEntryMotion: ActionSheetEntryMotion = entryMotion ?? (
    instantOpen ? 'instant' : 'standard'
  );
  const overlayOpacity = useRef(new Animated.Value(
    visible && initialEntryMotion === 'instant' ? 1 : 0,
  )).current;
  const sheetTranslateY = useRef(new Animated.Value(
    visible && initialEntryMotion === 'instant' ? 0 : 28,
  )).current;
  // The MT5 host always mounts visually parked. Its first visible frame is
  // released by the UI worklet only after the real capped entry pose is set.
  const mt5OverlayOpacity = useSharedValue(0);
  const mt5HostOpacity = useSharedValue(0);
  const mt5SheetTranslateY = useSharedValue(28);
  const mt5BackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: mt5HostOpacity.value * mt5OverlayOpacity.value,
  }));
  const mt5SheetBodyAnimatedStyle = useAnimatedStyle(() => ({
    opacity: mt5HostOpacity.value,
    transform: [{ translateY: mt5SheetTranslateY.value }],
  }));
  const openedAtRef = useRef(visible ? Date.now() : 0);
  const cachedConfigRef = useRef<CachedActionSheetConfig>({
    title,
    titleAlign,
    compactText,
    presentation,
    showActionIcons,
    deferOffscreenActions,
    maximumVisibleActionRows,
    actions,
    searchable,
    searchPlaceholder,
    detent,
    minimumTopInset,
    instantOpen,
    entryMotion,
    mt5SlideMotionProfile,
    immediateHostHideOnClose,
    visualKey,
    runActionAfterClose,
    androidKeyboardAvoidance,
    keepFullHeightOnKeyboard,
  });
  const incomingConfig: CachedActionSheetConfig = {
    title,
    titleAlign,
    compactText,
    presentation,
    showActionIcons,
    deferOffscreenActions,
    maximumVisibleActionRows,
    actions,
    searchable,
    searchPlaceholder,
    detent,
    minimumTopInset,
    instantOpen,
    entryMotion,
    mt5SlideMotionProfile,
    immediateHostHideOnClose,
    visualKey,
    runActionAfterClose,
    androidKeyboardAvoidance,
    keepFullHeightOnKeyboard,
  };
  const hasIncomingConfig =
    actions.length > 0 ||
    Boolean(title) ||
    Boolean(searchable) ||
    Boolean(searchPlaceholder) ||
    minimumTopInset !== undefined;
  const prevVisibleRef = useRef(visible);
  const closeAnimationRunningRef = useRef(false);
  const [, refreshHiddenConfig] = useState(0);
  const visibilityChanged = visible !== prevVisibleRef.current;
  const isStartingClose = visibilityChanged && !visible;

  // Keep the outgoing rows mounted until their close animation is fully
  // transparent. A newly preloaded symbol must never flash inside the previous
  // sheet while that sheet is still moving off screen.
  const canAdoptIncomingConfig = visible || !(
    closeAnimationRunningRef.current || isStartingClose
  );
  const activeConfig = canAdoptIncomingConfig && hasIncomingConfig
    ? incomingConfig
    : cachedConfigRef.current;

  if (canAdoptIncomingConfig && (visible || hasIncomingConfig)) {
    cachedConfigRef.current = incomingConfig;
  }

  const activeTitle = activeConfig.title;
  const activeTitleAlign = activeConfig.titleAlign;
  const activeCompactText = activeConfig.compactText ?? false;
  const activePresentation = activeConfig.presentation ?? 'default';
  const activeUsesTransparentMt5Host =
    activePresentation === 'mt5Plain' || activePresentation === 'mt5TimeframeGrid';
  const activeShowActionIcons = activeConfig.showActionIcons ?? false;
  const activeDeferOffscreenActions = activeConfig.deferOffscreenActions ?? false;
  const activeMaximumVisibleActionRows = activeConfig.maximumVisibleActionRows;
  const activeActions = activeConfig.actions;
  const activeSearchable = activeConfig.searchable ?? false;
  const activeSearchPlaceholder = activeConfig.searchPlaceholder;
  const activeDetent = activeConfig.detent ?? 'adaptive';
  const activeMinimumTopInset = activeConfig.minimumTopInset;
  const activeInstantOpen = activeConfig.instantOpen ?? true;
  const activeEntryMotion: ActionSheetEntryMotion = activeConfig.entryMotion ?? (
    activeInstantOpen ? 'instant' : 'standard'
  );
  // Read from the retained active config—not incoming props—so content and
  // motion cannot disagree while one sheet hands the host to another.
  const activeMt5SlideMotionProfile = activeConfig.mt5SlideMotionProfile ?? 'default';
  const activeImmediateHostHideOnClose = activeConfig.immediateHostHideOnClose ?? false;
  const activeVisualKey = activeConfig.visualKey;
  const activeRunActionAfterClose = activeConfig.runActionAfterClose ?? false;
  const activeAndroidKeyboardAvoidance = activeConfig.androidKeyboardAvoidance ?? 'event';
  const activeKeepFullHeightOnKeyboard = activeConfig.keepFullHeightOnKeyboard ?? false;
  // Filled from the final capped sheet geometry below. Keeping this in a ref
  // lets retained press-time reveals read the already-resolved hidden layout
  // without estimating from every action in a virtualized list.
  const mt5EntryTranslateYRef = useRef(160);

  const pendingActionRef = useRef<(() => void) | null>(null);
  const pendingActionCancelRef = useRef<(() => void) | null>(null);
  const hasMeasuredOverlayRef = useRef(false);
  const actionPressGestureRef = useRef<ActionSheetPressGesture>({
    start: null,
    cancelled: false,
  });
  const actionListRef = useRef<FlatList<ActionSheetAction>>(null);
  const searchInputRef = useRef<TextInput>(null);
  const handleSearchQueryChange = useCallback((nextQuery: string) => {
    if (activeDeferOffscreenActions) {
      // A filtered virtualized list must begin at its first match. Reset before
      // committing the new data so a search after scrolling cannot show blanks.
      actionListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    setQuery(nextQuery);
  }, [activeDeferOffscreenActions]);
  const overlayLayerRef = useRef<View>(null);
  const visibilityBarrierRef = useRef<View>(null);
  const sheetBodyRef = useRef<View>(null);
  const measuredSheetBodyHeightRef = useRef(0);
  const hostHiddenImperativelyRef = useRef(false);
  const retainedVisualOwnerRef = useRef<{ revision: number; visualKey: string } | null>(null);
  const retainedAdoptionVisualKeyRef = useRef<string | null>(null);
  const entryAnimationStartedForOpenRef = useRef(false);
  const mt5DismissCompletedRef = useRef(false);
  const mt5ConfigSwapRevealCancelRef = useRef<(() => void) | null>(null);
  const mt5ConfigSwapAnimationCancelRef = useRef<(() => void) | null>(null);
  const mt5ConfigSwapAnimationPendingRef = useRef(false);
  const mt5ConfigSwapHostParkedRef = useRef(false);
  const reactVisibleRef = useRef(visible);
  const activeVisualKeyRef = useRef(activeVisualKey);
  const retainedMt5RevealInFlight =
    activeEntryMotion === 'mt5Slide' &&
    retainedVisualOwnerRef.current?.visualKey === activeVisualKey;
  const resolveMt5EntryTranslateY = useCallback(
    () => resolveActionSheetMt5EntryTranslateY({
      estimatedTranslateY: mt5EntryTranslateYRef.current,
      measuredSheetBodyHeight: measuredSheetBodyHeightRef.current,
    }),
    [],
  );

  const setVisibilityBarrierNow = useCallback((nextVisible: boolean) => {
    visibilityBarrierRef.current?.setNativeProps({
      style: { opacity: nextVisible ? 1 : 0 },
      accessibilityElementsHidden: !nextVisible,
      importantForAccessibility: nextVisible ? 'auto' : 'no-hide-descendants',
      pointerEvents: nextVisible ? 'box-none' : 'none',
    });
  }, []);

  const parkRetainedHostForConfigSwap = useCallback((expectedVisualKey: string) => {
    if (!expectedVisualKey || activeVisualKeyRef.current !== expectedVisualKey) {
      return false;
    }

    if (pendingActionCancelRef.current) {
      pendingActionCancelRef.current();
      pendingActionCancelRef.current = null;
    }
    pendingActionRef.current = null;
    closeAnimationRunningRef.current = false;
    mt5DismissCompletedRef.current = false;
    retainedVisualOwnerRef.current = null;
    retainedAdoptionVisualKeyRef.current = null;
    entryAnimationStartedForOpenRef.current = false;
    mt5ConfigSwapAnimationPendingRef.current = true;
    if (mt5ConfigSwapRevealCancelRef.current !== null) {
      mt5ConfigSwapRevealCancelRef.current();
      mt5ConfigSwapRevealCancelRef.current = null;
    }
    if (mt5ConfigSwapAnimationCancelRef.current !== null) {
      mt5ConfigSwapAnimationCancelRef.current();
      mt5ConfigSwapAnimationCancelRef.current = null;
    }
    // Unlike shared animated props, this React-owned opacity participates in
    // the same native commit as the replacement subtree, guaranteeing that the
    // new rows cannot borrow the outgoing sheet's final compositor snapshot.
    mt5ConfigSwapHostParkedRef.current = true;
    refreshMt5ConfigSwapGuard((revision) => revision + 1);

    const entryTranslateY = resolveMt5EntryTranslateY();
    overlayOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(entryTranslateY);
    // Park the native child before Zustand publishes the incoming config. A
    // layout effect is already too late on Android: the replacement rows can
    // otherwise borrow the previous sheet's completed translate for one frame.
    writeMt5ActionSheetValuesOnUI(
      mt5HostOpacity,
      mt5OverlayOpacity,
      mt5SheetTranslateY,
      0,
      entryTranslateY,
    );
    overlayLayerRef.current?.setNativeProps({
      style: { opacity: 0 },
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      pointerEvents: 'none',
    });
    setVisibilityBarrierNow(false);
    sheetBodyRef.current?.setNativeProps({ pointerEvents: 'none' });
    hostHiddenImperativelyRef.current = true;
    return true;
  }, [
    mt5HostOpacity,
    mt5OverlayOpacity,
    mt5SheetTranslateY,
    overlayOpacity,
    resolveMt5EntryTranslateY,
    setVisibilityBarrierNow,
    sheetTranslateY,
  ]);

  useLayoutEffect(
    () => registerRetainedActionSheetHostParker(parkRetainedHostForConfigSwap),
    [parkRetainedHostForConfigSwap],
  );

  useLayoutEffect(() => {
    const shouldPrepareParkedMt5Open =
      visible &&
      activeEntryMotion === 'mt5Slide' &&
      hostHiddenImperativelyRef.current;
    const shouldReleaseParkedMt5Open =
      visible &&
      activeEntryMotion === 'mt5Slide' &&
      mt5ConfigSwapAnimationPendingRef.current &&
      !mt5ConfigSwapHostParkedRef.current;
    if (
      !visibilityChanged &&
      !shouldPrepareParkedMt5Open &&
      !shouldReleaseParkedMt5Open
    ) {
      return;
    }

    const mt5DismissAlreadyCompleted = !visible && mt5DismissCompletedRef.current;
    mt5DismissCompletedRef.current = false;
    closeAnimationRunningRef.current = !visible && !mt5DismissAlreadyCompleted;
    if (visible) {
      if (shouldPrepareParkedMt5Open) {
        // A preceding close hid the whole native host. Keep that parent parked
        // while the child receives its hidden entry pose, then reuse the
        // guarded two-frame release below. Restoring the parent immediately can
        // replay Android's cached outgoing sheet before Reanimated catches up.
        mt5ConfigSwapHostParkedRef.current = true;
        mt5ConfigSwapAnimationPendingRef.current = true;
      }
      // A visible effect can rerun while the same sheet is open when its
      // measured height or retained config settles. Only the visibility edge
      // may arm a new entry animation; otherwise Drawing Tools visibly rises,
      // drops, and rises a second time.
      entryAnimationStartedForOpenRef.current = false;
      openedAtRef.current = Date.now();
      if (!retainedMt5RevealInFlight) {
        // Seed the hidden entry pose before restoring the imperatively hidden
        // host. Restoring first can expose the previous open's final translate
        // for one Android frame, making the sheet flash open, drop, then rise.
        if (activeEntryMotion === 'mt5Slide') {
          writeMt5ActionSheetValuesOnUI(
            mt5HostOpacity,
            mt5OverlayOpacity,
            mt5SheetTranslateY,
            0,
            resolveMt5EntryTranslateY(),
          );
        }
        overlayOpacity.stopAnimation();
        sheetTranslateY.stopAnimation();
        if (activeEntryMotion === 'instant') {
          overlayOpacity.setValue(ACTION_SHEET_INSTANT_OPEN_OPACITY);
          sheetTranslateY.setValue(ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y);
        } else {
          overlayOpacity.setValue(0);
          sheetTranslateY.setValue(
            activeEntryMotion === 'mt5Slide'
              ? resolveMt5EntryTranslateY()
              : ACTION_SHEET_OPEN_TRANSLATE_Y,
          );
        }
      }
      if (hostHiddenImperativelyRef.current) {
        // A preceding MT5-slide close hides the entire retained host with an
        // imperative opacity mutation. The next sheet may be a default/search
        // picker rather than another MT5 presentation, so restore the shared
        // host on every visible edge, independent of the incoming style.
        overlayLayerRef.current?.setNativeProps({
          ...(activeEntryMotion === 'mt5Slide' ? {} : { style: { opacity: 1 } }),
          accessibilityElementsHidden: false,
          importantForAccessibility: 'auto',
          pointerEvents: 'auto',
        });
        setVisibilityBarrierNow(true);
        sheetBodyRef.current?.setNativeProps({ pointerEvents: 'auto' });
        hostHiddenImperativelyRef.current = false;
      }
      if (
        activeEntryMotion === 'mt5Slide' &&
        mt5ConfigSwapHostParkedRef.current
      ) {
        // Commit one fully hidden frame with the replacement rows. Releasing
        // this guard in the same layout turn lets Android replay the outgoing
        // sheet's cached final subtree before Reanimated props are attached.
        if (retainedMt5RevealInFlight) {
          // The retained controller already started the exact mounted sheet.
          // Guard release must not arm a second fallback entry animation.
          mt5ConfigSwapAnimationPendingRef.current = false;
        }
        if (mt5ConfigSwapRevealCancelRef.current === null) {
          mt5ConfigSwapRevealCancelRef.current = scheduleAfterVisualFrame(() => {
            mt5ConfigSwapRevealCancelRef.current = null;
            if (reactVisibleRef.current) {
              mt5ConfigSwapHostParkedRef.current = false;
              // Remove the imperative native hide directly. Waiting for the
              // React opacity diff can take most of the 210 ms animation on a
              // busy Android frame, making a smooth slide look like a pop.
              overlayLayerRef.current?.setNativeProps({ style: { opacity: 1 } });
              setVisibilityBarrierNow(true);
              refreshMt5ConfigSwapGuard((revision) => revision + 1);
              if (
                !retainedMt5RevealInFlight
                && mt5ConfigSwapAnimationPendingRef.current
                && mt5ConfigSwapAnimationCancelRef.current === null
              ) {
                // Let the now-visible parent reach the compositor before the
                // child host reveals at its parked entry position.
                mt5ConfigSwapAnimationCancelRef.current = scheduleAfterVisualFrame(() => {
                  mt5ConfigSwapAnimationCancelRef.current = null;
                  if (
                    reactVisibleRef.current
                    && mt5ConfigSwapAnimationPendingRef.current
                  ) {
                    startActionSheetEntryAnimation({
                      mode: activeEntryMotion,
                      mt5SlideMotionProfile: activeMt5SlideMotionProfile,
                      overlayOpacity,
                      sheetTranslateY,
                      mt5TranslateY: resolveMt5EntryTranslateY(),
                      mt5HostOpacity,
                      mt5OverlayOpacity,
                      mt5SheetTranslateY,
                    });
                    mt5ConfigSwapAnimationPendingRef.current = false;
                    entryAnimationStartedForOpenRef.current = true;
                  }
                });
              }
            }
          });
        }
      }
      if (activeEntryMotion === 'mt5Slide' && !retainedMt5RevealInFlight) {
        if (
          !mt5ConfigSwapHostParkedRef.current
          && mt5ConfigSwapAnimationCancelRef.current === null
        ) {
          // The target rows and capped geometry have already committed while
          // hidden. Start in layout so a coalesced reopen cannot remain parked
          // waiting for a passive effect whose dependencies did not change.
          startActionSheetEntryAnimation({
            mode: activeEntryMotion,
            mt5SlideMotionProfile: activeMt5SlideMotionProfile,
            overlayOpacity,
            sheetTranslateY,
            mt5TranslateY: resolveMt5EntryTranslateY(),
            mt5HostOpacity,
            mt5OverlayOpacity,
            mt5SheetTranslateY,
          });
          mt5ConfigSwapAnimationPendingRef.current = false;
          entryAnimationStartedForOpenRef.current = true;
        }
      }
    } else if (activeEntryMotion === 'mt5Slide' || activeImmediateHostHideOnClose) {
      if (mt5ConfigSwapRevealCancelRef.current !== null) {
        mt5ConfigSwapRevealCancelRef.current();
        mt5ConfigSwapRevealCancelRef.current = null;
      }
      if (mt5ConfigSwapAnimationCancelRef.current !== null) {
        mt5ConfigSwapAnimationCancelRef.current();
        mt5ConfigSwapAnimationCancelRef.current = null;
      }
      mt5ConfigSwapAnimationPendingRef.current = false;
      if (mt5ConfigSwapHostParkedRef.current) {
        mt5ConfigSwapHostParkedRef.current = false;
        refreshMt5ConfigSwapGuard((revision) => revision + 1);
      }
      entryAnimationStartedForOpenRef.current = false;
      // Store-driven closes can bypass dismissActionSheet. Hide in the layout
      // phase so no stale retained snapshot or passive effect can paint a
      // one-frame full-sheet ghost after the sheet already disappeared.
      overlayLayerRef.current?.setNativeProps({
        style: { opacity: 0 },
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
        pointerEvents: 'none',
      });
      setVisibilityBarrierNow(false);
      hostHiddenImperativelyRef.current = true;
      sheetBodyRef.current?.setNativeProps({ pointerEvents: 'none' });
      overlayOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(resolveMt5EntryTranslateY());
      writeMt5ActionSheetValuesOnUI(
        mt5HostOpacity,
        mt5OverlayOpacity,
        mt5SheetTranslateY,
        0,
        resolveMt5EntryTranslateY(),
      );
      closeAnimationRunningRef.current = false;
      // Adopt the newest hidden preload immediately. Without this commit the
      // retained host can keep the outgoing Drawing/More visual key, forcing
      // the next symbol press through the slower React fallback.
      refreshHiddenConfig((revision) => revision + 1);
    }
    prevVisibleRef.current = visible;
  }, [
    activeEntryMotion,
    activeMt5SlideMotionProfile,
    activeImmediateHostHideOnClose,
    activeVisualKey,
    overlayOpacity,
    refreshHiddenConfig,
    resolveMt5EntryTranslateY,
    retainedMt5RevealInFlight,
    setVisibilityBarrierNow,
    sheetTranslateY,
    mt5HostOpacity,
    mt5OverlayOpacity,
    mt5SheetTranslateY,
    visibilityChanged,
    visible,
  ]);

  const applyRetainedVisualSnapshot = useCallback((
    retainedSnapshot: RetainedActionSheetVisualSnapshot,
  ) => {
    const wantsVisible = retainedSnapshot.mode !== 'hidden';
    if (wantsVisible && retainedSnapshot.visualKey !== activeVisualKeyRef.current) {
      return false;
    }
    if (wantsVisible && reactVisibleRef.current) {
      // React already owns this sheet. A duplicate same-key retained commit
      // must not imperatively disable pointer events with no subsequent render
      // available to restore them.
      return false;
    }
    if (
      retainedSnapshot.mode === 'committed' &&
      retainedVisualOwnerRef.current?.revision === retainedSnapshot.revision &&
      retainedVisualOwnerRef.current.visualKey === retainedSnapshot.visualKey
    ) {
      // A pending hidden passive effect may synchronize the same committed
      // snapshot again. Keep the already-running native animation untouched.
      return true;
    }
    if (retainedSnapshot.mode === 'preview') {
      // Press-in only proves that the exact hidden content is committed. It
      // remains invisible so starting a scroll or long-press never flashes a
      // tap menu over the watchlist.
      const interruptedClose = closeAnimationRunningRef.current;
      closeAnimationRunningRef.current = false;
      overlayOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(
        activeEntryMotion === 'mt5Slide' ? resolveMt5EntryTranslateY() : 80,
      );
      if (activeEntryMotion === 'mt5Slide') {
        writeMt5ActionSheetValuesOnUI(
          mt5HostOpacity,
          mt5OverlayOpacity,
          mt5SheetTranslateY,
          0,
          resolveMt5EntryTranslateY(),
        );
      }
      overlayLayerRef.current?.setNativeProps({
        style: { opacity: 0 },
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
        pointerEvents: 'none',
      });
      setVisibilityBarrierNow(false);
      sheetBodyRef.current?.setNativeProps({ pointerEvents: 'none' });
      if (interruptedClose) {
        // The preview itself has already made the outgoing sheet fully hidden.
        // Let React adopt the latest preload now; a cancelled gesture must not
        // leave the old cached config held behind an interrupted close.
        refreshHiddenConfig((revision) => revision + 1);
      }
      return true;
    }
    if (!wantsVisible && retainedVisualOwnerRef.current === null) {
      // A hidden controller snapshot must not override a normal ActionSheet
      // whose visibility and pointer events are owned entirely by React.
      return false;
    }

    if (wantsVisible && retainedSnapshot.visualKey) {
      retainedVisualOwnerRef.current = {
        revision: retainedSnapshot.revision,
        visualKey: retainedSnapshot.visualKey,
      };
    } else {
      retainedVisualOwnerRef.current = null;
    }

    if (wantsVisible && activeEntryMotion === 'mt5Slide') {
      // A retained press can win while an ordinary/config-swap reveal is still
      // queued. It now owns the reveal, so remove every older parent-release
      // callback before seeding and exposing this exact mounted child.
      if (mt5ConfigSwapRevealCancelRef.current !== null) {
        mt5ConfigSwapRevealCancelRef.current();
        mt5ConfigSwapRevealCancelRef.current = null;
      }
      if (mt5ConfigSwapAnimationCancelRef.current !== null) {
        mt5ConfigSwapAnimationCancelRef.current();
        mt5ConfigSwapAnimationCancelRef.current = null;
      }
      mt5ConfigSwapAnimationPendingRef.current = false;
      if (mt5ConfigSwapHostParkedRef.current) {
        mt5ConfigSwapHostParkedRef.current = false;
        refreshMt5ConfigSwapGuard((revision) => revision + 1);
      }
    }

    // The committed sheet owns input immediately. React adopts the same state
    // in this tap turn, while the 60 ms backdrop guard protects the originating
    // release from being mistaken for a dismissal.
    const interactive = retainedSnapshot.mode === 'committed';
    if (wantsVisible && activeEntryMotion === 'mt5Slide') {
      // Park the retained sheet before the parent host is exposed. The host
      // guard stays transparent until the entry worklet starts below.
      writeMt5ActionSheetValuesOnUI(
        mt5HostOpacity,
        mt5OverlayOpacity,
        mt5SheetTranslateY,
        0,
        resolveMt5EntryTranslateY(),
      );
    } else if (wantsVisible) {
      // This runs synchronously in the accepted press turn. The content is
      // already mounted, so only UI-thread opacity/translation work starts
      // here; the heavier React adoption happens after the first pixels paint.
      startActionSheetEntryAnimation({
        mode: activeEntryMotion,
        mt5SlideMotionProfile: activeMt5SlideMotionProfile,
        overlayOpacity,
        sheetTranslateY,
        mt5TranslateY: resolveMt5EntryTranslateY(),
        mt5HostOpacity,
        mt5OverlayOpacity,
        mt5SheetTranslateY,
      });
    } else {
      overlayOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(
        activeEntryMotion === 'mt5Slide' ? resolveMt5EntryTranslateY() : 80,
      );
      if (activeEntryMotion === 'mt5Slide') {
        writeMt5ActionSheetValuesOnUI(
          mt5HostOpacity,
          mt5OverlayOpacity,
          mt5SheetTranslateY,
          0,
          resolveMt5EntryTranslateY(),
        );
      }
    }
    if (retainedSnapshot.mode === 'committed') {
      openedAtRef.current = Date.now();
    }

    overlayLayerRef.current?.setNativeProps({
      style: { opacity: interactive ? 1 : 0 },
      accessibilityElementsHidden: !interactive,
      importantForAccessibility: interactive ? 'auto' : 'no-hide-descendants',
      pointerEvents: interactive ? 'auto' : 'none',
    });
    setVisibilityBarrierNow(interactive);
    sheetBodyRef.current?.setNativeProps({
      pointerEvents: interactive ? 'auto' : 'none',
    });
    if (activeEntryMotion === 'mt5Slide') {
      // MT5 closes now hide the whole native parent. A retained commit seeds
      // the child above before exposing that parent, so it is safe to hand
      // visibility back to the already-running UI-thread entry animation.
      hostHiddenImperativelyRef.current = !interactive;
    }
    if (wantsVisible && activeEntryMotion === 'mt5Slide') {
      // The parent is now ready while the child is still guarded. Release the
      // guard and start both animations atomically on the UI runtime.
      startActionSheetEntryAnimation({
        mode: activeEntryMotion,
        mt5SlideMotionProfile: activeMt5SlideMotionProfile,
        overlayOpacity,
        sheetTranslateY,
        mt5TranslateY: resolveMt5EntryTranslateY(),
        mt5HostOpacity,
        mt5OverlayOpacity,
        mt5SheetTranslateY,
      });
    }
    return true;
  }, [
    activeEntryMotion,
    activeMt5SlideMotionProfile,
    mt5HostOpacity,
    mt5OverlayOpacity,
    mt5SheetTranslateY,
    overlayOpacity,
    refreshHiddenConfig,
    refreshMt5ConfigSwapGuard,
    resolveMt5EntryTranslateY,
    setVisibilityBarrierNow,
    sheetTranslateY,
  ]);

  useLayoutEffect(
    () => registerRetainedActionSheetVisualApplier(applyRetainedVisualSnapshot),
    [applyRetainedVisualSnapshot],
  );

  useLayoutEffect(() => {
    reactVisibleRef.current = visible;
    activeVisualKeyRef.current = activeVisualKey;
    if (visible && activeVisualKey) {
      if (acknowledgeRetainedActionSheetVisible(activeVisualKey)) {
        // React now owns the visible state; a later unrelated controller hide
        // must not make this already-open sheet non-interactive.
        overlayLayerRef.current?.setNativeProps({
          ...(activeEntryMotion === 'mt5Slide' ? {} : { style: { opacity: 1 } }),
          accessibilityElementsHidden: false,
          importantForAccessibility: 'auto',
          pointerEvents: 'auto',
        });
        setVisibilityBarrierNow(true);
        sheetBodyRef.current?.setNativeProps({ pointerEvents: 'auto' });
        if (activeEntryMotion === 'mt5Slide') {
          retainedAdoptionVisualKeyRef.current = activeVisualKey;
        }
        retainedVisualOwnerRef.current = null;
      }
      return;
    }
    if (!visible) {
      syncRetainedActionSheetVisual();
    }
  }, [activeEntryMotion, activeVisualKey, setVisibilityBarrierNow, visible]);

  useLayoutEffect(() => {
    if (!visible) {
      if (activeDeferOffscreenActions) {
        // The host is already hidden. Reset the retained list offscreen so its
        // next open starts at row one without remounting cells.
        actionListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
      if (activeSearchable && query.length > 0) {
        // A retained searchable sheet must never reveal its previous filter
        // before React adopts the next visible state.
        setQuery('');
      }
    }
  }, [activeDeferOffscreenActions, activeSearchable, activeVisualKey, query, visible]);

  const filteredActions = activeSearchable
    ? filterActionSheetActions(activeActions, query, t)
    : activeActions;
  const isTimeframeGridPresentation = activePresentation === 'mt5TimeframeGrid';
  const isMt5PlainPresentation = activePresentation === 'mt5Plain';
  const isMt5StylePresentation = activeUsesTransparentMt5Host;
  const isTitleCentered = activeTitleAlign === 'center';
  const actionRowMinHeight = isMt5StylePresentation
    ? ACTION_SHEET_MT5_PLAIN_ROW_MIN_HEIGHT
    : ACTION_SHEET_ROW_MIN_HEIGHT;
  const wrapActionText = windowWidth - insets.left - insets.right < 360 || fontScale > 1.1;
  const actionsContentExtraHeight = isMt5StylePresentation
    ? ACTION_SHEET_MT5_PLAIN_ACTIONS_BOTTOM_PADDING
    : 0;
  // Reserve a tappable dismiss strip above the sheet that sits clear of any
  // OS edge-gesture region. `minimumTopInset` (when explicitly passed by a
  // caller) still wins if it asks for more.
  const topInset = Math.max(
    insets.top + TAPPABLE_TOP_DISMISS_MARGIN,
    activeMinimumTopInset ?? 0,
  );
  const bottomInset = resolveActionSheetBottomInset(insets.bottom, Platform.OS);
  // Android keyboard behavior varies between resize and overlay modes. Use
  // whichever source reports the largest keyboard lift, then only add a bottom
  // spacer for the part that was not already handled by a smaller overlay or
  // window height. That keeps searchable sheets above the IME without the
  // double-lift jump on resize-mode devices.
  // Fixed searchable-sheet mode: opt out of keyboard avoidance entirely so
  // Symbol Picker and Drawing Tools keep their full height and fixed position;
  // the keyboard simply overlays the lower list. On Android the host is pinned to
  // full height (see the sheetHost render below), on iOS the KeyboardAvoidingView
  // is disabled so it stops padding the bottom-anchored sheet up. Isolated —
  // every other searchable sheet keeps the avoidance math unchanged.
  const keepFullHeightSheet = activeSearchable && activeKeepFullHeightOnKeyboard;
  const fixedSheetKeyboardPadding = keepFullHeightSheet ? keyboardHeight : 0;
  // Quotes symbol menus (and other non-searchable MT5 sheets) must never sit in
  // a KeyboardAvoidingView on iOS — the padding behavior can collapse the host
  // even with the keyboard closed and is the common "sheet shrinks on iOS only"
  // failure. Only searchable sheets that are not in stay-still mode need KAV.
  const iosKeyboardAvoidanceEnabled =
    Platform.OS === 'ios' && activeSearchable && !keepFullHeightSheet;
  const androidSearchableSheet =
    Platform.OS === 'android' && activeSearchable && !keepFullHeightSheet;
  const overlayKeyboardLift = androidSearchableSheet
    ? Math.max(0, measuredHeight - (currentOverlayHeight || measuredHeight))
    : 0;
  const windowKeyboardLift = androidSearchableSheet
    ? Math.max(0, measuredHeight - (windowHeight || measuredHeight))
    : 0;
  const eventKeyboardLift = androidSearchableSheet
    ? (activeAndroidKeyboardAvoidance === 'resize' ? 0 : Math.max(0, keyboardHeight))
    : 0;
  const resizeKeyboardLift = Math.max(overlayKeyboardLift, windowKeyboardLift);
  const effectiveKeyboardLift = Math.max(resizeKeyboardLift, eventKeyboardLift);
  const unhandledKeyboardLift = Math.max(0, eventKeyboardLift - resizeKeyboardLift);
  const measuredVisibleHeight = androidSearchableSheet
    ? measuredHeight - effectiveKeyboardLift
    : keepFullHeightSheet
      ? measuredHeight
      : Math.min(measuredHeight, currentOverlayHeight || measuredHeight, currentSheetHostHeight || measuredHeight, windowHeight || measuredHeight);
  const bottomSpacerHeight = unhandledKeyboardLift;
  // Use the measured layout height from the in-tree overlay host.
  const availableWindowHeight = Math.max(0, measuredVisibleHeight);
  const maxVisibleHeight = Math.max(
    0,
    availableWindowHeight - topInset - bottomInset - 12,
  );
  const reservedChromeHeight =
    (activeTitle ? (isMt5StylePresentation ? 64 : 58) * Math.max(1, fontScale) : (isMt5StylePresentation ? 0 : 28)) +
    (activeSearchable ? Math.max(56, Math.ceil(22 * fontScale + 32)) : 0);
  // Short windows need the title and search field to scroll with the actions.
  const scrollSheetChrome = maxVisibleHeight < reservedChromeHeight + actionRowMinHeight * 2;
  const timeframeGridRows = Math.ceil(filteredActions.length / ACTION_SHEET_TIMEFRAME_GRID_COLUMNS);
  const estimatedTimeframeGridActionsHeight = timeframeGridRows > 0
    ? ACTION_SHEET_TIMEFRAME_GRID_VERTICAL_PADDING +
      (timeframeGridRows * ACTION_SHEET_TIMEFRAME_GRID_ROW_HEIGHT) +
      (Math.max(0, timeframeGridRows - 1) * ACTION_SHEET_TIMEFRAME_GRID_ROW_GAP)
    : 0;
  const estimatedActionsHeight = isTimeframeGridPresentation
    ? estimatedTimeframeGridActionsHeight
    : filteredActions.reduce(
      (height, action) => height + (
        action.subtitle ? ACTION_SHEET_SUBTITLE_ROW_MIN_HEIGHT : actionRowMinHeight
      ),
      actionsContentExtraHeight,
    );
  // Content-sized auto menus (Quotes symbol tap/long-press) need the home-
  // indicator inset baked into height so iOS does not paint the last rows under
  // the safe area and then reflow shorter.
  const contentSizedAutoSheet =
    activeDetent === 'auto'
    && !activeSearchable
    && !isTimeframeGridPresentation;
  const sheetBottomSafePad = contentSizedAutoSheet ? bottomInset : 0;
  const estimatedSheetHeight =
    reservedChromeHeight + estimatedActionsHeight + sheetBottomSafePad;
  const adaptiveSheetFloor = resolveActionSheetFloor({
    detent: activeDetent,
    searchable: activeSearchable,
    availableWindowHeight,
  });
  const sheetTargetHeight = Math.max(estimatedSheetHeight, adaptiveSheetFloor);
  const maximumVisibleActionRowCount = activeMaximumVisibleActionRows && activeMaximumVisibleActionRows > 0
    ? Math.floor(activeMaximumVisibleActionRows)
    : null;
  const maximumActionsViewportHeight = maximumVisibleActionRowCount
    ? activeActions
      .slice(0, maximumVisibleActionRowCount)
      .reduce(
        (height, action) => height + (
          action.subtitle ? ACTION_SHEET_SUBTITLE_ROW_MIN_HEIGHT : actionRowMinHeight
        ),
        actionsContentExtraHeight,
      ) + sheetBottomSafePad
    : Number.POSITIVE_INFINITY;
  // Large detents already target ~88% of the window. Do not also hard-cap the
  // sheet to the progressive-open row budget (e.g. 12 Drawing Tools rows) —
  // that made long catalogs look truncated when FlatList scrolling failed.
  // maximumVisibleActionRows still controls initialNumToRender only.
  const sheetMaxHeight = Math.min(
    maxVisibleHeight,
    sheetTargetHeight,
    activeDetent === 'large'
      ? Number.POSITIVE_INFINITY
      : reservedChromeHeight + maximumActionsViewportHeight,
  );
  // Animate by one real body height, not by the height of every row in the
  // data set. Drawing Tools uses a progressive open budget; using all rows
  // kept early frames entirely below the screen.
  mt5EntryTranslateYRef.current = Math.max(160, sheetMaxHeight + 1);
  const sheetFloorMinHeight = adaptiveSheetFloor > 0 && sheetMaxHeight > estimatedSheetHeight
    ? Math.min(sheetMaxHeight, adaptiveSheetFloor)
    : undefined;
  // Content-sized auto sheets keep a stable floor so a later layout pass cannot
  // collapse them below the first settled height (iOS shrink regression).
  const sheetMinHeight = contentSizedAutoSheet
    ? Math.min(sheetMaxHeight, estimatedSheetHeight)
    : sheetFloorMinHeight;
  const shouldLockSheetHeight = activeDetent === 'large' || contentSizedAutoSheet;
  const sheetHeightStyle = shouldLockSheetHeight
    ? { height: sheetMaxHeight }
    : { maxHeight: sheetMaxHeight };
  const actionsMaxHeight = Math.max(0, sheetMaxHeight - reservedChromeHeight - sheetBottomSafePad);
  const actionsMinHeight = sheetFloorMinHeight
    ? Math.min(actionsMaxHeight, Math.max(0, sheetFloorMinHeight - reservedChromeHeight - sheetBottomSafePad))
    : undefined;
  const hasSubtitleActionRows = filteredActions.some((action) => Boolean(action.subtitle));
  const hasPlainActionRows = filteredActions.some((action) => !action.subtitle);
  const hasVariableActionRowHeights = (hasSubtitleActionRows && hasPlainActionRows) || wrapActionText;
  const uniformActionRowHeight = hasSubtitleActionRows
    ? ACTION_SHEET_SUBTITLE_ROW_MIN_HEIGHT
    : actionRowMinHeight;
  const estimatedFilteredActionsHeight = filteredActions.reduce(
    (height, action) => height + (
      action.subtitle ? ACTION_SHEET_SUBTITLE_ROW_MIN_HEIGHT : actionRowMinHeight
    ),
    actionsContentExtraHeight,
  ) + fixedSheetKeyboardPadding;
  // FlatList only scrolls reliably when its layout height is strictly smaller
  // than content. maxHeight alone often expands to full content on Android and
  // the parent clips the rest — tools past the first screen never appear.
  const actionListNeedsScroll = scrollSheetChrome || estimatedFilteredActionsHeight > actionsMaxHeight + 0.5;
  const actionListSizeStyle = scrollSheetChrome
    ? { height: Math.max(0, sheetMaxHeight - sheetBottomSafePad) }
    : actionListNeedsScroll
    ? { height: actionsMaxHeight }
    : {
        maxHeight: actionsMaxHeight,
        ...(actionsMinHeight ? { minHeight: actionsMinHeight } : null),
      };
  const estimatedVisibleActionRows = Math.max(1, (() => {
    const usableViewportHeight = Math.max(1, actionsMaxHeight - actionsContentExtraHeight);
    let occupiedHeight = 0;
    let visibleRows = 0;
    for (const action of filteredActions) {
      occupiedHeight += action.subtitle
        ? ACTION_SHEET_SUBTITLE_ROW_MIN_HEIGHT
        : actionRowMinHeight;
      visibleRows += 1;
      if (occupiedHeight >= usableViewportHeight) {
        break;
      }
    }
    return visibleRows;
  })());
  const deferredInitialActionRows = maximumVisibleActionRowCount
    ? Math.min(maximumVisibleActionRowCount, estimatedVisibleActionRows)
    : estimatedVisibleActionRows;
  // Opted-in long sheets mount their opening viewport first, then let FlatList
  // supply the remaining tools on scroll. Prefetch enough extra rows that the
  // first flick never lands on blank cells.
  const progressiveOpenCap = activeDeferOffscreenActions
    ? Math.max(deferredInitialActionRows, Math.min(filteredActions.length, estimatedVisibleActionRows + 4))
    : filteredActions.length > ACTION_SHEET_INLINE_ACTION_LIMIT
      ? Math.min(8, estimatedVisibleActionRows)
      : estimatedVisibleActionRows + 1;
  const initialActionRowsToRender = Math.max(
    1,
    Math.min(filteredActions.length, progressiveOpenCap),
  );
  const actionListWindowSize = activeDeferOffscreenActions ? 7 : 3;
  const actionListMaxToRenderPerBatch = activeDeferOffscreenActions
    ? Math.max(12, initialActionRowsToRender)
    : Math.max(4, Math.min(8, initialActionRowsToRender));
  const deferredActionListKey = activeDeferOffscreenActions
    ? activeVisualKey ?? 'deferred-action-list'
    : undefined;
  const shouldRenderInlineActions =
    !isTimeframeGridPresentation &&
    !wrapActionText &&
    !scrollSheetChrome &&
    !activeSearchable &&
    filteredActions.length <= ACTION_SHEET_INLINE_ACTION_LIMIT &&
    estimatedActionsHeight <= actionsMaxHeight;

  // Run only UI-thread opacity and translate animations. Layout and content
  // are already resolved before the first visible frame.
  const runEntryAnimation = useCallback((mode: ActionSheetEntryMotion = 'standard') => {
    startActionSheetEntryAnimation({
      mode,
      mt5SlideMotionProfile: activeMt5SlideMotionProfile,
      overlayOpacity,
      sheetTranslateY,
      mt5TranslateY: resolveMt5EntryTranslateY(),
      mt5HostOpacity,
      mt5OverlayOpacity,
      mt5SheetTranslateY,
    });
  }, [
    activeMt5SlideMotionProfile,
    mt5HostOpacity,
    mt5OverlayOpacity,
    mt5SheetTranslateY,
    overlayOpacity,
    resolveMt5EntryTranslateY,
    sheetTranslateY,
  ]);

  const hideMt5ActionSheetHostNow = useCallback(() => {
    if (activeEntryMotion !== 'mt5Slide' && !activeImmediateHostHideOnClose) {
      return false;
    }

    // One whole-host mutation removes every outgoing pixel and releases touch
    // ownership before any destination work begins. Moving individual animated
    // values first was both slower and allowed a stale full-sheet ghost.
    overlayLayerRef.current?.setNativeProps({
      style: { opacity: 0 },
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      pointerEvents: 'none',
    });
    setVisibilityBarrierNow(false);
    hostHiddenImperativelyRef.current = true;
    return true;
  }, [activeEntryMotion, activeImmediateHostHideOnClose, setVisibilityBarrierNow]);

  const hideMt5ActionSheetNow = useCallback(() => {
    if (!hideMt5ActionSheetHostNow()) {
      return false;
    }

    // A retained/config-swap reveal may already be queued when an action is
    // selected. Cancel both frames before hiding so neither callback can
    // restore the outgoing MT5 host after this close has committed.
    if (mt5ConfigSwapRevealCancelRef.current !== null) {
      mt5ConfigSwapRevealCancelRef.current();
      mt5ConfigSwapRevealCancelRef.current = null;
    }
    if (mt5ConfigSwapAnimationCancelRef.current !== null) {
      mt5ConfigSwapAnimationCancelRef.current();
      mt5ConfigSwapAnimationCancelRef.current = null;
    }
    mt5ConfigSwapAnimationPendingRef.current = false;

    // Retained ActionSheet content stays mounted for a fast reopen. Explicitly
    // blur its own search field or Android keeps the IME attached after the
    // sheet has disappeared.
    searchInputRef.current?.blur();

    // Remove any prepared/committed retained reveal before stopping native
    // motion. Otherwise that stale snapshot can repaint the full sheet after
    // the close has already reached the Quotes screen.
    cancelRetainedActionSheetPreview();
    retainedVisualOwnerRef.current = null;
    retainedAdoptionVisualKeyRef.current = null;
    overlayOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(resolveMt5EntryTranslateY());
    writeMt5ActionSheetValuesOnUI(
      mt5HostOpacity,
      mt5OverlayOpacity,
      mt5SheetTranslateY,
      0,
      resolveMt5EntryTranslateY(),
    );
    closeAnimationRunningRef.current = false;
    mt5DismissCompletedRef.current = true;
    sheetBodyRef.current?.setNativeProps({ pointerEvents: 'none' });
    if (activeDeferOffscreenActions) {
      // Reset after the host is hidden so the next retained open starts at the
      // first tool without exposing a visible jump or rebuilding the list.
      actionListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    return true;
  }, [
    activeDeferOffscreenActions,
    hideMt5ActionSheetHostNow,
    mt5HostOpacity,
    overlayOpacity,
    mt5OverlayOpacity,
    mt5SheetTranslateY,
    resolveMt5EntryTranslateY,
    sheetTranslateY,
  ]);

  const dismissActionSheet = useCallback(() => {
    hideMt5ActionSheetNow();
    onClose();
  }, [hideMt5ActionSheetNow, onClose]);

  const resetActionSheetForLifecycle = useCallback(() => {
    const shouldClose = reactVisibleRef.current || retainedVisualOwnerRef.current !== null;
    // Stop old passive effects and queued reveal/action callbacks before
    // touching animation values; stopAnimation can itself invoke callbacks.
    reactVisibleRef.current = false;
    pendingActionCancelRef.current?.();
    pendingActionCancelRef.current = null;
    pendingActionRef.current = null;
    mt5ConfigSwapRevealCancelRef.current?.();
    mt5ConfigSwapRevealCancelRef.current = null;
    mt5ConfigSwapAnimationCancelRef.current?.();
    mt5ConfigSwapAnimationCancelRef.current = null;
    mt5ConfigSwapAnimationPendingRef.current = false;
    mt5ConfigSwapHostParkedRef.current = false;
    retainedVisualOwnerRef.current = null;
    retainedAdoptionVisualKeyRef.current = null;
    closeAnimationRunningRef.current = false;
    mt5DismissCompletedRef.current = true;
    entryAnimationStartedForOpenRef.current = false;
    actionPressGestureRef.current = { start: null, cancelled: true };
    cancelRetainedActionSheetPreview();
    overlayOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(resolveMt5EntryTranslateY());
    writeMt5ActionSheetValuesOnUI(mt5HostOpacity, mt5OverlayOpacity, mt5SheetTranslateY, 0, resolveMt5EntryTranslateY());
    overlayLayerRef.current?.setNativeProps({
      style: { opacity: 0 }, pointerEvents: 'none',
      accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants',
    });
    setVisibilityBarrierNow(false);
    sheetBodyRef.current?.setNativeProps({ pointerEvents: 'none' });
    hostHiddenImperativelyRef.current = true;
    searchInputRef.current?.blur();
    setKeyboardHeight(0);
    hasMeasuredOverlayRef.current = false;
    if (shouldClose) onClose();
  }, [mt5HostOpacity, mt5OverlayOpacity, mt5SheetTranslateY, onClose, overlayOpacity, resolveMt5EntryTranslateY, setVisibilityBarrierNow, sheetTranslateY]);

  useEffect(() => registerInteractionLifecycleHandler(resetActionSheetForLifecycle), [resetActionSheetForLifecycle]);

  const handleOverlayLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const h = event.nativeEvent.layout.height;
    if (h > 0) {
      setCurrentOverlayHeight(h);
      const hasMeasuredLayout = hasMeasuredOverlayRef.current;
      setMeasuredHeight((prev) =>
        resolveActionSheetMeasuredHeight({
          previousHeight: prev,
          layoutHeight: h,
          instantOpen: activeInstantOpen,
          hasMeasuredLayout,
        }),
      );
      hasMeasuredOverlayRef.current = true;
    }
  }, [activeInstantOpen]);

  const handleSheetBodyLayout = useCallback((
    event: { nativeEvent: { layout: { height: number } } },
  ) => {
    const height = event.nativeEvent.layout.height;
    if (height > 0) {
      measuredSheetBodyHeightRef.current = height;
    }
  }, []);
  const handleSheetHostLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const height = event.nativeEvent.layout.height;
    if (height > 0) setCurrentSheetHostHeight(height);
  }, []);

  // Dismiss keyboard when the ActionSheet opens and seed measured height for
  // this open cycle. Instant sheets must never reset downward after their
  // first frame, otherwise Android shows the sheet and then drops it lower.
  useEffect(() => {
    if (visible) {
      if (!activeInstantOpen) {
        Keyboard.dismiss();
      }
      setQuery('');
      setCurrentOverlayHeight(Dimensions.get('window').height || Dimensions.get('screen').height);
      setMeasuredHeight((prev) =>
        resolveActionSheetOpenMeasuredHeight({
          previousHeight: prev,
          instantOpen: activeInstantOpen,
          screenHeight: Dimensions.get('screen').height,
          windowHeight: Dimensions.get('window').height,
        }),
      );
    }
  }, [activeInstantOpen, activeVisualKey, visible]);

  useEffect(() => {
    if ((Platform.OS !== 'android' && !activeKeepFullHeightOnKeyboard) || !activeSearchable) {
      setKeyboardHeight(0);
      return;
    }

    const syncOverlayHeightFromWindow = () => {
      const nextWindowHeight = Dimensions.get('window').height;
      if (nextWindowHeight > 0) {
        setCurrentOverlayHeight(nextWindowHeight);
      }
    };

    const handleKeyboardShow = (event: { endCoordinates?: { height?: number } }) => {
      const nextKeyboardHeight = Math.max(0, (event.endCoordinates?.height ?? 0) - insets.bottom);
      // Keep the resize-based lift in the same render as the keyboard event.
      // Expo Go can report keyboardDidShow before useWindowDimensions/onLayout
      // publishes the shorter window height; without this seed, the sheet adds
      // a full keyboard spacer against an already resized native window.
      syncOverlayHeightFromWindow();
      setKeyboardHeight(nextKeyboardHeight);
    };
    const handleKeyboardHide = () => {
      syncOverlayHeightFromWindow();
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [activeKeepFullHeightOnKeyboard, activeSearchable, insets.bottom]);

  useEffect(() => {
    return () => {
      if (mt5ConfigSwapRevealCancelRef.current !== null) {
        mt5ConfigSwapRevealCancelRef.current();
        mt5ConfigSwapRevealCancelRef.current = null;
      }
      if (mt5ConfigSwapAnimationCancelRef.current !== null) {
        mt5ConfigSwapAnimationCancelRef.current();
        mt5ConfigSwapAnimationCancelRef.current = null;
      }
      if (pendingActionCancelRef.current) {
        pendingActionCancelRef.current();
        pendingActionCancelRef.current = null;
      }
      pendingActionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissActionSheet();
      return true;
    });

    return () => subscription.remove();
  }, [dismissActionSheet, visible]);

  useEffect(() => {
    if (!visible) {
      // A hidden-render passive effect can be queued before retained adoption
      // and run after the newer visible layout commit. Never let that stale
      // close work erase the already-adopted sheet.
      if (reactVisibleRef.current) {
        return;
      }
      if (!mounted) {
        return;
      }

      // Preserve a committed retained reveal BEFORE any imperative host hide.
      // Fixed searchable sheets use immediateHostHideOnClose + retained open;
      // wiping the committed snapshot here left a layout "shrink" with no sheet.
      const retainedSnapshot = getRetainedActionSheetVisualSnapshot();
      if (
        retainedSnapshot.mode === 'committed' &&
        retainedSnapshot.visualKey === activeVisualKey &&
        applyRetainedVisualSnapshot(retainedSnapshot)
      ) {
        return;
      }

      if (activeEntryMotion === 'mt5Slide' || activeImmediateHostHideOnClose) {
        // MT5/Quotes dismissal already happens in the visibility-edge layout
        // effect (and synchronously in direct dismiss handlers). Repeating the
        // native host hide from this stale passive render can arrive after the
        // next open has begun, producing a disappear-then-pop frame sequence.
        setKeyboardHeight(0);
        hasMeasuredOverlayRef.current = false;
        return;
      }

      if (!closeAnimationRunningRef.current) {
        overlayOpacity.stopAnimation();
        sheetTranslateY.stopAnimation();
        overlayOpacity.setValue(0);
        sheetTranslateY.setValue(80);
        setVisibilityBarrierNow(false);
        return;
      }

      // Non-MT5 sheets keep their existing compact close animation. Quotes and
      // other MT5-style sheets returned through the direct-hide branch above.
      startActionSheetExitAnimation({
        instantOpen: activeInstantOpen,
        overlayOpacity,
        sheetTranslateY,
        onComplete: ({ finished }) => {
        if (finished && !prevVisibleRef.current) {
          closeAnimationRunningRef.current = false;
          setVisibilityBarrierNow(false);
          setMounted(ACTION_SHEET_KEEP_HOST_MOUNTED);
          setKeyboardHeight(0);
          // Render the latest hidden preload only after the outgoing sheet is
          // fully transparent, ready for the next press without a close flash.
          refreshHiddenConfig((revision) => revision + 1);
        }
        },
      });
      return;
      }

      // This passive effect may have been queued by the final visible/search
      // render and execute after a newer hidden layout commit. Never let that
      // stale effect restart the MT5 entry animation after selection closed it.
      if (!reactVisibleRef.current) {
        return;
      }

      setMounted(true);
    if (retainedAdoptionVisualKeyRef.current === activeVisualKey) {
      // The native MT5-style animation already started in the accepted press
      // turn. React is only adopting ownership; do not restart or snap it.
      retainedAdoptionVisualKeyRef.current = null;
      entryAnimationStartedForOpenRef.current = true;
      return;
    }
    if (
      activeEntryMotion === 'mt5Slide'
      && mt5ConfigSwapAnimationPendingRef.current
    ) {
      // A parked config swap owns its two-phase release in the layout path.
      // Starting again from this passive effect exposes the old final pose,
      // hides it, then produces a second slide in the next frame.
      return;
    }
    if (entryAnimationStartedForOpenRef.current) {
      return;
    }
    entryAnimationStartedForOpenRef.current = true;
    overlayOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();

    runEntryAnimation(activeEntryMotion);

    return () => { };
  }, [
    activeEntryMotion,
    activeImmediateHostHideOnClose,
    activeInstantOpen,
    activeVisualKey,
    applyRetainedVisualSnapshot,
    hideMt5ActionSheetNow,
    mounted,
    overlayOpacity,
    resolveMt5EntryTranslateY,
    runEntryAnimation,
    setVisibilityBarrierNow,
    sheetTranslateY,
    visible,
  ]);

  useEffect(() => {
    if (visible || !pendingActionRef.current) {
      return;
    }

    const action = pendingActionRef.current;
    pendingActionRef.current = null;

    pendingActionCancelRef.current = scheduleDismissSettledAction(() => {
      pendingActionCancelRef.current = null;
      action?.();
    });
  }, [visible]);

  const handleActionPress = useCallback((
    actionPress?: () => void,
    deferCloseCommitForVisualHandoff = false,
  ) => {
    if (pendingActionCancelRef.current) {
      pendingActionCancelRef.current();
      pendingActionCancelRef.current = null;
    }

    if (!activeRunActionAfterClose) {
      pendingActionRef.current = null;
      hideMt5ActionSheetHostNow();
      try {
        actionPress?.();
      } finally {
        // The destination is published immediately after one host mutation.
        // Finish native/controller cleanup afterward, then reconcile React.
        hideMt5ActionSheetNow();
        if (deferCloseCommitForVisualHandoff) {
          pendingActionCancelRef.current = scheduleActionSheetVisualHandoffCloseCommit(() => {
            pendingActionCancelRef.current = null;
            onClose();
          });
        } else {
          onClose();
        }
      }
      return;
    }

    pendingActionRef.current = actionPress ?? null;
    onClose();
  }, [
    activeRunActionAfterClose,
    hideMt5ActionSheetHostNow,
    hideMt5ActionSheetNow,
    onClose,
  ]);

  const recordActionRowPressStart = useCallback((event: GestureResponderEvent) => {
    actionPressGestureRef.current = {
      start: getActionSheetPressPoint(event),
      cancelled: false,
    };
  }, []);

  const cancelActionRowPressForScroll = useCallback(() => {
    actionPressGestureRef.current = {
      ...actionPressGestureRef.current,
      cancelled: true,
    };
  }, []);

  const recordActionRowPressMove = useCallback((event: GestureResponderEvent) => {
    const gesture = actionPressGestureRef.current;
    if (!gesture.start || gesture.cancelled) {
      return;
    }

    if (hasActionSheetPressMovedBeyondThreshold(gesture.start, getActionSheetPressPoint(event))) {
      actionPressGestureRef.current = {
        ...gesture,
        cancelled: true,
      };
    }
  }, []);

  const handleActionRowPress = useCallback((
    actionPress?: () => void,
    deferCloseCommitForVisualHandoff = false,
  ) => {
    const gesture = actionPressGestureRef.current;
    actionPressGestureRef.current = {
      start: null,
      cancelled: false,
    };

    if (gesture.cancelled) {
      return;
    }

    handleActionPress(actionPress, deferCloseCommitForVisualHandoff);
  }, [handleActionPress]);

  const handleBackdropPress = useCallback(() => {
    if (Date.now() - openedAtRef.current < ACTION_SHEET_BACKDROP_OPEN_GUARD_MS) {
      return;
    }
    dismissActionSheet();
  }, [dismissActionSheet]);

  const keyAction = useCallback(
    (action: ActionSheetAction, index: number) => `${action.label}-${index}`,
    [],
  );

  const renderActionRow = useCallback((action: ActionSheetAction) => {
    const localizedLabel = t(action.label);
    // A selected option represents the currently-active state, so it renders as
    // disabled (greyed, non-tappable) across every action sheet — you can't
    // re-select what's already active; you tap one of the other options.
    const isActiveDisabled = action.disabled || action.selected === true;
    const isVisuallyMuted = isActiveDisabled || action.muted === true;
    const activateInlineActionOnTouchStart =
      isMt5PlainPresentation &&
      shouldRenderInlineActions &&
      action.activateOnPressIn === true &&
      !isActiveDisabled;
    return (
      <FastPressable
        latencyLabel={`actionSheet.${action.label}`}
        onPressIn={activateInlineActionOnTouchStart ? undefined : recordActionRowPressStart}
        onTouchMove={activateInlineActionOnTouchStart ? undefined : recordActionRowPressMove}
        onPress={isActiveDisabled ? undefined : () => handleActionRowPress(
          action.onPress,
          action.deferCloseCommitForVisualHandoff,
        )}
        activateOnPressIn={action.activateOnPressIn === true && !isActiveDisabled && !activateInlineActionOnTouchStart}
        activateOnTouchStart={activateInlineActionOnTouchStart}
        disabled={isActiveDisabled}
        style={({ pressed }) => [
          styles.action,
          wrapActionText && { paddingVertical: 8 },
          isMt5PlainPresentation && styles.actionMt5Plain,
          action.danger && !isMt5PlainPresentation && styles.actionDanger,
          action.subtitle && styles.actionWithSubtitle,
          pressed && !isActiveDisabled && (isMt5PlainPresentation ? styles.actionPressedMt5Plain : styles.actionPressed),
          isActiveDisabled && (isMt5PlainPresentation ? styles.actionDisabledMt5Plain : styles.actionDisabled),
        ]}
      >
        <View style={styles.actionLeft}>
          {action.icon && (!isMt5PlainPresentation || activeShowActionIcons) ? (
            <View style={styles.iconWrap}>{action.icon}</View>
          ) : null}
          <View style={styles.actionTextBlock}>
            <Text
              style={[
                styles.actionText,
                isMt5PlainPresentation && styles.actionTextMt5Plain,
                activeCompactText && styles.actionTextCompact,
                action.danger
                  ? styles.actionTextDanger
                  : (isMt5PlainPresentation ? styles.actionTextNormalMt5Plain : styles.actionTextNormal),
                action.textColor && !isVisuallyMuted && { color: action.textColor },
                action.textFontWeight && !isVisuallyMuted && { fontWeight: action.textFontWeight },
                isVisuallyMuted && (
                  isMt5PlainPresentation ? styles.actionTextDisabledMt5Plain : styles.actionTextDisabled
                ),
              ]}
              numberOfLines={wrapActionText ? undefined : 1}
            >
              {localizedLabel}
            </Text>
            {action.subtitle ? (
              <Text
                style={[
                  styles.actionSubtitle,
                  activeCompactText && styles.actionSubtitleCompact,
                  isVisuallyMuted && styles.actionTextDisabled,
                ]}
                numberOfLines={wrapActionText ? undefined : 1}
              >
                {action.subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </FastPressable>
    );
  }, [
    handleActionRowPress,
    activeShowActionIcons,
    isMt5PlainPresentation,
    activeCompactText,
    recordActionRowPressMove,
    recordActionRowPressStart,
    shouldRenderInlineActions,
    wrapActionText,
    styles,
    t,
  ]);

  const renderAction = useCallback(
    ({ item: action, index }: { item: ActionSheetAction; index: number }) =>
      renderActionRow(action),
    [renderActionRow],
  );

  const renderTimeframeGridAction = useCallback((action: ActionSheetAction) => {
    const localizedLabel = t(action.label);
    const isSelected = action.selected === true;
    const isDisabled = action.disabled || isSelected;

    return (
      <FastPressable
        key={action.label}
        latencyLabel={`actionSheet.timeframe.${action.label}`}
        onPressIn={recordActionRowPressStart}
        onTouchMove={recordActionRowPressMove}
        onPress={isDisabled ? undefined : () => handleActionRowPress(
          action.onPress,
          action.deferCloseCommitForVisualHandoff,
        )}
        activateOnPressIn={action.activateOnPressIn === true && !isDisabled}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.timeframeGridAction,
          pressed && !isDisabled && styles.timeframeGridActionPressed,
          isSelected && styles.timeframeGridActionSelected,
          action.disabled && styles.timeframeGridActionDisabled,
        ]}
      >
        <Text
          style={[
            styles.timeframeGridText,
            isSelected && styles.timeframeGridTextSelected,
            action.disabled && styles.timeframeGridTextDisabled,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {localizedLabel}
        </Text>
      </FastPressable>
    );
  }, [
    handleActionRowPress,
    recordActionRowPressMove,
    recordActionRowPressStart,
    styles,
    t,
  ]);

  const inlineActionRows = useMemo(
    () =>
      shouldRenderInlineActions
        ? filteredActions.map((action, index) => (
          <React.Fragment key={keyAction(action, index)}>
            {renderActionRow(action)}
          </React.Fragment>
        ))
        : null,
    [filteredActions, keyAction, renderActionRow, shouldRenderInlineActions],
  );

  const timeframeGridActions = useMemo(
    () =>
      isTimeframeGridPresentation
        ? filteredActions.map((action) => renderTimeframeGridAction(action))
        : null,
    [filteredActions, isTimeframeGridPresentation, renderTimeframeGridAction],
  );

  if (!visible && !mounted) {
    return null;
  }

  // Standard sheets keep the existing React Native Animated path. MT5 sheets
  // use a UI-runtime wrapper below so Android never detaches back to a stale
  // offscreen JS value at the end of the animation.
  const sheetBodyTranslateY = activeEntryMotion === 'instant' || activeEntryMotion === 'mt5Slide'
    ? 0
    : sheetTranslateY;

  // No fixed height on Android: instant sheets start from the visible window
  // height and then ratchet upward from real layout. The sheet body paints on
  // the first frame so opening never looks like a late resize.
  const sheetChrome = (
    <View>
        {isMt5StylePresentation ? null : <View style={styles.handle} />}

        {activeTitle ? (
          <View
            style={[
              styles.titleContainer,
              isMt5StylePresentation && styles.titleContainerMt5Plain,
              isTitleCentered && styles.titleContainerCentered,
            ]}
          >
            {activeTitle.includes(': ') ? (
              <Text
                style={[
                  isMt5StylePresentation && styles.titleTextMt5Plain,
                  isTitleCentered && styles.titleTextCentered,
                ]}
                numberOfLines={1}
              >
                <Text
                  style={[
                    styles.titlePrefix,
                    isMt5StylePresentation && styles.titlePrefixMt5Plain,
                    activeCompactText && styles.titlePrefixCompact,
                    isTitleCentered && styles.titleTextCentered,
                  ]}
                >
                  {t(activeTitle.split(': ')[0])}
                </Text>
                <Text
                  style={[
                    styles.titleSuffix,
                    isMt5StylePresentation && styles.titleSuffixMt5Plain,
                    activeCompactText && styles.titleSuffixCompact,
                    isTitleCentered && styles.titleTextCentered,
                  ]}
                >
                  : {activeTitle.split(': ')[1]}
                </Text>
              </Text>
            ) : (
              <Text
                style={[
                  styles.titlePrefix,
                  isMt5StylePresentation && styles.titlePrefixMt5Plain,
                  activeCompactText && styles.titlePrefixCompact,
                  isTitleCentered && styles.titleTextCentered,
                ]}
                numberOfLines={1}
              >
                {t(activeTitle)}
              </Text>
            )}
          </View>
        ) : isMt5StylePresentation ? null : (
          <View style={{ height: 16 }} />
        )}

        {activeSearchable ? (
          <View style={[styles.searchContainer, { height: Math.max(40, Math.ceil(22 * fontScale + 16)) }]}>
            <Ionicons name="search" size={16} color={T.textSub} style={{ marginRight: 8 }} />
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, activeCompactText && styles.searchInputCompact, { outlineStyle: 'none' } as any]}
              placeholder={t(activeSearchPlaceholder ?? 'Search symbol...')}
              placeholderTextColor={T.textMuted}
              value={query}
              onChangeText={handleSearchQueryChange}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
        ) : null}
    </View>
  );

  const sheetBody = (
    <Animated.View
      ref={sheetBodyRef}
      collapsable={false}
      onLayout={handleSheetBodyLayout}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.sheetContainer,
        {
          opacity: 1,
          transform: [{ translateY: sheetBodyTranslateY }],
        },
      ]}
    >
      <View
        style={[
          styles.sheet,
          { paddingLeft: insets.left, paddingRight: insets.right },
          isMt5StylePresentation && styles.sheetMt5Plain,
          isTimeframeGridPresentation && styles.sheetTimeframeGrid,
          sheetHeightStyle,
          !shouldLockSheetHeight && sheetMinHeight ? { minHeight: sheetMinHeight } : null,
          sheetBottomSafePad > 0 ? { paddingBottom: sheetBottomSafePad } : null,
        ]}
      >
        {!scrollSheetChrome ? sheetChrome : null}

        {isTimeframeGridPresentation ? (
          <ScrollView
            style={[
              styles.actionsScroll,
              { maxHeight: scrollSheetChrome ? Math.max(0, sheetMaxHeight - sheetBottomSafePad) : actionsMaxHeight },
              actionsMinHeight ? { minHeight: actionsMinHeight } : null,
            ]}
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'}
            nestedScrollEnabled
          >
            {scrollSheetChrome ? sheetChrome : null}
            <View style={styles.timeframeGrid}>{timeframeGridActions}</View>
          </ScrollView>
        ) : shouldRenderInlineActions ? (
          <View
            style={[
              styles.actionsScroll,
              styles.actionsContent,
              isMt5PlainPresentation ? styles.actionsContentMt5Plain : null,
              sheetFloorMinHeight ? styles.actionsContentLarge : null,
              { maxHeight: actionsMaxHeight },
              actionsMinHeight ? { minHeight: actionsMinHeight } : null,
            ]}
          >
            {inlineActionRows}
          </View>
        ) : (
          <FlatList
            ref={actionListRef}
            key={deferredActionListKey}
            style={[
              styles.actionsScroll,
              actionListSizeStyle,
            ]}
            data={filteredActions}
            ListHeaderComponent={scrollSheetChrome ? sheetChrome : null}
            keyExtractor={keyAction}
            renderItem={renderAction}
            contentContainerStyle={[
              styles.actionsContent,
              isMt5PlainPresentation ? styles.actionsContentMt5Plain : null,
              fixedSheetKeyboardPadding > 0 ? { paddingBottom: actionsContentExtraHeight + fixedSheetKeyboardPadding } : null,
              // flexGrow on a scrollable list content container can pin the
              // content height to the viewport and hide remaining rows.
              !actionListNeedsScroll && sheetFloorMinHeight
                ? styles.actionsContentLarge
                : null,
            ]}
            showsVerticalScrollIndicator={actionListNeedsScroll}
            bounces={actionListNeedsScroll}
            scrollEnabled
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            nestedScrollEnabled
            onScrollBeginDrag={cancelActionRowPressForScroll}
            onMomentumScrollBegin={cancelActionRowPressForScroll}
            // Clipping + tiny windowSize blanks rows while scrolling deferred
            // catalogs (Drawing Tools, Symbol Picker) on Android.
            removeClippedSubviews={
              Platform.OS === 'android'
              && !activeDeferOffscreenActions
              && !hasVariableActionRowHeights
            }
            initialNumToRender={initialActionRowsToRender}
            maxToRenderPerBatch={actionListMaxToRenderPerBatch}
            updateCellsBatchingPeriod={16}
            windowSize={actionListWindowSize}
            getItemLayout={hasVariableActionRowHeights || scrollSheetChrome
              ? undefined
              : (_data, index) => ({
                length: uniformActionRowHeight,
                offset: uniformActionRowHeight * index,
                index,
              })}
            scrollEventThrottle={16}
          />
        )}
      </View>
      {/* Fill only keyboard lift that was not already handled by the native layout. */}
      {/* Matches the sheet background so there is no seam below it. */}
      <View
        style={{
          width: '100%',
          height: bottomSpacerHeight,
          backgroundColor: isDark ? T.bg : T.glass2,
        }}
      />
    </Animated.View>
  );
  const renderedSheetBody = activeEntryMotion === 'mt5Slide' ? (
    <Reanimated.View style={[styles.sheetContainer, mt5SheetBodyAnimatedStyle]}>
      {sheetBody}
    </Reanimated.View>
  ) : sheetBody;
  const retainedSnapshotAtRender = getRetainedActionSheetVisualSnapshot();
  const retainedCommitOwnsHost =
    retainedSnapshotAtRender.mode === 'committed'
    && retainedSnapshotAtRender.visualKey === activeVisualKey;
  const visibilityBarrierOpen = resolveActionSheetVisibilityBarrierOpen({
    visible,
    hiddenImperatively: hostHiddenImperativelyRef.current,
    configSwapParked: mt5ConfigSwapHostParkedRef.current,
    startingClose: isStartingClose,
    retainedCommitOwnsHost,
  });

  return (
    <View
      ref={visibilityBarrierRef}
      collapsable={false}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        actionSheetHostStyles.visibilityBarrier,
        { opacity: visibilityBarrierOpen ? 1 : 0 },
      ]}
      testID="global-action-sheet-visibility-barrier"
    >
      <Animated.View
        ref={overlayLayerRef}
        collapsable={false}
        pointerEvents={visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.overlay,
          isMt5StylePresentation ? styles.overlayMt5Plain : null,
          isMt5StylePresentation
            ? {
              // Keep the MT5 parent composited except for explicit close/config
              // barriers. Those barriers remain transparent until the child is
              // parked, preventing both stale close pixels and cached-open flash.
              opacity: activeEntryMotion === 'mt5Slide'
                ? (
                  mt5ConfigSwapHostParkedRef.current || hostHiddenImperativelyRef.current
                    ? 0
                    : 1
                )
                : (visible ? 1 : 0),
            }
            : { opacity: overlayOpacity },
        ]}
        onLayout={handleOverlayLayout}
      >
        {isMt5StylePresentation ? (
          activeEntryMotion === 'mt5Slide' ? (
            <Reanimated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                styles.backdropMt5Plain,
                mt5BackdropAnimatedStyle,
              ]}
            />
          ) : (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                styles.backdropMt5Plain,
                { opacity: overlayOpacity },
              ]}
            />
          )
        ) : null}
        <FastPressable
          style={[
            StyleSheet.absoluteFillObject,
            styles.backdrop,
            isMt5StylePresentation ? null : styles.backdropDefault,
          ]}
          latencyLabel="actionSheet.dismissOverlay"
          onPress={handleBackdropPress}
          activateOnPressIn
        />

        {iosKeyboardAvoidanceEnabled ? (
          <KeyboardAvoidingView
            behavior="padding"
            // Searchable sheets only. Non-searchable menus (Quotes symbol tap)
            // use the plain host below so iOS cannot pad/collapse the sheet.
            enabled
            style={styles.sheetHost}
            pointerEvents="box-none"
          >
            <View style={styles.sheetHost} pointerEvents="box-none" onLayout={handleSheetHostLayout}>
              {renderedSheetBody}
            </View>
          </KeyboardAvoidingView>
        ) : (
          <View
            onLayout={handleSheetHostLayout}
            style={[
              styles.sheetHost,
              // "Stay still" mode: pin the host to the full (stable) height, top-
              // anchored, so it does NOT ride the overlay up as adjustResize
              // shrinks the window for the keyboard. The bottom-anchored sheet
              // therefore stays put and the keyboard overlays its lower part.
              keepFullHeightSheet
                ? { position: 'absolute' as const, top: 0, left: 0, right: 0, height: screenHeight }
                : null,
            ]}
            pointerEvents="box-none"
          >
            {renderedSheetBody}
          </View>
        )}
      </Animated.View>
    </View>
  );
}
