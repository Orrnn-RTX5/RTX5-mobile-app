import React, { memo, useCallback } from 'react';
import { interactionLifecycle, registerInteractionLifecycleHandler } from '../../utils/interactionLifecycle';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import {
  getInteractionNow,
  FAST_PRESS_GUARD_RESET_MS,
  scheduleActionLatencyCheck,
} from '../../utils/actionLatency';
import {
  recordAppActionJournalEvent,
  type TerminalJournalLevel,
  type TerminalJournalSource,
} from '../../state/terminalJournalState';

type FastPressCallback = (event: any) => void;
type FastPressableProps = Omit<
  PressableProps,
  | 'onLongPress'
  | 'onPress'
  | 'onPressIn'
  | 'onPressOut'
  | 'onResponderGrant'
  | 'onStartShouldSetResponder'
  | 'onTouchStart'
> & {
  onLongPress?: null | FastPressCallback;
  onPress?: null | FastPressCallback;
  onPressIn?: null | FastPressCallback;
  onPressOut?: null | FastPressCallback;
  onResponderGrant?: null | FastPressCallback;
  onStartShouldSetResponder?: null | ((event: FastPressEvent) => boolean);
  onTouchStart?: null | FastPressCallback;
  latencyLabel?: string;
  latencyBudgetMs?: number;
  journalActionLabel?: string;
  journalActionSource?: TerminalJournalSource;
  journalActionLevel?: TerminalJournalLevel;
  /**
   * When true, fires the `onPress` action at the earliest possible moment
   * (onPressIn) rather than waiting for the full press-release cycle.
   *
   * Uses Pressable internally (not raw View responder) so it correctly
   * negotiates touch ownership with ScrollView, GestureHandler, and other
   * gesture systems — avoiding the silent touch-drop bug on Android that
   * raw View responders cause inside scrollable containers.
   */
  activateOnPressIn?: boolean;
  /**
   * For non-scrollable toolbar/dropdown launchers that sit above native
   * surfaces, fire on the touch-down event before Pressability negotiates
   * the press. Do not use for scrollable list rows.
   */
  activateOnTouchStart?: boolean;
};
type FastPressEvent = GestureResponderEvent;

const DEFAULT_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 } as const;
const DEFAULT_PRESS_RETENTION_OFFSET = { top: 20, bottom: 20, left: 20, right: 20 } as const;

const normalizePressEvent = (event: FastPressEvent) => {
  const eventWithResponderControls = event as FastPressEvent & {
    preventDefault?: () => void;
    stopPropagation?: () => void;
  };
  eventWithResponderControls.stopPropagation ??= () => undefined;
  eventWithResponderControls.preventDefault ??= () => undefined;
  return eventWithResponderControls;
};

/**
 * Production-grade fast-touch button for React Native.
 *
 * Architecture:
 * - Always renders a Pressable (never a raw View) for reliable touch
 *   negotiation across all gesture contexts (ScrollView, GestureHandler).
 * - `unstable_pressDelay={0}` eliminates the ~130ms default press delay.
 * - `activateOnPressIn` fires the action on the first touch frame via
 *   onPressIn, then deduplicates the subsequent onPress with a ref guard.
 * - The ref guard auto-clears on onPressOut via a microtask (setTimeout 0)
 *   so cancelled gestures (scroll steal, responder termination) don't
 *   leave the guard stuck.
 * - Avoids useState for pressed visual state to eliminate re-render churn
 *   on every tap — the visual press feedback comes from Pressable's native
 *   `({ pressed })` style function which runs on the UI thread.
 */
