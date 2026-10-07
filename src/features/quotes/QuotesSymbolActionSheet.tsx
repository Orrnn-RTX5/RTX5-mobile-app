import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  executeOnUIRuntimeSync,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsDarkTheme } from '../../state/themeMode';
import { FastPressable } from '../../ui/components/FastPressable';
import { makeActionSheetStyles } from '../../ui/components/ActionSheet/styles';
import { useTheme } from '../../ui/theme/useTheme';

export type QuotesSymbolActionSheetAction = Readonly<{
  label: string;
  selected?: boolean;
  danger?: boolean;
  disabled?: boolean;
  activateOnPressIn?: boolean;
  onPress?: () => void;
}>;

export type QuotesSymbolActionSheetConfig = Readonly<{
  title: string;
  visualKey: string;
  actions: readonly QuotesSymbolActionSheetAction[];
  onClose?: () => void;
}>;

type QuotesSymbolActionSheetSnapshot = Readonly<{
  config: QuotesSymbolActionSheetConfig | null;
  revision: number;
  visible: boolean;
}>;

const QUOTES_SHEET_OPEN_BACKDROP_MS = 170;
const QUOTES_SHEET_OPEN_SURFACE_MS = 195;
const QUOTES_SHEET_CLOSE_MS = 150;
const QUOTES_SHEET_TITLE_HEIGHT = 64;
const QUOTES_SHEET_ROW_HEIGHT = 47;
const QUOTES_SHEET_ACTIONS_BOTTOM_PADDING = 8;

const listeners = new Set<() => void>();
let snapshot: QuotesSymbolActionSheetSnapshot = Object.freeze({
  config: null,
  revision: 0,
  visible: false,
});

