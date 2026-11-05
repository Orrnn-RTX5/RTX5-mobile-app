import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('src/ui/components/SidebarDrawer.tsx', 'utf8').replace(/\r\n/g, '\n');
const fragment = (from: string, until: string) => {
  const start = source.indexOf(from); const end = source.indexOf(until, start);
  assert.ok(start >= 0 && end > start); return source.slice(start, end);
};

test('an interrupted drawer close releases locks/overlays, and late completion cannot close a reopened menu', () => {
  const ref = <T>(current: T) => ({ current });
  const closing = ref(false); const visible = ref(true); const generation = ref(0);
  const locked = ref(true); const native: Record<string, unknown> = { pointerEvents: 'auto', style: { opacity: 1 } };
  let globalOpen = true; let interactive = true; let closeCalls = 0; let releases = 0; let cancellations = 0;
  const callbacks: Array<(result: { finished: boolean }) => void> = [];
  const slide = { value: 0, stopAnimation() {}, setValue(value: number) { this.value = value; } };
  const overlay = { ...slide, value: 1 };
  const code = [
    fragment('  const revealDrawerImmediately = useCallback', '  const showInteractiveAfterVisualFrame'),
    fragment('  const hideInteractiveNow = useCallback', '  useEffect(() => registerSidebarOpenHandler'),
    fragment('  const handleClose = useCallback', '  useEffect(() => {\n    const unsubscribe = useUIState.subscribe'),
    fragment('  const snapClosedForNavigation = useCallback', '  const closeForNavigation'),
    fragment('  const resetDrawerForLifecycle = useCallback', '  useEffect(() => registerInteractionLifecycleHandler'),
  ].join('\n') + '\n({ reset: resetDrawerForLifecycle, close: handleClose, reopen: revealDrawerImmediately });';
  const controller = runInNewContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    useCallback: (callback: unknown) => callback, clearTimeout,
    drawerAnimationGenerationRef: generation, animatedVisibleRef: visible, isClosingRef: closing,
    slideAnim: slide, overlayAnim: overlay, pauseLiveWorkForDrawer() {},
    cancelOpenCommitRef: ref(() => { cancellations++; }), interactiveGenerationRef: ref(0),
    containerRef: ref({ setNativeProps: (props: object) => Object.assign(native, props) }),
    setInteractive: (value: boolean) => { interactive = value; },
    invalidateSidebarOpenVisualWork() {}, navigationLockedRef: locked,
    navigationUnlockTimerRef: ref(null), liveWorkResumeTimerRef: ref(null),
    liveSnapshotPauseReleaseRef: ref(() => { releases++; }), liveSymbolPauseReleaseRef: ref(() => { releases++; }),
    onClose: () => { globalOpen = false; closeCalls++; }, scheduleLiveWorkResumeAfterClose() {},
    DRAWER_CLOSED_TRANSLATE_X: -312, DRAWER_CLOSE_ANIMATION_MS: 60, SIDEBAR_RECONNECT_DEFER_MS: 100,
    quotesWsService: { deferReconnectForInteraction() {} }, Easing: { out: (value: unknown) => value, cubic: 0 },
    Animated: { timing() {}, parallel: () => ({ start: (callback: (result: { finished: boolean }) => void) => callbacks.push(callback) }) },
  }) as { reset: () => void; close: () => void; reopen: () => void };
  controller.close();
  assert.equal(closing.current, true);
  assert.equal(interactive, true, 'React still owns an open drawer when the native callback is lost');
  controller.reset();
  assert.equal(closing.current, false); assert.equal(visible.current, false); assert.equal(locked.current, false);
  assert.equal(globalOpen, false); assert.equal(interactive, false);
  assert.equal(native.pointerEvents, 'none'); assert.equal(slide.value, -312); assert.equal(overlay.value, 0);
  assert.equal(releases, 2); assert.equal(cancellations, 1);
  controller.reset();
  assert.equal(releases, 2, 'owned pause tokens release once');
  const beforeReopen = closeCalls;
  controller.reopen();
  assert.equal(visible.current, true); assert.equal(slide.value, 0); assert.equal(overlay.value, 1);
  callbacks[0]({ finished: true });
  assert.equal(visible.current, true); assert.equal(closeCalls, beforeReopen, 'late close completion cannot close the new menu');
});
