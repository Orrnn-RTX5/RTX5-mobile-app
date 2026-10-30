import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartTimeframeTransition } from './chartTimeframeTransition';

function harness(timeoutMs = 10_000) {
  const frames: Array<() => void> = [];
  const controller = createChartTimeframeTransition<string>(work => {
    frames.push(work);
    return () => { const i = frames.indexOf(work); if (i >= 0) frames.splice(i, 1); };
  }, timeoutMs);
  const commits: boolean[] = [];
  let resolveHistory!: (data: string) => void;
  let settlePaint!: (painted: boolean) => void;
  let prepared = 0;
  let current = true;
  const request = {
    isCurrent: () => current,
    activateCached: () => false,
    prepare: () => { prepared++; return new Promise<string>(resolve => { resolveHistory = resolve; }); },
    activatePrepared: (data: string, settle: (painted: boolean) => void) => {
      assert.equal(data, 'M5 history'); settlePaint = settle; return true;
    },
    commit: (activated: boolean) => { commits.push(activated); },
  };
  return { controller, request, commits, frames, get prepared() { return prepared; },
    resolve: (data: string) => resolveHistory(data), paint: (hit: boolean) => settlePaint(hit),
    invalidate: () => { current = false; } };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('timeframe dismissal gets a frame and cold history cannot commit before exact paint', async () => {
  const h = harness();
  h.controller.request(h.request);
  assert.equal(h.prepared, 0);
  h.frames.shift()!();
  await flush();
  assert.equal(h.prepared, 1);
  assert.deepEqual(h.commits, []);
  h.resolve('M5 history');
  await flush();
  assert.deepEqual(h.commits, []);
  h.paint(true);
  assert.deepEqual(h.commits, [true]);
  h.paint(true);
  assert.deepEqual(h.commits, [true]);
  h.controller.cancel();
});

test('warm timeframe paints without fetching or forcing a history refresh', () => {
  const h = harness();
  h.controller.request({ ...h.request, activateCached: settle => { settle(true); return true; } });
  h.frames.shift()!();
  assert.equal(h.prepared, 0);
  assert.deepEqual(h.commits, [true]);
  h.controller.cancel();
});

test('rapid reselection discards the previous timeframe history result', async () => {
  const h = harness();
  h.controller.request(h.request);
  h.frames.shift()!();
  await flush();
  h.controller.request({ ...h.request, activateCached: settle => { settle(true); return true; } });
  h.frames.shift()!();
  h.resolve('M5 history');
  await flush();
  assert.deepEqual(h.commits, [true]);
  h.controller.cancel();
});

test('blur, account change, or WebView loss rejects a prepared timeframe', async () => {
  const h = harness();
  h.controller.request(h.request);
  h.frames.shift()!();
  await flush();
  h.invalidate();
  h.resolve('M5 history');
  await flush();
  assert.deepEqual(h.commits, []);
  h.controller.cancel();
});

test('paint timeout commits normal error/retry path and ignores late activation', async () => {
  const h = harness(5);
  h.controller.request(h.request);
  h.frames.shift()!();
  await flush();
  h.resolve('M5 history');
  await flush();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual(h.commits, [false]);
  h.paint(true);
  assert.deepEqual(h.commits, [false]);
  h.controller.cancel();
});

test('warm cache miss falls back to prepared history rather than a loading commit', async () => {
  const h = harness();
  h.controller.request({ ...h.request, activateCached: settle => { settle(false); return true; } });
  h.frames.shift()!();
  await flush();
  assert.equal(h.prepared, 1);
  assert.deepEqual(h.commits, []);
  h.resolve('M5 history');
  await flush();
  h.paint(true);
  assert.deepEqual(h.commits, [true]);
  h.controller.cancel();
});

test('preparation and bridge exceptions reach normal recovery without an unhandled rejection', async () => {
  for (const failure of ['fetch', 'paint']) {
    const h = harness();
    h.controller.request({
      ...h.request,
      prepare: () => failure === 'fetch' ? Promise.reject(new Error('offline')) : Promise.resolve('M5 history'),
      activatePrepared: () => { throw new Error('renderer gone'); },
    });
    h.frames.shift()!();
    await flush();
    await flush();
    assert.deepEqual(h.commits, [false]);
    h.controller.cancel();
  }
});