const publishSnapshot = (next: QuotesSymbolActionSheetSnapshot) => {
  snapshot = Object.freeze(next);
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot;

const commitHidden = (revision: number) => {
  const current = snapshot;
  if (!current.visible || current.revision !== revision) {
    return false;
  }
  publishSnapshot({
    config: null,
    revision: current.revision + 1,
    visible: false,
  });
  current.config?.onClose?.();
  return true;
};

export function presentQuotesSymbolActionSheet(config: QuotesSymbolActionSheetConfig) {
  publishSnapshot({
    config,
    revision: snapshot.revision + 1,
    visible: true,
  });
}

export function hideQuotesSymbolActionSheet() {
  if (!snapshot.visible) {
    return false;
  }
  return commitHidden(snapshot.revision);
}

const writeHiddenValuesOnUI = (
  hostOpacity: SharedValue<number>,
  backdropOpacity: SharedValue<number>,
  sheetTranslateY: SharedValue<number>,
  entryTranslateY: number,
) => {
  executeOnUIRuntimeSync((
    host: SharedValue<number>,
    backdrop: SharedValue<number>,
    sheet: SharedValue<number>,
    entryY: number,
  ) => {
    'worklet';
    cancelAnimation(host);
    cancelAnimation(backdrop);
    cancelAnimation(sheet);
    host.value = 0;
    backdrop.value = 0;
    sheet.value = entryY;
  })(hostOpacity, backdropOpacity, sheetTranslateY, entryTranslateY);
};

const startOpenAnimationOnUI = (
  hostOpacity: SharedValue<number>,
  backdropOpacity: SharedValue<number>,
  sheetTranslateY: SharedValue<number>,
  entryTranslateY: number,
  reduceMotion: boolean,
) => {
  executeOnUIRuntimeSync((
    host: SharedValue<number>,
    backdrop: SharedValue<number>,
    sheet: SharedValue<number>,
    entryY: number,
    motionReduced: boolean,
  ) => {
    'worklet';
    cancelAnimation(host);
    cancelAnimation(backdrop);
    cancelAnimation(sheet);
    host.value = 1;
    if (motionReduced) {
      backdrop.value = 1;
      sheet.value = 0;
      return;
    }
    backdrop.value = 0;
    sheet.value = entryY;
    backdrop.value = withTiming(1, {
      duration: QUOTES_SHEET_OPEN_BACKDROP_MS,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    });
    sheet.value = withTiming(0, {
      duration: QUOTES_SHEET_OPEN_SURFACE_MS,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    });
  })(hostOpacity, backdropOpacity, sheetTranslateY, entryTranslateY, reduceMotion);
};

const startCloseAnimationOnUI = (
  hostOpacity: SharedValue<number>,
  backdropOpacity: SharedValue<number>,
  sheetTranslateY: SharedValue<number>,
  entryTranslateY: number,
  reduceMotion: boolean,
) => {
  executeOnUIRuntimeSync((
    host: SharedValue<number>,
    backdrop: SharedValue<number>,
    sheet: SharedValue<number>,
    entryY: number,
    motionReduced: boolean,
  ) => {
    'worklet';
    cancelAnimation(host);
    cancelAnimation(backdrop);
    cancelAnimation(sheet);
    if (motionReduced) {
      host.value = 0;
      backdrop.value = 0;
      sheet.value = entryY;
      return;
    }
    backdrop.value = withTiming(0, {
      duration: QUOTES_SHEET_CLOSE_MS,
      easing: ReanimatedEasing.in(ReanimatedEasing.quad),
    });
    sheet.value = withTiming(entryY, {
      duration: QUOTES_SHEET_CLOSE_MS,
      easing: ReanimatedEasing.in(ReanimatedEasing.quad),
    });
  })(hostOpacity, backdropOpacity, sheetTranslateY, entryTranslateY, reduceMotion);
};

/**
 * Quotes owns this host end-to-end. It deliberately bypasses the shared UI
 * store, shared sheet component, and retained-host visual controller.
 */
export const QuotesSymbolActionSheetHost = memo(function QuotesSymbolActionSheetHost() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const config = current.config;
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => makeActionSheetStyles(T, isDark), [T, isDark]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hostOpacity = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);
  const sheetTranslateY = useSharedValue(windowHeight);
  const actionCount = config?.actions.length ?? 0;
  const entryTranslateY = Math.min(
    windowHeight * 0.72,
    QUOTES_SHEET_TITLE_HEIGHT
      + actionCount * QUOTES_SHEET_ROW_HEIGHT
      + QUOTES_SHEET_ACTIONS_BOTTOM_PADDING
      + Math.max(insets.bottom, 8),
  );

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useLayoutEffect(() => {
    clearCloseTimer();
    if (!current.visible || !config) {
      writeHiddenValuesOnUI(
        hostOpacity,
        backdropOpacity,
        sheetTranslateY,
        entryTranslateY,
      );
      return;
    }
    startOpenAnimationOnUI(
      hostOpacity,
      backdropOpacity,
      sheetTranslateY,
      entryTranslateY,
      reduceMotion,
    );
  }, [
    backdropOpacity,
    clearCloseTimer,
    config,
    current.revision,
    current.visible,
    entryTranslateY,
    hostOpacity,
    reduceMotion,
    sheetTranslateY,
  ]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const finishAnimatedClose = useCallback(() => {
    if (!current.visible) {
      return;
    }
    const revision = current.revision;
    clearCloseTimer();
    startCloseAnimationOnUI(
      hostOpacity,
      backdropOpacity,
      sheetTranslateY,
      entryTranslateY,
      reduceMotion,
    );
    if (reduceMotion) {
      commitHidden(revision);
      return;
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      commitHidden(revision);
    }, QUOTES_SHEET_CLOSE_MS);
  }, [
    backdropOpacity,
    clearCloseTimer,
    current.revision,
    current.visible,
    entryTranslateY,
    hostOpacity,
    reduceMotion,
    sheetTranslateY,
  ]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!getSnapshot().visible) {
        return false;
      }
      finishAnimatedClose();
      return true;
    });
    return () => subscription.remove();
  }, [finishAnimatedClose]);

  const hideImmediately = useCallback(() => {
    writeHiddenValuesOnUI(
      hostOpacity,
      backdropOpacity,
      sheetTranslateY,
      entryTranslateY,
    );
  }, [backdropOpacity, entryTranslateY, hostOpacity, sheetTranslateY]);

  const runAction = useCallback((action: QuotesSymbolActionSheetAction) => {
    if (action.disabled || action.selected || !current.visible) {
      return;
    }
    const revision = current.revision;
    clearCloseTimer();
    hideImmediately();
    try {
      action.onPress?.();
    } finally {
      commitHidden(revision);
    }
  }, [clearCloseTimer, current.revision, current.visible, hideImmediately]);

  const hostStyle = useAnimatedStyle(() => ({
    opacity: hostOpacity.value,
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  return (
    <View
      pointerEvents={current.visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!current.visible}
      accessibilityViewIsModal={current.visible}
      importantForAccessibility={current.visible ? 'auto' : 'no-hide-descendants'}
      style={[localStyles.host, current.visible ? null : localStyles.hiddenHost]}
      testID="quotes-symbol-action-sheet-host"
    >
      <Reanimated.View
        pointerEvents={current.visible ? 'box-none' : 'none'}
        style={[localStyles.animatedHost, hostStyle]}
      >
        <Reanimated.View style={[StyleSheet.absoluteFillObject, backdropStyle]}>
          <FastPressable
            accessibilityLabel="Close symbol actions"
            activateOnPressIn
            latencyLabel="quotes.symbolSheet.backdrop.close"
            onPress={finishAnimatedClose}
            style={[StyleSheet.absoluteFillObject, styles.backdropMt5Plain]}
          />
        </Reanimated.View>

        <Reanimated.View
          pointerEvents={current.visible ? 'auto' : 'none'}
          style={[
            localStyles.sheetPosition,
            styles.sheet,
            styles.sheetMt5Plain,
            { paddingBottom: Math.max(insets.bottom, 8) },
            sheetStyle,
          ]}
        >
          {config ? (
            <>
              <View style={[styles.titleContainer, styles.titleContainerMt5Plain]}>
                <Text
                  numberOfLines={2}
                  style={[styles.titlePrefix, styles.titlePrefixMt5Plain, styles.titleTextMt5Plain]}
                >
                  {config.title}
                </Text>
              </View>
              <View style={styles.actionsContentMt5Plain}>
                {config.actions.map((action, index) => {
                  const disabled = action.disabled === true || action.selected === true;
                  return (
                    <FastPressable
                      key={`${config.visualKey}:${action.label}:${index}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled, selected: action.selected === true }}
                      activateOnTouchStart={action.activateOnPressIn === true && !disabled}
                      disabled={disabled}
                      latencyLabel={`quotes.symbolSheet.${action.label}`}
                      onPress={() => runAction(action)}
                      style={({ pressed }) => [
                        styles.action,
                        styles.actionMt5Plain,
                        pressed && !disabled && styles.actionPressedMt5Plain,
                        disabled && styles.actionDisabledMt5Plain,
                      ]}
                    >
                      <View style={styles.actionLeft}>
                        <View style={styles.actionTextBlock}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.actionText,
                              styles.actionTextMt5Plain,
                              action.danger
                                ? styles.actionTextDanger
                                : styles.actionTextNormalMt5Plain,
                              disabled && styles.actionTextDisabledMt5Plain,
                            ]}
                          >
                            {action.label}
                          </Text>
                        </View>
                      </View>
                    </FastPressable>
                  );
                })}
              </View>
            </>
          ) : null}
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
});

const localStyles = StyleSheet.create({
  animatedHost: {
    ...StyleSheet.absoluteFillObject,
  },
  hiddenHost: {
    // React owns this non-animated visibility barrier. Even if an interrupted
    // UI-thread animation restores stale child opacity after logical close,
    // no backdrop or sheet pixel can escape this transparent parent.
    opacity: 0,
  },
  host: {
    ...StyleSheet.absoluteFillObject,
    elevation: 10000,
    zIndex: 10000,
  },
  sheetPosition: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
