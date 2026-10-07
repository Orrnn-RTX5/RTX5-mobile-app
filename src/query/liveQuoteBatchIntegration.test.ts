import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { SymbolQuoteBatch } from './symbolQuoteBatch';
import { scheduleAfterVisualFrame } from '../utils/afterVisualFrame';
import { normalizeSymbol } from '../domain/symbols';
import { normalizeQuoteTickTimestampToMs } from '../api/ws/quoteTimestamp';
import { hasQuotePriceChange } from '../utils/quotePriceChange';
import { calculateQuoteSpreadPoints, resolveQuoteDisplayDigits } from '../utils/quoteSpread';
import { resolveBackendQuoteVolume } from '../utils/quoteVolume';
import {
  __resetActiveBrokerSessionForTests, activateBrokerSession, beginActiveBrokerSessionTransition,
  getActiveBrokerSessionProvenance, isActiveBrokerSessionProvenanceCurrent,
} from '../state/activeBrokerSession';
import { commitQuoteSnapshotIfSessionCurrent } from './quoteCommitProvenance';
import { resolveContextBoundLiveSymbolQuote } from './liveSymbolQuoteContext';

type Quote = { symbol: string; bid: number; ask: number; volume?: number };
type Tick = { symbol: string; bid: number; ask: number; receivedAt: number; volume?: number };
const source = readFileSync(resolve(process.cwd(), 'src/query/websocket.ts'), 'utf8').replace(/\r\n/g, '\n');
const fragment = (from: string, until: string) => {
  const start = source.indexOf(from);
  const end = source.indexOf(until, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
};

// Execute the production hooks and merger against a controlled socket and
// React host. Separate provenance tests cover the real session guard as well.
function mountQuoteHook(symbols: string[], single = false) {
  __resetActiveBrokerSessionForTests();
  const capture = activateBrokerSession(beginActiveBrokerSessionTransition(), {
    brokerId: 'broker-a', accountLogin: '1001', apiBase: 'https://services.broker-a.com/api/v2',
    feedWsBase: 'wss://services.broker-a.com/ws/feed', tradeWsBase: 'wss://services.broker-a.com/ws/v2',
    feedStatusUrl: 'https://services.broker-a.com/ws/feed/status', servicesDomain: 'services.broker-a.com',
    investor: false, configVersion: 'cfg-1',
  }, { accessToken: 'access-a', refreshToken: 'refresh-a', expiresAt: '2099-01-01T00:00:00.000Z' });
  const seed = Object.fromEntries(symbols.map(symbol => [symbol, Object.freeze({ symbol, bid: 1, ask: 2, volume: 7 })]));
  const listeners = new Map<string, (tick: Tick) => void>();
  const effects: Array<() => (() => void) | undefined> = [];
  const states: unknown[] = [];
  let writes = 0;
  let commits = 0;
  let restSubscriptions = 0;
  const react = {
    useRef: (value: unknown) => ({ current: value }),
    useMemo: (build: () => unknown) => build(),
    useCallback: (callback: unknown) => callback,
    useState: (initial: unknown) => {
      const index = states.length;
      states.push(typeof initial === 'function' ? initial() : initial);
      return [states[index], (update: unknown) => {
        const value = typeof update === 'function' ? update(states[index]) : update;
        if (!Object.is(value, states[index]) && index === 0) writes++;
        states[index] = value;
      }];
    },
    startTransition: (action: () => void) => action(),
  };
  class MeasuredBatch<T> extends SymbolQuoteBatch<T> {
    commit(previous: Record<string, T>) { commits++; return super.commit(previous); }
  }
  const exports: Record<string, (...args: unknown[]) => unknown> = {};
  const hookSource = fragment('const areQuoteSnapshotsEqual =', 'function useOrrnnDemoPublicLiveSymbolQuote') +
    (single
      ? fragment('export function useLiveSymbolQuote(', '/**\n * Multi-symbol sibling')
      : fragment('export function useLiveSymbolQuotes(', '/**\n * Hook to subscribe to live account'));
  runInNewContext(ts.transpileModule(hookSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports, React: react, useEffect: (effect: () => (() => void) | undefined) => effects.push(effect),
    SymbolQuoteBatch: MeasuredBatch, scheduleAfterVisualFrame, globalThis, setTimeout, clearTimeout,
    useUserPreferences: (selector: (state: object) => unknown) => selector({ isLoggedIn: true, brokerId: 'broker-a' }),
    useActiveBrokerQuerySession: () => capture.session, useActiveBrokerCredentialScopeKey: () => 'scope-a',
    getActiveBrokerSessionProvenance, isActiveBrokerSessionProvenanceCurrent, commitQuoteSnapshotIfSessionCurrent,
    normalizeSymbol, normalizeQuoteTickTimestampToMs, hasQuotePriceChange,
    calculateQuoteSpreadPoints, resolveQuoteDisplayDigits, resolveBackendQuoteVolume,
    resolveMergedQuoteSnapshot: (_symbol: string, quote: unknown) => quote,
    useTradingState: { getState: () => ({ quotes: seed }) },
    quotesWsService: { subscribeToSymbol: (symbol: string, listener: (tick: Tick) => void) => {
      listeners.set(symbol, listener); return () => { listeners.delete(symbol); };
    } },
    subscribeLiveSymbolRestQuoteFallback: () => { restSubscriptions++; return () => { restSubscriptions--; }; },
    deliverLiveSymbolTick: (listener: (tick: Tick) => void, tick: Tick) => listener(tick),
    pendingLiveSymbolTicks: new Map(), EMPTY_LIVE_QUOTES: Object.freeze({}), LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS: 16,
    LIVE_QUOTE_STALE_MS: 60_000, isOrrnnDemoPublicMarketSelection: () => false,
    useOrrnnDemoPublicLiveSymbolQuote: () => undefined, resolveContextBoundLiveSymbolQuote,
  });
  if (single) exports.useLiveSymbolQuote(symbols[0], true, 16);
  else exports.useLiveSymbolQuotes(symbols, true, 16);
  const cleanups = effects.map(effect => effect()).filter(Boolean) as Array<() => void>;
  writes = 0;
  return {
    tick: (symbol: string, bid: number, volume?: number) => listeners.get(symbol)?.({ symbol, bid, ask: bid + 1, volume, receivedAt: Date.now() }),
    get snapshot() { return states[0] as Record<string, Quote> & Quote; },
    get writes() { return writes; }, get commits() { return commits; },
    get subscriptionCount() { return listeners.size + restSubscriptions; },
    unmount: () => cleanups.splice(0).forEach(cleanup => cleanup()),
  };
}

test('the production multi-symbol hook batches 10,000 ticks and preserves earlier metadata and snapshots', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  const symbols = Array.from({ length: 100 }, (_, index) => `S${index}`);
  const hook = mountQuoteHook(symbols);
  try {
    const previous = hook.snapshot;
    hook.tick('S0', 2, 42);
    for (let index = 0; index < 10_000; index++) hook.tick(`S${index % 100}`, index + 3);
    assert.equal(frames.length, 1);
    assert.equal(hook.writes, 0);
    assert.equal(hook.commits, 0);
    frames[0](0);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(hook.writes, 1);
    assert.equal(hook.commits, 1);
    assert.equal(hook.snapshot.S99.bid, 10_002);
    assert.equal(hook.snapshot.S0.volume, 42, 'ticks within the batch merge into the newest pending snapshot');
    assert.equal(previous.S0.bid, 1);
    assert.equal(previous.S0.volume, 7);
  } finally { hook.unmount(); globalThis.requestAnimationFrame = originalFrame; }
});