export const FastPressable = memo(function FastPressable({
  onPress,
  onPressIn,
  onPressOut,
  onResponderGrant,
  onStartShouldSetResponder,
  onTouchStart,
  disabled,
  children,
  style,
  hitSlop,
  pressRetentionOffset,
  unstable_pressDelay,
  latencyLabel: explicitLatencyLabel,
  latencyBudgetMs,
  journalActionLabel,
  journalActionSource = 'Actions',
  journalActionLevel = 'info',
  activateOnPressIn = false,
  activateOnTouchStart = false,
  ...props
}: FastPressableProps) {
  // Guard ref: prevents the same tap from firing onPress twice when
  // activateOnPressIn already ran it during onPressIn.
  const handledOnPressInRef = React.useRef(false);
  const deliveredExplicitPressInRef = React.useRef(false);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callbacks change on every parent render whenever the parent passes an
  // inline arrow function (e.g. `onPressIn={() => doX(sym)}`). If the
  // underlying Pressable's `onPressIn` prop is re-bound on the same frame as a
  // touchdown, the touch event can land between the unbind and the rebind and
  // get dropped — that's the "tap sometimes does nothing" failure mode. We
  // hold every callback in a ref so the handlers passed to Pressable can stay
  // stable across renders.
  const onPressRef = React.useRef(onPress);
  const onPressInRef = React.useRef(onPressIn);
  const onPressOutRef = React.useRef(onPressOut);
  const onResponderGrantRef = React.useRef(onResponderGrant);
  const onStartShouldSetResponderRef = React.useRef(onStartShouldSetResponder);
  const onTouchStartRef = React.useRef(onTouchStart);
  const activateOnPressInRef = React.useRef(activateOnPressIn);
  const activateOnTouchStartRef = React.useRef(activateOnTouchStart);
  const disabledRef = React.useRef(disabled);
  // Unlabelled presses used to all report as `fastPress`, which made a slow
  // control impossible to find. Fall back to the control's own identity.
  const latencyLabel = explicitLatencyLabel
    ?? (typeof props.testID === 'string' && props.testID ? `fastPress:${props.testID}` : undefined)
    ?? (typeof props.accessibilityLabel === 'string' && props.accessibilityLabel
      ? `fastPress:${props.accessibilityLabel}`
      : 'fastPress');
  const latencyLabelRef = React.useRef(latencyLabel);
  const latencyBudgetMsRef = React.useRef(latencyBudgetMs);
  const journalActionLabelRef = React.useRef(journalActionLabel);
  const journalActionSourceRef = React.useRef(journalActionSource);
  const journalActionLevelRef = React.useRef(journalActionLevel);

  onPressRef.current = onPress;
  onPressInRef.current = onPressIn;
  onPressOutRef.current = onPressOut;
  onResponderGrantRef.current = onResponderGrant;
  onStartShouldSetResponderRef.current = onStartShouldSetResponder;
  onTouchStartRef.current = onTouchStart;
  activateOnPressInRef.current = activateOnPressIn;
  activateOnTouchStartRef.current = activateOnTouchStart;
  disabledRef.current = disabled;
  latencyLabelRef.current = latencyLabel;
  latencyBudgetMsRef.current = latencyBudgetMs;
  journalActionLabelRef.current = journalActionLabel;
  journalActionSourceRef.current = journalActionSource;
  journalActionLevelRef.current = journalActionLevel;

  const clearPressGuardTimer = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearPressGuardTimer, [clearPressGuardTimer]);

  React.useEffect(() => registerInteractionLifecycleHandler(() => {
    // App switching can terminate a touch without onPressOut/onPress. Its
    // deduplication guard must not swallow the first new gesture after resume.
    clearPressGuardTimer();
    handledOnPressInRef.current = false;
    deliveredExplicitPressInRef.current = false;
  }), [clearPressGuardTimer]);

  const runPressAction = useCallback((action: null | FastPressCallback | undefined, event: FastPressEvent) => {
    if (!action || !interactionLifecycle.isForeground()) return;
    const startedAtMs = getInteractionNow();
    const latencyLabel = latencyLabelRef.current;
    const latencyBudgetMs = latencyBudgetMsRef.current;
    const journalActionLabel = journalActionLabelRef.current;
    if (journalActionLabel) {
      recordAppActionJournalEvent({
        message: journalActionLabel,
        source: journalActionSourceRef.current,
        level: journalActionLevelRef.current,
      });
    }
    action(normalizePressEvent(event));
    scheduleActionLatencyCheck(latencyLabel, startedAtMs, latencyBudgetMs);
  }, []);

  const resetPressGuard = useCallback(() => {
    clearPressGuardTimer();
    resetTimerRef.current = setTimeout(() => {
      handledOnPressInRef.current = false;
      deliveredExplicitPressInRef.current = false;
      resetTimerRef.current = null;
    }, FAST_PRESS_GUARD_RESET_MS);
  }, [clearPressGuardTimer]);

  const handleStartShouldSetResponder = useCallback((event: FastPressEvent) => {
    const onStartShouldSetResponder = onStartShouldSetResponderRef.current;
    return Boolean(onStartShouldSetResponder?.(event));
  }, []);

  const handleResponderGrant = useCallback((event: FastPressEvent) => {
    if (onResponderGrantRef.current) {
      runPressAction(onResponderGrantRef.current, event);
    }
  }, [runPressAction]);

  const handleTouchStart = useCallback((event: FastPressEvent) => {
    const onTouchStart = onTouchStartRef.current;
    const onPress = onPressRef.current;
    const activateOnTouchStart = activateOnTouchStartRef.current;
    const pressAlreadyHandled = handledOnPressInRef.current;

    // Pressable withholds its press callbacks while disabled, but onTouchStart
    // reaches the host View untouched, so touch-start activation must honour
    // `disabled` itself (a disabled LOGIN otherwise still submits).
    if (disabledRef.current) {
      if (onTouchStart && onTouchStart !== onPress) {
        runPressAction(onTouchStart, event);
      }
      return;
    }

    if (onTouchStart) {
      runPressAction(onTouchStart, event);
    }
    if (activateOnTouchStart && onPress && !pressAlreadyHandled) {
      clearPressGuardTimer();
      handledOnPressInRef.current = true;
      if (onPress !== onTouchStart) {
        runPressAction(onPress, event);
      }
    }
  }, [clearPressGuardTimer, runPressAction]);

  const handlePressIn = useCallback((event: FastPressEvent) => {
    const onPressIn = onPressInRef.current;
    const onPress = onPressRef.current;
    const activateOnPressIn = activateOnPressInRef.current;
    const pressAlreadyHandled = handledOnPressInRef.current;
    if (onPressIn && (!pressAlreadyHandled || onPressIn !== onPress)) {
      deliveredExplicitPressInRef.current = true;
      runPressAction(onPressIn, event);
    }
    if (activateOnPressIn && onPress && !pressAlreadyHandled) {
      clearPressGuardTimer();
      handledOnPressInRef.current = true;
      if (onPress !== onPressIn) {
        runPressAction(onPress, event);
      }
    }
  }, [clearPressGuardTimer, runPressAction]);

  const handlePress = useCallback((event: FastPressEvent) => {
    // Skip if already fired during onPressIn
    if (handledOnPressInRef.current) {
      handledOnPressInRef.current = false;
      deliveredExplicitPressInRef.current = false;
      clearPressGuardTimer();
      return;
    }
    clearPressGuardTimer();
    const onPress = onPressRef.current;
    const onPressIn = onPressInRef.current;
    if (onPress) {
      runPressAction(onPress, event);
      deliveredExplicitPressInRef.current = false;
      return;
    }
    if (onPressIn && !deliveredExplicitPressInRef.current) {
      runPressAction(onPressIn, event);
    }
    deliveredExplicitPressInRef.current = false;
  }, [clearPressGuardTimer, runPressAction]);

  const handlePressOut = useCallback((event: FastPressEvent) => {
    if (onPressOutRef.current) {
      onPressOutRef.current(event);
    }
    if ((activateOnPressInRef.current || activateOnTouchStartRef.current) && handledOnPressInRef.current) {
      // Keep the guard briefly for successful taps where onPressOut precedes
      // onPress, then clear it for cancelled gestures that never emit onPress.
      resetPressGuard();
      return;
    }

    if (onPressInRef.current && !onPressRef.current) {
      resetPressGuard();
    }
  }, [resetPressGuard]);

  const needsPressInHandler = activateOnPressIn || Boolean(onPressIn);
  const needsPressHandler = Boolean(onPress) || Boolean(onPressIn);
  const needsTouchStartHandler = activateOnTouchStart || Boolean(onTouchStart);
  const needsPressOutHandler = Boolean(onPressOut) || activateOnPressIn || activateOnTouchStart || Boolean(onPressIn);

  return (
    <Pressable
      {...props}
      disabled={disabled}
      android_disableSound={props.android_disableSound ?? true}
      style={style}
      onStartShouldSetResponder={onStartShouldSetResponder ? handleStartShouldSetResponder : undefined}
      onResponderGrant={onResponderGrant ? handleResponderGrant : undefined}
      onTouchStart={needsTouchStartHandler ? handleTouchStart : undefined}
      onPressIn={needsPressInHandler ? handlePressIn : undefined}
      onPress={needsPressHandler ? handlePress : undefined}
      onPressOut={needsPressOutHandler ? handlePressOut : undefined}
      hitSlop={hitSlop ?? DEFAULT_HIT_SLOP}
      pressRetentionOffset={pressRetentionOffset ?? DEFAULT_PRESS_RETENTION_OFFSET}
      unstable_pressDelay={unstable_pressDelay ?? 0}
    >
      {children}
    </Pressable>
  );
});
