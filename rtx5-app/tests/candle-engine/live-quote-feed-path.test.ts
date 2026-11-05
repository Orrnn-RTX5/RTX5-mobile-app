import assert from 'node:assert/strict';
import test from 'node:test';

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Reads either a single .ts module file or concatenates every .ts file in a
// module folder of the same name.
const readModuleSource = (relativePath: string): string => {
  const filePath = join(process.cwd(), `${relativePath}.ts`);
  const folderPath = join(process.cwd(), relativePath);
  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf8');
  }
  if (existsSync(folderPath) && statSync(folderPath).isDirectory()) {
    return readdirSync(folderPath)
      .filter((entry) => entry.endsWith('.ts'))
      .map((entry) => readFileSync(join(folderPath, entry), 'utf8'))
      .join('\n');
  }
  throw new Error(`module source not found: ${relativePath}`);
};

import {
  applyLiveCandleToCandleMap,
  applyQuoteTickExtensionToCandleMap,
} from '../../src/domain/candles/series/liveCandleAggregator';
import { createCandleMap, materializeCandleMap } from '../../src/domain/candles/series/candleSeriesMerger';
import { normalizeQuoteTickPayload } from '../../src/api/ws/quoteTickNormalizer';
import { buildChartSeriesSnapshot, getChartSeriesUpdateMode } from '../../src/features/chart/liveChartSync';
import { resolveVisibleSeriesMode, shouldSyncVisibleSeriesCache } from '../../src/domain/candles/ws/liveCandlesEnginePolicy';
import { makeTrustedHistoryCandle, secondsUtc } from '../support/candleTestUtils';

test('live quote payload normalizes bid ask data for active candle extension', () => {
  const payload = {
    symbol: 'XAUUSDm',
    bidPrice: '2300.10',
    askPrice: '2300.40',
    serverTime: secondsUtc(2024, 3, 22, 10, 3, 23),
  };

  const normalized = normalizeQuoteTickPayload(payload);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  assert.deepEqual(
    {
      symbol: normalized.update.symbol,
      bid: normalized.update.bid,
      ask: normalized.update.ask,
      timestamp: normalized.update.timestamp,
    },
    {
      symbol: 'XAUUSDM',
      bid: 2300.1,
      ask: 2300.4,
      timestamp: secondsUtc(2024, 3, 22, 10, 3, 23),
    },
  );
});

test('verified feed session high low metrics never become candle wick extremes', () => {
  const feedPayload = {
    symbol: 'XAUUSD',
    bid: 4553.38,
    ask: 4553.620000000001,
    daily_open: 4651.335,
    previous_close: 4651.335,
    session: {
      high_bid: 4665.37,
      low_bid: 4531.8,
      high_ask: 4665.6,
      low_ask: 4532.04,
    },
    time: secondsUtc(2026, 4, 15, 10, 28, 13),
  };
  const normalized = normalizeQuoteTickPayload(feedPayload);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'XAUUSD',
      timeframe: 'M1',
      time: secondsUtc(2026, 4, 15, 10, 28, 0),
      open: 4553.2,
      high: 4553.35,
      low: 4553.1,
      close: 4553.25,
      volume: 12,
    },
    'M1',
  );

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: normalized.update.bid, time: normalized.update.timestamp },
    'M1',
  );
  const active = materializeCandleMap(map)[0];

  assert.equal(result.ignored, false);
  assert.equal(active.close, 4553.38);
  assert.equal(active.high, 4553.38);
  assert.equal(active.low, 4553.1);
  assert.notEqual(active.high, normalized.update.high);
  assert.notEqual(active.low, normalized.update.low);
});

test('backend live candle snapshot creates the chart incremental update', () => {
  const history = [
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 0, 0), { close: 2299.5 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 1, 0), { close: 2299.8 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 2, 0), { close: 2300.0 }),
  ];
  const map = createCandleMap(history);
  const result = applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'XAUUSD',
      timeframe: 'M1',
      time: secondsUtc(2024, 3, 22, 10, 3, 5),
      open: 2300.0,
      high: 2300.4,
      low: 2299.9,
      close: 2300.1,
      volume: 12,
    },
    'M1',
    { historyCutoffTime: history[history.length - 1].time },
  );
  const visible = materializeCandleMap(map);
  const previousSnapshot = buildChartSeriesSnapshot(history);
  const nextSnapshot = buildChartSeriesSnapshot(visible);

  assert.equal(result.ignored, false);
  assert.equal(visible[visible.length - 1].time, secondsUtc(2024, 3, 22, 10, 3, 0));
  assert.deepEqual(visible[visible.length - 1], {
    time: secondsUtc(2024, 3, 22, 10, 3, 0),
    open: 2300.0,
    high: 2300.4,
    low: 2299.9,
    close: 2300.1,
    volume: 12,
  });
  assert.equal(getChartSeriesUpdateMode(previousSnapshot, nextSnapshot), 'incremental');
});

test('bid ask only socket payload remains visible even without candle timestamp', () => {
  const normalized = normalizeQuoteTickPayload({
    symbol: 'XAUUSD.c',
    bidPrice: 2301.2,
    askPrice: 2301.5,
  });

  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  assert.equal(normalized.update.symbol, 'XAUUSD.C');
  assert.equal(normalized.update.bid, 2301.2);
  assert.equal(normalized.update.ask, 2301.5);
  assert.equal(normalized.update.timestamp, null);
  assert.equal(normalized.update.timestampSource, 'missing');
});

