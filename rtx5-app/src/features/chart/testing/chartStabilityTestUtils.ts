import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  isStructurallyValidCandle,
  normalizeSymbol,
  sortAndDedupeCandles,
} from '../../../domain/candles/core/candles';
import type { CandlePriceBasis, TrustedHistoryCandle } from '../../../domain/candles/core/candleProvenance';
import type { Candle } from '../../../state/tradingState';

export type CandleOverrides = Partial<Candle> & Record<string, unknown>;

export type MockHistoryRequest = {
  symbol: string;
  timeframe: string;
  limit?: number;
  from?: number;
  to?: number;
};

export type MockQuoteTick = {
  symbol: string;
  bid?: number;
  ask?: number;
  last?: number;
  timestamp: number;
};

type MockRestResponse =
  | { type: 'history'; candles: Candle[] }
  | { type: 'failure'; error: Error };

type MockQuoteListener = (tick: MockQuoteTick) => void;

export type BackendLiveCandle = Candle & {
  source: 'live_candle';
  closed: false;
  serverTimeframe?: string;
};

export const makeCandle = (
  time: number,
  overrides: CandleOverrides = {},
): Candle => {
  const open = typeof overrides.open === 'number' ? overrides.open : 1.1;
  const close = typeof overrides.close === 'number' ? overrides.close : open;
  const high = typeof overrides.high === 'number' ? overrides.high : Math.max(open, close);
  const low = typeof overrides.low === 'number' ? overrides.low : Math.min(open, close);

  return {
    time,
    open,
    high,
    low,
    close,
    volume: typeof overrides.volume === 'number' ? overrides.volume : 10,
    ...overrides,
  };
};

export const makeTrustedHistoryCandle = (
  time: number,
  overrides: CandleOverrides & {
    priceBasis?: CandlePriceBasis;
    serverTimeframe?: string;
  } = {},
): TrustedHistoryCandle => ({
  ...makeCandle(time, overrides),
  source: 'rest',
  closed: true,
  priceBasis: overrides.priceBasis ?? 'bid',
  serverTimeframe: overrides.serverTimeframe ?? 'M1',
});

export const makeBackendLiveCandle = (
  time: number,
  overrides: CandleOverrides & {
    serverTimeframe?: string;
  } = {},
): BackendLiveCandle => ({
  ...makeCandle(time, overrides),
  source: 'live_candle',
  closed: false,
  ...(typeof overrides.serverTimeframe === 'string' ? { serverTimeframe: overrides.serverTimeframe } : {}),
});

export const assertNoDuplicateCandleTimes = (
  candles: readonly Pick<Candle, 'time'>[],
  label: string = 'candle series',
): void => {
  const seen = new Set<number>();
  for (const candle of candles) {
    assert.equal(
      seen.has(candle.time),
      false,
      `${label} contains duplicate candle time ${candle.time}`,
    );
    seen.add(candle.time);
  }
};

export const assertValidCandleSeries = (
  candles: readonly Candle[],
  label: string = 'candle series',
): void => {
  assertNoDuplicateCandleTimes(candles, label);

  let previousTime = -Infinity;
  candles.forEach((candle, index) => {
    assert.equal(
      isStructurallyValidCandle(candle),
      true,
      `${label}[${index}] has invalid OHLC`,
    );
    assert.ok(
      candle.time > previousTime,
      `${label}[${index}] is not strictly sorted by time`,
    );
    previousTime = candle.time;
  });
};

export const assertNoSplitHistoryLiveSeries = (
  historyCandles: readonly Candle[],
  liveCandles: readonly Candle[],
  _timeframe: string,
  label: string = 'history/live series',
): void => {
  assertNoDuplicateCandleTimes([...historyCandles, ...liveCandles], label);
};

export const cloneCandles = <TCandle extends Candle>(candles: readonly TCandle[]): TCandle[] =>
  candles.map((candle) => ({ ...candle }));

export class MockRestHistoryProvider {
  readonly requests: MockHistoryRequest[] = [];

  private readonly responses: MockRestResponse[] = [];

  queueHistory(candles: Candle[]): this {
    this.responses.push({ type: 'history', candles: cloneCandles(candles) });
    return this;
  }

  queueFailure(error: Error | string = new Error('mock REST failure')): this {
    this.responses.push({
      type: 'failure',
      error: typeof error === 'string' ? new Error(error) : error,
    });
    return this;
  }

  async fetchHistory(request: MockHistoryRequest): Promise<Candle[]> {
    this.requests.push({ ...request });
    const next = this.responses.shift();
    if (!next) {
      return [];
    }
    if (next.type === 'failure') {
      throw next.error;
    }
    return cloneCandles(next.candles);
  }
}

export class MockWebSocketQuoteStream {
  private readonly listenersBySymbol = new Map<string, Set<MockQuoteListener>>();

  private connected = true;

  subscribe(symbol: string, listener: MockQuoteListener): () => void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const listeners = this.listenersBySymbol.get(normalizedSymbol) ?? new Set<MockQuoteListener>();
    listeners.add(listener);
    this.listenersBySymbol.set(normalizedSymbol, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listenersBySymbol.delete(normalizedSymbol);
      }
    };
  }

  disconnect(): void {
    this.connected = false;
  }

  reconnect(): void {
    this.connected = true;
  }

  emit(tick: MockQuoteTick): number {
    if (!this.connected) {
      return 0;
    }

    const normalizedSymbol = normalizeSymbol(tick.symbol);
    const listeners = this.listenersBySymbol.get(normalizedSymbol);
    if (!listeners) {
      return 0;
    }

    const normalizedTick = { ...tick, symbol: normalizedSymbol };
    listeners.forEach((listener) => listener(normalizedTick));
    return listeners.size;
  }
}

export const materializeSortedSeries = (...series: readonly Candle[][]): Candle[] =>
  sortAndDedupeCandles(series.flat().map((candle) => ({ ...candle })));

export const readChartScreenSource = (): string => {
  const candidates = [
    resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'),
    resolve(process.cwd(), 'rtx5-app/src/features/chart/ChartScreen.native.tsx'),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(filePath, 'ChartScreen.native.tsx was not found from the test working directory');
  return readFileSync(filePath, 'utf8');
};

export const extractFunctionBody = (source: string, functionName: string): string => {
  const functionStart = source.indexOf(`function ${functionName}(`);
  assert.notEqual(functionStart, -1, `function ${functionName} was not found`);

  const openBrace = source.indexOf('{', functionStart);
  assert.notEqual(openBrace, -1, `function ${functionName} has no opening brace`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace + 1, index);
      }
    }
  }

  assert.fail(`function ${functionName} body was not closed`);
};

export const assertSourceContains = (
  source: string,
  pattern: RegExp,
  label: string,
): void => {
  assert.match(source, pattern, label);
};
