import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  assertSourceContains,
  extractFunctionBody,
} from '../support/chartSourceTestUtils';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/rendering/ChartWebViewHtml.ts'),
  'utf8',
);
const candleStreamManagerSource = readFileSync(
  resolve(process.cwd(), 'src/domain/candles/stream/liveCandleStream/manager.ts'),
  'utf8',
);

test('live tick scheduling keeps rAF plus a bounded timeout liveness fallback', () => {
  const scheduleBody = extractFunctionBody(source, 'schedulePendingTickFlush');
  const cancelBody = extractFunctionBody(source, 'cancelPendingTickFlush');
  const flushBody = extractFunctionBody(source, 'flushPendingTick');
  const legacyUpdateBody = extractFunctionBody(source, 'updateTick');
  const liveUpdateBody = extractFunctionBody(source, 'updateLiveTick');
  const fallbackMatch = source.match(/var LIVE_TICK_FLUSH_FALLBACK_MS = (\d+)/);

  assert.ok(fallbackMatch, 'live tick bridge must declare a numeric fallback deadline');
  const fallbackMs = Number(fallbackMatch[1]);
  assert.ok(
    fallbackMs >= 16 && fallbackMs <= 250,
    `live tick fallback must stay bounded to 16-250ms, received ${fallbackMs}ms`,
  );
  assertSourceContains(
    source,
    /var tickFlushFallbackHandle = 0/,
    'live tick bridge must retain the timeout handle independently from rAF',
  );
  assertSourceContains(
    scheduleBody,
    /if \(tickFlushHandle \|\| tickFlushFallbackHandle\) return/,
    'queued live ticks must share one in-flight flush pair',
  );
  assertSourceContains(
    scheduleBody,
    /tickFlushFallbackHandle = setTimeout\(\s*flushPendingTick,\s*LIVE_TICK_FLUSH_FALLBACK_MS\s*\)/,
    'the timeout watchdog must be armed even when requestAnimationFrame exists',
  );
  assertSourceContains(
    scheduleBody,
    /tickFlushHandle = requestAnimationFrame\(flushPendingTick\)/,
    'requestAnimationFrame must remain the preferred fast paint path',
  );
  assertSourceContains(
    cancelBody,
    /cancelAnimationFrame\(tickFlushHandle\)[\s\S]*tickFlushHandle = 0[\s\S]*clearTimeout\(tickFlushFallbackHandle\)[\s\S]*tickFlushFallbackHandle = 0/,
    'whichever scheduler wins must cancel and clear both scheduler handles',
  );
  assertSourceContains(
    flushBody,
    /cancelPendingTickFlush\(\)[\s\S]*var pending = pendingTick[\s\S]*pendingTick = null/,
    'flush must become idempotent before consuming the latest coalesced update',
  );
  assertSourceContains(
    legacyUpdateBody,
    /pendingTick = \{ tick: tick \}[\s\S]*schedulePendingTickFlush\(\)/,
    'legacy candle-only updates must use the shared liveness scheduler',
  );
  assertSourceContains(
    liveUpdateBody,
    /pendingTick = \{[\s\S]*syncLivePriceLine: true,[\s\S]*revision: revision,[\s\S]*\}[\s\S]*schedulePendingTickFlush\(\)/,
    'atomic candle and Bid updates must use the shared liveness scheduler',
  );
});

