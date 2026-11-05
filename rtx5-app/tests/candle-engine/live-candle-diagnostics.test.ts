import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readCanonicalLiveStreamSource = (): string => {
  const folderCandidates = [
    resolve(process.cwd(), 'src/domain/candles/stream/liveCandleStream'),
    resolve(process.cwd(), 'rtx5-app/src/domain/candles/stream/liveCandleStream'),
  ];
  for (const folder of folderCandidates) {
    if (existsSync(folder) && statSync(folder).isDirectory()) {
      return readdirSync(folder)
        .filter((entry) => entry.endsWith('.ts'))
        .map((entry) => readFileSync(resolve(folder, entry), 'utf8'))
        .join('\n');
    }
  }
  const candidates = [
    resolve(process.cwd(), 'src/domain/candles/stream/liveCandleStream.ts'),
    resolve(process.cwd(), 'rtx5-app/src/domain/candles/stream/liveCandleStream.ts'),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(filePath, 'stream/liveCandleStream not found from the test working directory');
  return readFileSync(filePath, 'utf8');
};

const source = readCanonicalLiveStreamSource();

const readRepoSource = (relativePath: string): string => {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), 'rtx5-app', relativePath),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(filePath, `${relativePath} was not found from the test working directory`);
  return readFileSync(filePath, 'utf8');
};