test('both live quote hooks recover dropped frames without late updates after unmount', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  try {
    for (const single of [false, true]) {
      const hook = mountQuoteHook(['EURUSD'], single);
      try {
        hook.tick('EURUSD', 3);
        await new Promise(resolve => setTimeout(resolve, 130));
        assert.equal(single ? hook.snapshot.bid : hook.snapshot.EURUSD.bid, 3);
        assert.equal(hook.writes, 1);
        hook.tick('EURUSD', 4);
        hook.unmount();
        assert.equal(hook.subscriptionCount, 0);
        frames.forEach(frame => frame(0));
        await new Promise(resolve => setTimeout(resolve, 130));
        assert.equal(hook.writes, 1);
      } finally { hook.unmount(); }
    }
  } finally { globalThis.requestAnimationFrame = originalFrame; }
});

test('a queued multi-symbol update cannot cross an account session transition', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  let frame: FrameRequestCallback | undefined;
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  const hook = mountQuoteHook(['EURUSD']);
  try {
    const previous = hook.snapshot;
    hook.tick('EURUSD', 3);
    beginActiveBrokerSessionTransition();
    frame?.(0);
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(hook.snapshot, previous);
    assert.equal(hook.writes, 0);
    assert.equal(hook.commits, 0);
  } finally { hook.unmount(); globalThis.requestAnimationFrame = originalFrame; }
});
