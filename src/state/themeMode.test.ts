import assert from 'node:assert/strict';
import test from 'node:test';
import {
  scheduleAfterImmediateThemePaint,
  setImmediateThemeMode,
  useThemeModeState,
} from './themeMode';

const waitForTimerTurn = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

test('an interrupted frame cannot strand retained themes or repeat preference work', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  let frame: FrameRequestCallback | undefined;
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  let writes = 0;
  try {
    setImmediateThemeMode('dark', { deferRetained: false });
    setImmediateThemeMode('light');
    scheduleAfterImmediateThemePaint(() => { writes++; });
    assert.equal(useThemeModeState.getState().retainedThemeMode, 'dark');
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(useThemeModeState.getState().retainedThemeMode, 'light');
    assert.equal(writes, 1);
    frame?.(0);
    await waitForTimerTurn();
    assert.equal(writes, 1);
  } finally {
    setImmediateThemeMode('dark', { deferRetained: false });
    globalThis.requestAnimationFrame = originalFrame;
  }
});

test('post-paint theme work settles the latest immediate and retained modes together', async () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const frameCallbacks: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = (callback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  };

  try {
    setImmediateThemeMode('dark', { deferRetained: false });
    scheduleAfterImmediateThemePaint(() => {
      setImmediateThemeMode('light');
    });

    assert.deepEqual(
      {
        immediate: useThemeModeState.getState().themeMode,
        retained: useThemeModeState.getState().retainedThemeMode,
      },
      { immediate: 'dark', retained: 'dark' },
    );
    assert.equal(frameCallbacks.length, 1);

    frameCallbacks.shift()?.(0);
    await waitForTimerTurn();

    assert.deepEqual(
      {
        immediate: useThemeModeState.getState().themeMode,
        retained: useThemeModeState.getState().retainedThemeMode,
      },
      { immediate: 'light', retained: 'light' },
    );
  } finally {
    setImmediateThemeMode('dark', { deferRetained: false });
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test('a rapid reversal cannot leave retained screens on the stale theme', async () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const frameCallbacks: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = (callback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  };

  try {
    setImmediateThemeMode('dark', { deferRetained: false });
    setImmediateThemeMode('light');
    scheduleAfterImmediateThemePaint(() => {
      setImmediateThemeMode('dark');
    });

    assert.equal(useThemeModeState.getState().themeMode, 'light');
    assert.equal(useThemeModeState.getState().retainedThemeMode, 'dark');
    assert.equal(frameCallbacks.length, 1);

    frameCallbacks.shift()?.(0);
    await waitForTimerTurn();

    assert.deepEqual(
      {
        immediate: useThemeModeState.getState().themeMode,
        retained: useThemeModeState.getState().retainedThemeMode,
      },
      { immediate: 'dark', retained: 'dark' },
    );
  } finally {
    setImmediateThemeMode('dark', { deferRetained: false });
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});
