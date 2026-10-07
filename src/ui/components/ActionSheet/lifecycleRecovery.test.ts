import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { scheduleAfterVisualFrame } from '../../../utils/afterVisualFrame';

test('backgrounding an opening/closing sheet cancels delayed actions and removes every touch barrier', async () => {
  const source = readFileSync('src/ui/components/ActionSheet/ActionSheet.tsx', 'utf8');
  const start = source.indexOf('  const resetActionSheetForLifecycle = useCallback');
  const end = source.indexOf('  useEffect(() => registerInteractionLifecycleHandler', start);
  assert.ok(start >= 0 && end > start);
  const originalFrame = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  const ref = <T>(current: T) => ({ current });
  let actions = 0; let reveals = 0; let closes = 0; let blurred = 0;
  const pending = ref<(() => void) | null>(() => { actions++; });
  const actionCancel = ref<(() => void) | null>(scheduleAfterVisualFrame(() => { actions++; }));
  const revealCancel = ref<(() => void) | null>(scheduleAfterVisualFrame(() => { reveals++; }));
  const animationCancel = ref<(() => void) | null>(scheduleAfterVisualFrame(() => { reveals++; }));
  const visible = ref(true); const parked = ref(true); const closing = ref(true);
  const owner = ref<unknown>({ visualKey: 'test', revision: 1 });
  const gesture = ref<unknown>({ start: { x: 1, y: 1 }, cancelled: false });
  const hostHidden = ref(false); let barrier = true; let keyboardHeight = 300;
  const overlay: Record<string, unknown> = { pointerEvents: 'auto' };
  const body: Record<string, unknown> = { pointerEvents: 'auto' };
  const animatedOverlay = { value: 1, stopAnimation() {}, setValue(value: number) { this.value = value; } };
  const translate = { ...animatedOverlay, value: 0 };
  const mt5Host = ref(1); const mt5Overlay = ref(1); const mt5Translate = ref(0);
  const reset = runInNewContext(ts.transpileModule(source.slice(start, end) + '\nresetActionSheetForLifecycle;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    useCallback: (callback: unknown) => callback, reactVisibleRef: visible, retainedVisualOwnerRef: owner,
    pendingActionCancelRef: actionCancel, pendingActionRef: pending, mt5ConfigSwapRevealCancelRef: revealCancel,
    mt5ConfigSwapAnimationCancelRef: animationCancel, mt5ConfigSwapAnimationPendingRef: ref(true),
    mt5ConfigSwapHostParkedRef: parked, retainedAdoptionVisualKeyRef: ref('test'), closeAnimationRunningRef: closing,
    mt5DismissCompletedRef: ref(false), entryAnimationStartedForOpenRef: ref(true), actionPressGestureRef: gesture,
    cancelRetainedActionSheetPreview() {}, overlayOpacity: animatedOverlay, sheetTranslateY: translate,
    resolveMt5EntryTranslateY: () => 400, mt5HostOpacity: mt5Host, mt5OverlayOpacity: mt5Overlay, mt5SheetTranslateY: mt5Translate,
    writeMt5ActionSheetValuesOnUI: (_host: unknown, _overlay: unknown, _translate: unknown, opacity: number, y: number) => {
      mt5Host.current = 0; mt5Overlay.current = opacity; mt5Translate.current = y;
    },
    overlayLayerRef: ref({ setNativeProps: (props: object) => Object.assign(overlay, props) }),
    sheetBodyRef: ref({ setNativeProps: (props: object) => Object.assign(body, props) }),
    setVisibilityBarrierNow: (value: boolean) => { barrier = value; }, hostHiddenImperativelyRef: hostHidden,
    searchInputRef: ref({ blur: () => { blurred++; } }), setKeyboardHeight: (value: number) => { keyboardHeight = value; },
    hasMeasuredOverlayRef: ref(true), onClose: () => { closes++; },
  }) as () => void;
  try {
    reset();
    assert.equal(visible.current, false); assert.equal(parked.current, false); assert.equal(closing.current, false);
    assert.equal(owner.current, null); assert.equal(pending.current, null);
    assert.equal(overlay.pointerEvents, 'none'); assert.equal(body.pointerEvents, 'none'); assert.equal(barrier, false);
    assert.equal(animatedOverlay.value, 0); assert.equal(translate.value, 400);
    assert.equal(mt5Overlay.current, 0); assert.equal(mt5Translate.current, 400); assert.equal(hostHidden.current, true);
    assert.equal(keyboardHeight, 0); assert.equal(blurred, 1); assert.equal(closes, 1);
    frames.forEach(frame => frame(0));
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(actions, 0, 'a deferred action from an interrupted gesture cannot execute after resume');
    assert.equal(reveals, 0, 'cancelled opening frames cannot recreate an invisible touch blocker');
    reset(); assert.equal(closes, 1, 'foreground recovery must not close the underlying page a second time');
  } finally {
    actionCancel.current?.(); revealCancel.current?.(); animationCancel.current?.();
    globalThis.requestAnimationFrame = originalFrame;
  }
});