test('backend live data can materialize a keyed candle stream even when REST history is empty', () => {
  const map = createCandleMap();
  const result = applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'XAUUSD',
      timeframe: 'M1',
      time: secondsUtc(2024, 3, 22, 10, 5, 12),
      open: 2302.1,
      high: 2302.5,
      low: 2302.0,
      close: 2302.2,
      volume: 4,
    },
    'M1',
  );
  const liveCandles = materializeCandleMap(map);

  assert.equal(result.ignored, false);
  assert.equal(resolveVisibleSeriesMode([], liveCandles, [], 'M1'), 'current');
  assert.equal(shouldSyncVisibleSeriesCache('current', liveCandles, 'M1'), true);
  assert.deepEqual(liveCandles, [
    {
      time: secondsUtc(2024, 3, 22, 10, 5, 0),
      open: 2302.1,
      high: 2302.5,
      low: 2302.0,
      close: 2302.2,
      volume: 4,
    },
  ]);
});

test('useLiveCandles appends /ws/feed candles and keeps quote-driven candle extension', () => {
  const source = readModuleSource('src/domain/candles/hooks/useLiveCandles');
  const quoteSocketSource = readModuleSource('src/api/ws/quotesSocket');

  // Contract v3: REST history + /ws/feed subscribe_candles on the quote socket.
  assert.doesNotMatch(source, /candlesWsService/);
  assert.match(source, /quotesWsService\.subscribeToCandles\(\s*normalizedSymbol,\s*normalizedTimeframe,\s*\)/);
  assert.match(source, /unsubscribeCandleDemand\(\)/);
  assert.match(source, /quotesWsService\.subscribeToSymbol\(symbol, \(\) => \{\s*\}\)/);
  assert.doesNotMatch(source, /quote_store_fallback_tick/);
  assert.doesNotMatch(source, /liveCandlesEngine\.ingestQuoteTick/);
  assert.doesNotMatch(source, /normalizeLiveTick/);
  assert.match(quoteSocketSource, /subscribeToCandles\(symbol: string, tf: string\)/);
  assert.match(quoteSocketSource, /buildFeedCandleSubscriptionMessages\('subscribe', subscribeSubscriptions\)/);
  assert.match(quoteSocketSource, /toBridgeCandleTf/);
  assert.match(quoteSocketSource, /routeBackendCandleUpdates/);
  assert.match(quoteSocketSource, /shouldRouteBackendCandlePayloads\(\)/);
  assert.doesNotMatch(source, /pushPrice\(/);
});

test('legacy API websocket cannot own executable quote or candle updates', () => {
  const socketSource = readModuleSource('src/api/ws/socket');

  assert.doesNotMatch(socketSource, /liveCandleStream|setQuote\(|extendActiveCandlesFromQuoteTick/);
  assert.match(
    socketSource,
    /normalized === 'prices' \|\| normalized\.startsWith\('quotes\.'\)[\s\S]*Quote channels are disabled; executable quotes use \/ws\/feed only/,
  );
  assert.match(socketSource, /if \(channel\.startsWith\('account\.'\)\) \{[\s\S]*store\.setAccount\(data\)/);
});

test('public quote websocket gates nested backend candle payloads until server mode is proven', () => {
  const quoteSocketSource = readModuleSource('src/api/ws/quotesSocket');

  assert.match(quoteSocketSource, /routeBackendCandleUpdates/);
  assert.match(quoteSocketSource, /shouldRouteBackendCandlePayloads\(\)/);
  assert.match(quoteSocketSource, /feed_candle_update_ignored_unverified/);
  assert.match(quoteSocketSource, /isExplicitCandlePayload\(payload\)/);
  assert.match(quoteSocketSource, /hasNestedCandleEnvelope\(record\)/);
  assert.match(quoteSocketSource, /getCandlePayloadItems\(payload\)/);
  assert.match(quoteSocketSource, /hasBackendCandleShape\(item\)/);
  assert.match(quoteSocketSource, /const routedItem = mergeCandleEnvelopeContext\(payload, item, symbol, tf\)/);
  assert.match(quoteSocketSource, /liveCandleStream\.ingestLiveCandle\(routedItem, symbol \?\? undefined, tf \?\? undefined\)/);
  assert.match(quoteSocketSource, /payloadRecord\?\.timestamp === undefined/);
});

test('live candle stream can infer timeframe for single active feed candle stream', () => {
  const streamSource = readModuleSource('src/domain/candles/stream/liveCandleStream');

  assert.match(streamSource, /let normalizedTimeframe =[\s\S]*normalizeTimeframeStrict\(timeframe\)/);
  assert.match(streamSource, /const candidates = Array\.from\(this\.entries\.values\(\)\)\.filter\(\(entry\) => entry\.symbol === normalizedSymbol\)/);
  assert.match(streamSource, /if \(candidates\.length !== 1\)/);
  assert.match(streamSource, /normalizedTimeframe = candidates\[0\]\.timeframe/);
});