test('canonical live stream exposes safe REST history prefetch for fast timeframe switches', () => {
  assert.match(source, /const DEFAULT_HISTORY_LIMIT = MAX_CANDLE_SERIES_LENGTH/);
  assert.match(source, /const INITIAL_VIEWPORT_HISTORY_LIMIT = 120/);
  assert.match(source, /const INITIAL_HISTORY_LIMIT = Math\.min\(INITIAL_VIEWPORT_HISTORY_LIMIT, MAX_CANDLE_SERIES_LENGTH\)/);
  assert.match(source, /const CLOSED_MARKET_HISTORY_WARM_LIMIT = PAGINATED_HISTORY_LIMIT/);
  assert.match(source, /public async prefetchHistory\([\s\S]*limit = INITIAL_HISTORY_LIMIT,[\s\S]*\): Promise<number>/);
  assert.match(source, /manager\.fetchHistory\(symbol, timeframe, limit, \{[\s\S]*cacheNamespace: sessionProvenance\.cacheNamespace/);
  assert.match(source, /slice\(-MAX_RETAINED_HISTORY_CANDLES\)/);
  assert.match(source, /renderHistoryLimit: INITIAL_HISTORY_LIMIT/);
  assert.match(source, /entry\.renderHistoryLimit = initialLoadLimit/);
  assert.match(source, /Math\.max\(INITIAL_HISTORY_LIMIT, entry\.renderHistoryLimit \|\| INITIAL_HISTORY_LIMIT\)/);
  assert.match(source, /const shouldLoadIntoActiveEntry = Boolean\([\s\S]*requestedLimit > entry\.renderHistoryLimit[\s\S]*requestedLimit === entry\.renderHistoryLimit[\s\S]*!this\.isHistoryRequestActive\(entry\)[\s\S]*entry\.renderHistoryLimit = requestedLimit/);
  assert.match(source, /entry\.historyCandles\.length >= requestedLimit[\s\S]*this\.commit\(entry\)/);
  assert.match(source, /pendingPrefetch && pendingPrefetch\.limit >= requestedLimit[\s\S]*return pendingPrefetch\.promise/);
  // In-flight prefetches are deduplicated at the fetch layer, and the fresh
  // load path chains onto a pending prefetch (issuing a real load only if it
  // yields nothing) instead of treating it as an active request — a failed
  // prefetch must never permanently swallow the history load.
  assert.match(source, /const existing = manager\.historyPrefetches\.get\(key\)/);
  assert.match(source, /existing && existing\.limit >= requestedLimit[\s\S]*return existing\.promise/);
  assert.doesNotMatch(source, /this\.historyPrefetches\.has\(entry\.key\)/);
  assert.match(source, /const pendingPrefetchRecord = this\.historyPrefetches\.get\(entry\.key\)/);
  // Rejected and never-settling warm-ups share one bounded join. A transport
  // hang must relinquish the key so future revisits cannot keep joining the
  // same dead promise until the app is restarted.
  assert.match(source, /const settlePendingPrefetch = \(result: 'settled' \| 'timed_out'\) => \{/);
  assert.match(
    source,
    /result === 'timed_out'[\s\S]*this\.historyPrefetches\.get\(entry\.key\) === pendingPrefetchRecord[\s\S]*this\.historyPrefetches\.delete\(entry\.key\)/,
  );
  assert.match(
    source,
    /waitForHistoryPrefetchSettlement\(pendingPrefetchRecord\.promise\)[\s\S]*\.then\(settlePendingPrefetch\)/,
  );
  assert.match(source, /live\.historyCandles\.length > 0[\s\S]*const fallbackLoadLimit = Math\.min\([\s\S]*live\.renderHistoryLimit[\s\S]*runLoadHistory\(this, live, fallbackLoadLimit\)/);
  // A warm revisit is cache-seeded, so the chained prefetch always takes the
  // "already has history" branch and issues no load of its own. Nothing else
  // would recompute `loading`, so that branch must settle it explicitly or the
  // chart spins forever on a symbol whose next tick never arrives.
  assert.match(source, /this\.settleIdleLoading\(live\)/);
  assert.match(
    source,
    /private settleIdleLoading\(entry: StreamEntry\): void \{[\s\S]*entry\.loading = entry\.historyLoading \|\| entry\.historyPageLoading;[\s\S]*this\.notify\(entry\)/,
  );
  assert.match(source, /candleMemoryCache\.set\(normalizedSymbol, normalizedTimeframe, candles\)/);
  assert.match(source, /syncMergedCandleCache\(normalizedSymbol, normalizedTimeframe, history\.closedCandles, \{[\s\S]*provenance: history\.provenance/);
});

test('canonical live stream keeps pagination windows bounded to the selected timeframe', () => {
  assert.match(source, /getTimeframeSeconds\(entry\.timeframe\)/);
  assert.match(source, /getHistoryPageLookbackMultiplier = \(timeframe: Timeframe\): number =>/);
  assert.match(source, /lookbackSeconds =[\s\S]*PAGINATED_HISTORY_LIMIT \* timeframeSeconds \* getHistoryPageLookbackMultiplier\(entry\.timeframe\)/);
  assert.match(source, /pageToTime - lookbackSeconds/);
  assert.match(source, /const requestToTime = Math\.max\(1, pageToTime - 1\)/);
  assert.match(source, /fromTime >= requestToTime/);
  assert.match(source, /runLoadHistory\(this, entry, PAGINATED_HISTORY_LIMIT, \{ to: requestToTime, from: fromTime \}\)/);
  assert.match(source, /renderHistoryLimit: number/);
  assert.match(source, /historyPaginationCursorTime: number \| null/);
  assert.match(source, /historyPageLoading: boolean/);
  assert.match(source, /entry\.historyPageLoading = true/);
  assert.match(source, /entry\.loading = entry\.historyLoading \|\| entry\.historyPageLoading/);
  assert.match(source, /MAX_RENDERED_HISTORY_CANDLES/);
  assert.match(source, /live\.renderHistoryLimit = Math\.min\(/);
  assert.match(source, /Math\.max\(INITIAL_HISTORY_LIMIT, live\.renderHistoryLimit \+ newOlderHistoryCount\)/);
  assert.match(source, /live\.historyPaginationCursorTime = Math\.max\(1, Math\.floor\(options\.from\)\)/);
  assert.doesNotMatch(source, /DEFAULT_HISTORY_LIMIT \* 86400/);
});

test('canonical live stream seeds REST history plus backend current candle before websocket merge', () => {
  assert.match(source, /const getHistorySeedSnapshot = \(history: CandleHistorySnapshot\): HistorySeedSnapshot =>/);
  assert.match(source, /buildRestHistorySeedCandles\(history\.closedCandles, history\.currentCandle\)/);
  assert.match(source, /closedHistoryLastTime: seed\.closedHistoryLastTime/);
  assert.match(source, /currentCandleTime: seed\.currentCandleTime/);
  assert.match(source, /const historySeed = getHistorySeedSnapshot\(history\)/);
  assert.match(source, /let historyCandles = historySeed\.candles/);
  assert.doesNotMatch(source, /normalizeHistoryCandles\(history\.candles/);
  assert.doesNotMatch(source, /history\.candles\.length > 0 \? history\.candles/);
});

test('canonical live stream protects history requests from stale responses', () => {
  assert.match(source, /entry\.requestId \+= 1/);
  assert.match(source, /entry\.abortController\?\.abort\(\)/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /live\.requestId !== requestId \|\| controller\.signal\.aborted/);
});

test('canonical live stream buffers and replays live data around REST history', () => {
  assert.match(source, /entry\.bufferedEvents = \[\]/);
  assert.match(source, /entry\.bufferedEvents\.push\(event\)/);
  assert.match(source, /sort\(\(left, right\) => getEventTime\(left\) - getEventTime\(right\) \|\| left\.order - right\.order\)/);
  // Accept either `this.applyLiveEvents` (in-class call) or `manager.applyLiveEvents`
  // (the extracted historyFetching helper post 500-line refactor).
  assert.match(source, /(?:this|manager)\.applyLiveEvents\(live, replayEvents\)/);
});

test('canonical live stream uses quote ticks only through the managed active-candle extension', () => {
  assert.doesNotMatch(source, /applyTickToCandleMap/);
  assert.doesNotMatch(source, /ingestQuoteTick/);
  assert.doesNotMatch(source, /quotesWsService\.addTickListener/);
  assert.doesNotMatch(source, /quotesWsService\.subscribe/);
  assert.match(source, /extendActiveCandlesFromQuoteTick/);
  assert.match(source, /applyQuoteTickExtensionToCandleMap/);
  assert.match(source, /ingestLiveCandle\(rawCandle: unknown, symbol\?: string, timeframe\?: string\): void/);
});

test('canonical live stream flushes quote-fed candle ticks at frame speed', () => {
  assert.match(source, /export const FLUSH_INTERVAL_MS = 16/);
  assert.match(source, /flushFrame: number \| null/);
  assert.match(source, /globalThis\.requestAnimationFrame\(flushPendingEvents\)/);
  assert.match(source, /setTimeout\(flushPendingEvents, FLUSH_INTERVAL_MS\)/);
});

test('live candle hook keeps quote socket demand active for fast forming candles', () => {
  const hookSource = readRepoSource('src/domain/candles/hooks/useLiveCandles.ts');

  assert.match(hookSource, /import \{ quotesWsService \} from '\.\.\/\.\.\/\.\.\/api\/ws\/quotesSocket'/);
  // Contract v3: live candles come from /ws/feed subscribe_candles on the
  // quote socket; the /ws/v2 candle service is no longer used by the hook.
  assert.doesNotMatch(hookSource, /candlesWsService/);
  assert.match(hookSource, /const unsubscribeCandleDemand = quotesWsService\.subscribeToCandles\(\s*normalizedSymbol,\s*normalizedTimeframe,\s*\)/);
  assert.match(hookSource, /Quote ticks keep extending the active candle/);
  assert.match(hookSource, /const unsubscribeQuoteDemand = quotesWsService\.subscribeToSymbol\(symbol, \(\) => \{\s*\}\)/);
  assert.match(hookSource, /unsubscribeQuoteDemand\(\);[\s\S]*unsubscribeEngine\(\);[\s\S]*unsubscribeCandleDemand\(\)/);
});

test('backend candle cache bootstrap does not reject valid intraday gaps', () => {
  const domainSource = readRepoSource('src/domain/candles/core/candles.ts');
  const querySource = readRepoSource('src/query/websocket.ts');
  const tradingStateSource = readRepoSource('src/state/tradingState.ts');
  const hookSource = readRepoSource('src/domain/candles/hooks/useLiveCandles.ts');
  const historyQuerySource = readRepoSource('src/domain/candles/api/candleHistoryQuery.ts');

  assert.match(domainSource, /return normalized\.length >= minCandles/);
  assert.doesNotMatch(domainSource, /hasIntradayInternalGaps/);
  assert.doesNotMatch(domainSource, /INTRADAY_BOOTSTRAP_TIMEFRAMES/);
  assert.doesNotMatch(querySource, /requestCandleHistory\(symbol, timeframe, 200\)/);
  assert.doesNotMatch(querySource, /const channel = `candles\.\$\{symbol\}\.\$\{timeframe\}`/);
  assert.doesNotMatch(tradingStateSource, /getBucketStart\(newCandle\.time/);
  assert.match(hookSource, /normalizeTimeframeStrict\(timeframe\)/);
  assert.match(historyQuerySource, /return normalizedTimeframe \? \[normalizedTimeframe\] : \[\]/);
});

test('data analyzer is opt-in and avoids engine-only REST history probes', () => {
  const analyzerSource = readRepoSource('src/features/chart/DataAnalyzer.ts');

  assert.match(analyzerSource, /EXPO_PUBLIC_ENABLE_DATA_ANALYZER/);
  assert.match(
    analyzerSource,
    /const isDataAnalyzerEnabled = \(\) =>\s*typeof __DEV__ !== 'undefined' &&\s*__DEV__ &&/,
    'the analyzer must be dev-build only, never production',
  );
  assert.doesNotMatch(analyzerSource, /console\.(?:warn|error)\(/);
  assert.match(analyzerSource, /CANDLE_HISTORY_TIMEFRAMES/);
  assert.doesNotMatch(analyzerSource, /SUPPORTED_TIMEFRAMES/);
});

test('canonical live stream commits one fresh history plus backend live candle series', () => {
  assert.match(source, /historyCandles: Candle\[]/);
  assert.match(source, /liveCandleMap: Map<number, MutableCandle>/);
  assert.match(
    source,
    /materializeLiveCandleMap\(entry\.liveCandleMap, entry\.historyLastTime,\s*\{\s*preserveProvenance: true,\s*\}\)/,
  );
  assert.match(source, /renderHistoryLimit = Math\.min\(/);
  assert.match(source, /buildFreshHistoryLiveCandleSeries\(/);
  assert.match(source, /closedHistoryLastTime: entry\.historyLastTime/);
  assert.match(source, /candleMemoryCache\.set\(entry\.symbol, entry\.timeframe, safeNextCandles\)/);
  assert.match(source, /syncMergedCandleCache\(symbol, timeframe, history\.closedCandles, \{[\s\S]*provenance: history\.provenance/);
  assert.doesNotMatch(source, /syncMergedCandleCache\(entry\.symbol, entry\.timeframe, nextCandles, \{ canonical: true \}\)/);
  assert.doesNotMatch(source, /materializeCandleMap\(entry\.candleMap/);
});
