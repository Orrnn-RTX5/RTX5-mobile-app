import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { scheduleAfterVisualFrame } from '../../../utils/afterVisualFrame';

function createParkedSheet() {
  const source = readFileSync(resolve(process.cwd(), 'src/ui/components/ActionSheet/ActionSheet.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('        if (mt5ConfigSwapRevealCancelRef.current === null) {');
  const end = source.indexOf("\n      }\n      if (activeEntryMotion === 'mt5Slide' && !retainedMt5RevealInFlight)", start);
  assert.ok(start >= 0 && end > start);
  const reveal = { current: null as (() => void) | null };
  const animation = { current: null as (() => void) | null };
  const visible = { current: true };
  const parked = { current: true };
  const pending = { current: true };
  let animations = 0;
  let reveals = 0;
  const open = runInNewContext(ts.transpileModule('() => {\n' + source.slice(start, end) + '\n};', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    scheduleAfterVisualFrame,
    mt5ConfigSwapRevealCancelRef: reveal, mt5ConfigSwapAnimationCancelRef: animation,
    reactVisibleRef: visible, mt5ConfigSwapHostParkedRef: parked, mt5ConfigSwapAnimationPendingRef: pending,
    retainedMt5RevealInFlight: false, entryAnimationStartedForOpenRef: { current: false },
    overlayLayerRef: { current: { setNativeProps: () => { reveals++; } } },
    setVisibilityBarrierNow() {}, refreshMt5ConfigSwapGuard() {},
    startActionSheetEntryAnimation: () => { animations++; },
    activeEntryMotion: 'mt5Slide', activeMt5SlideMotionProfile: 'standard',
    overlayOpacity: {}, sheetTranslateY: {}, mt5HostOpacity: {}, mt5OverlayOpacity: {}, mt5SheetTranslateY: {},
    resolveMt5EntryTranslateY: () => 400,
  }) as () => void;
  return { open, visible, parked, pending, reveal, animation, get animations() { return animations; }, get reveals() { return reveals; } };
}

for (const interruptSecondFrame of [false, true]) {
  test(`parked action sheet recovers if ${interruptSecondFrame ? 'animation' : 'parent reveal'} frame is interrupted`, async () => {
    const originalFrame = globalThis.requestAnimationFrame;
    const frames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    const sheet = createParkedSheet();
    try {
      sheet.open();
      if (interruptSecondFrame) {
        frames[0](0);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.equal(sheet.parked.current, false);
      assert.equal(sheet.pending.current, false);
      assert.equal(sheet.reveals, 1);
      assert.equal(sheet.animations, 1);
      frames.forEach(frame => frame(0));
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(sheet.animations, 1, 'late frames must not replay the opening animation');
    } finally {
      sheet.reveal.current?.(); sheet.animation.current?.();
      if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
      else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    }
  });
}

test('closing a parked sheet cancels recovery and prevents a late invisible touch blocker', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  let frame: FrameRequestCallback | undefined;
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  const sheet = createParkedSheet();
  try {
    sheet.open();
    sheet.visible.current = false;
    sheet.reveal.current?.(); sheet.animation.current?.();
    frame?.(0);
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(sheet.reveals, 0);
    assert.equal(sheet.animations, 0);
  } finally {
    sheet.reveal.current?.(); sheet.animation.current?.();
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});