test('exact Bid line and revision advance only with the accepted candle generation', () => {
  const flushBody = extractFunctionBody(source, 'flushPendingTick');
  const applyIndex = flushBody.indexOf('applyTickUpdate(tick)');
  const liveLineIndex = flushBody.indexOf('setLivePriceLine(');
  const revisionCommitIndex = flushBody.indexOf('lastAppliedLiveTickRevision = revision');

  assert.ok(applyIndex >= 0, 'flush must attempt the canonical candle update');
  assert.ok(liveLineIndex > applyIndex, 'flush must attempt the exact Bid line after the candle update');
  assert.ok(
    revisionCommitIndex > liveLineIndex,
    'flush must commit the revision only after attempting the exact Bid line',
  );
  assertSourceContains(
    flushBody,
    /var applied = false[\s\S]*try \{[\s\S]*applied = applyTickUpdate\(tick\)[\s\S]*\} catch \(applyError\) \{[\s\S]*tickApplyError = applyError[\s\S]*var synchronizedLivePriceLine = false/,
    'the candle application result must be captured before any marker decision',
  );
  assertSourceContains(
    flushBody,
    /if \(applied && pending\.syncLivePriceLine === true\) \{[\s\S]*synchronizedLivePriceLine = setLivePriceLine\([\s\S]*pending\.showLivePriceLine === true \? pending\.livePrice : null[\s\S]*\) === true/,
    'the queued Bid marker must remain on the previous generation when the candle patch is rejected',
  );
  assertSourceContains(
    flushBody,
    /if \(revision !== null && applied && synchronizedLivePriceLine\) \{[\s\S]*lastAppliedLiveTickRevision = revision/,
    'a revision must commit only after both the candle and its existing single Bid marker succeed',
  );
  assertSourceContains(
    flushBody,
    /else if \(revision !== null && applied && pending\.syncLivePriceLine === true\)[\s\S]*lineRetryCount < LIVE_TICK_LINE_RETRY_LIMIT[\s\S]*pending\.lineRetryCount = lineRetryCount \+ 1[\s\S]*pendingTick = pending;[\s\S]*schedulePendingTickFlush\(\)/,
    'a failed native Bid-line write must retain and retry the same uncommitted candle generation',
  );
  assert.doesNotMatch(flushBody, /applied \|\| synchronizedLivePriceLine/);
  assertSourceContains(
    flushBody,
    /if \(revision !== null && applied && synchronizedLivePriceLine\)[\s\S]*lastAppliedLiveTickRevision = revision[\s\S]*if \(tickApplyError\) \{[\s\S]*throw tickApplyError/,
    'candle errors must be reported without committing a marker-only revision',
  );
});

test('native candle aggregation also pairs rAF with a timeout watchdog', () => {
  assertSourceContains(
    candleStreamManagerSource,
    /private scheduleFlush\(entry: StreamEntry\): void \{[\s\S]*if \(entry\.flushFrame !== null \|\| entry\.flushTimer\)[\s\S]*const flushPendingEvents = \(\) => \{[\s\S]*cancelAnimationFrame\(entry\.flushFrame\)[\s\S]*clearTimeout\(entry\.flushTimer\)[\s\S]*entry\.flushFrame = null[\s\S]*entry\.flushTimer = null/,
    'the winning native candle scheduler must cancel and clear both handles before consuming ticks',
  );
  assertSourceContains(
    candleStreamManagerSource,
    /entry\.flushTimer = setTimeout\(flushPendingEvents, FLUSH_INTERVAL_MS\)[\s\S]*entry\.flushFrame = globalThis\.requestAnimationFrame\(flushPendingEvents\)/,
    'Android cannot leave the native forming-candle queue blocked behind a lost animation frame',
  );
});

test('live Bid updates reuse one native line instead of recreating it per tick', () => {
  const body = extractFunctionBody(source, 'setLivePriceLine');
  const existingLineIndex = body.indexOf('if (bidPriceLine)');
  const updateIndex = body.indexOf('bidPriceLine.applyOptions', existingLineIndex);
  const createIndex = body.indexOf('bidPriceLine = createMarketPriceLine');

  assert.ok(existingLineIndex >= 0, 'live Bid setter must detect an existing line');
  assert.ok(updateIndex > existingLineIndex, 'existing live Bid line must update through applyOptions');
  assert.ok(createIndex > updateIndex, 'new line creation must remain behind the in-place update path');
  assertSourceContains(
    body,
    /if \(bidPriceLine\) \{[\s\S]*bidPriceLine\.applyOptions\(makeMarketPriceLineOptions\(normalizedPrice, liveColor\)\)[\s\S]*return true;[\s\S]*\} catch \(_e\) \{[\s\S]*bidPriceLine = removeMarketPriceLine\(bidPriceLine\)/,
    'successful in-place updates must return before the recreation fallback',
  );
  assertSourceContains(
    body,
    /bidPriceLine = createMarketPriceLine\(normalizedPrice, liveColor\)[\s\S]*if \(!bidPriceLine\)[\s\S]*return false[\s\S]*return true[\s\S]*catch \(e\)[\s\S]*postError\('setLivePriceLine', e\)[\s\S]*return false/,
    'line creation must report success so a failed atomic marker write cannot commit its revision',
  );
  assertSourceContains(
    body,
    /askPriceLine = removeMarketPriceLine\(askPriceLine\)[\s\S]*if \(bidPriceLine\)/,
    'each Bid update must remove any legacy Ask line before painting',
  );
  assert.equal(
    (body.match(/createMarketPriceLine\(normalizedPrice, liveColor\)/g) ?? []).length,
    1,
    'the live Bid setter must have only one native creation fallback',
  );
});

test('live line keeps the raw Bid coordinate while only badge text is decimal-limited', () => {
  const normalizerBody = extractFunctionBody(source, 'normalizeMarketPriceLinePrice');
  const liveLineBody = extractFunctionBody(source, 'setLivePriceLine');
  const lineOptionsBody = extractFunctionBody(source, 'makeMarketPriceLineOptions');
  const decimalResolverBody = extractFunctionBody(source, 'resolveOverlayDisplayDecimals');
  const badgeCollectorBody = extractFunctionBody(source, 'collectMarketPriceScaleBadge');
  const badgeFormatterBody = extractFunctionBody(source, 'formatMarketPriceScaleBadgeLabel');

  assertSourceContains(
    normalizerBody,
    /typeof price !== 'number' \|\| !isFinite\(price\) \|\| price <= 0[\s\S]*return null[\s\S]*return price/,
    'valid live Bid coordinates must pass through without rounding',
  );
  assert.doesNotMatch(
    normalizerBody,
    /toFixed|Math\.round|resolveOverlayDisplayDecimals/,
    'coordinate normalization must never snap a live Bid to display precision',
  );
  assertSourceContains(
    liveLineBody,
    /lastLivePrice = normalizedPrice[\s\S]*lastBidPrice = normalizedPrice[\s\S]*makeMarketPriceLineOptions\(normalizedPrice, liveColor\)/,
    'raw normalized Bid must remain the cached and native-line coordinate',
  );
  assertSourceContains(
    lineOptionsBody,
    /price: price/,
    'native price-line options must retain the supplied raw coordinate',
  );
  assertSourceContains(
    badgeCollectorBody,
    /series\.priceToCoordinate\(price\)/,
    'custom badge placement must use the same raw live coordinate',
  );
  assertSourceContains(
    decimalResolverBody,
    /Math\.max\(0, Math\.min\(10, Math\.round\(lastRequestedDisplayDecimals\)\)\)/,
    'badge precision must stay clamped to a finite display range',
  );
  assertSourceContains(
    badgeFormatterBody,
    /var decimals = resolveOverlayDisplayDecimals\(\)[\s\S]*Number\(price\)\.toFixed\(decimals\)/,
    'only badge text formatting may round the raw live Bid',
  );
});

test('right-axis live marker has its own watchdog and survives gesture deferral', () => {
  const scheduleBody = extractFunctionBody(source, 'scheduleMarketPriceScaleDomOnly');
  const flushBody = extractFunctionBody(source, 'flushMarketPriceScaleDomRefresh');
  const cancelBody = extractFunctionBody(source, 'cancelMarketPriceScaleDomRefreshSchedule');
  const overlayScheduleBody = extractFunctionBody(source, 'scheduleOverlayDomRefresh');
  const fallbackMatch = source.match(/var MARKET_PRICE_SCALE_DOM_FALLBACK_MS = (\d+)/);

  assert.ok(fallbackMatch, 'market-price DOM bridge must declare a numeric fallback deadline');
  const fallbackMs = Number(fallbackMatch[1]);
  assert.ok(
    fallbackMs >= 16 && fallbackMs <= 250,
    `market-price DOM fallback must stay bounded to 16-250ms, received ${fallbackMs}ms`,
  );
  assertSourceContains(
    scheduleBody,
    /marketPriceScaleDomPending = true[\s\S]*marketPriceScaleDomRefreshFallbackHandle = setTimeout\([\s\S]*flushMarketPriceScaleDomRefresh[\s\S]*MARKET_PRICE_SCALE_DOM_FALLBACK_MS[\s\S]*marketPriceScaleDomRefreshRaf = requestAnimationFrame\([\s\S]*flushMarketPriceScaleDomRefresh/,
    'the visible marker must keep a latest-value pending flag plus rAF and timeout paths',
  );
  assertSourceContains(
    cancelBody,
    /cancelAnimationFrame\(marketPriceScaleDomRefreshRaf\)[\s\S]*clearTimeout\(marketPriceScaleDomRefreshFallbackHandle\)/,
    'the winning market marker callback must cancel its paired scheduler',
  );
  assertSourceContains(
    flushBody,
    /if \(!marketPriceScaleDomPending\) return[\s\S]*isHorizontalScrollMotionActive\(\) \|\| verticalPricePanGestureActive[\s\S]*return[\s\S]*marketPriceScaleDomPending = false[\s\S]*refreshMarketPriceScaleDom\(\)/,
    'gesture-time marker paints must remain pending until a safe settle pass',
  );
  assertSourceContains(
    overlayScheduleBody,
    /scheduleMarketPriceScaleDomOnly\(\)/,
    'gesture settlement through the full overlay scheduler must replay the latest market marker',
  );
});
