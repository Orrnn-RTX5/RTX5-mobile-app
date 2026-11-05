import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertSourceContains,
  extractFunctionBody,
} from '../support/chartSourceTestUtils';

const readProjectFile = (relativePath: string): string => {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), 'rtx5-app', relativePath),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  assert.ok(path, `${relativePath} was not found`);
  return readFileSync(path, 'utf8');
};

const webViewSource = readProjectFile('src/features/chart/rendering/ChartWebViewHtml.ts');
const nativeSource = readProjectFile('src/features/chart/ChartScreen.native.tsx');
const webSource = readProjectFile('src/features/chart/ChartScreen.web.tsx');
const webBadgeSource = readProjectFile(
  'src/features/chart/components/ChartCandleCountdownBadge.web.tsx',
);

test('native bridge binds the exact selected timeframe and series context to the countdown', () => {
  const normalizeBody = extractFunctionBody(webViewSource, 'normalizeCandleCountdownTimeframe');
  const setterBody = extractFunctionBody(webViewSource, 'setCandleCountdownTimeframe');

  assertSourceContains(
    nativeSource,
    /setCandleCountdownTimeframe\([\s\S]*\$\{JSON\.stringify\(chartTimeframe\)\},[\s\S]*\$\{JSON\.stringify\(chartDataContextSig\)\}/,
    'native must bridge the selected chart timeframe and the context that owns its candle data',
  );
  assertSourceContains(
    normalizeBody,
    /Object\.prototype\.hasOwnProperty\.call\(CANDLE_COUNTDOWN_FIXED_SECONDS, normalized\)/,
    'WebView countdown timeframe parsing must accept only supported explicit intervals',
  );
  assert.doesNotMatch(normalizeBody, /\?\?\s*'M1'|\|\|\s*'M1'|return\s+'M1'/);
  assertSourceContains(
    setterBody,
    /candleCountdownTimeframe = normalizeCandleCountdownTimeframe\(timeframe\)/,
    'setter must preserve strict invalid-to-null behavior',
  );
  assertSourceContains(
    setterBody,
    /candleCountdownRequestedContextSig =[\s\S]*typeof dataContextSig === 'string' \? dataContextSig : ''/,
    'setter must bind the requested symbol/timeframe context',
  );
  assertSourceContains(
    nativeSource,
    /setCandleCountdownActive\(\$\{chartRuntimeActive && chartDisplay\.showLivePriceLine && !isChartMarketClosed && chartType !== 'renko'\}\)/,
    'native must pause the DOM ticker while the retained chart, live-price line, or market is inactive, or Renko is selected',
  );
});

test('confirmed quote-closed charts remove the expired countdown immediately', () => {
  const resolveBody = extractFunctionBody(webViewSource, 'resolveCandleCountdownLabel');
  const activeSetterBody = extractFunctionBody(webViewSource, 'setCandleCountdownActive');

  assertSourceContains(
    nativeSource,
    /const isChartMarketClosed = chartMarketSessionPolicy\.quotePhase === 'closed'/,
    'only a confirmed per-symbol quote closure may disable the countdown',
  );
  assertSourceContains(
    resolveBody,
    /if \(!candleCountdownActive\) \{[\s\S]*return null/,
    'an inactive countdown must not leave a stale 00:00 row in the price badge',
  );
  assertSourceContains(
    activeSetterBody,
    /candleCountdownActive = active === true[\s\S]*stopCandleCountdownTicker\(\)[\s\S]*scheduleMarketPriceScaleDomOnly\(\)/,
    'activity changes must repaint the badge for both open and closed transitions',
  );
  assertSourceContains(
    nativeSource,
    /\{symbolName\}\{isChartMarketClosed \? ` · \$\{t\('Market Closed'\)\}` : ''\}/,
    'closed charts must show the localized market state without growing the symbol header',
  );
});

test('WebView countdown aligns the active candle to the selected market bucket and never creates a candle', () => {
  const remainingBody = extractFunctionBody(webViewSource, 'getCandleCountdownRemainingSeconds');
  const bucketStartBody = extractFunctionBody(
    webViewSource,
    'resolveCandleCountdownBucketStartSeconds',
  );
  const closeBody = extractFunctionBody(webViewSource, 'resolveCandleCountdownCloseTimeMs');
  const formatBody = extractFunctionBody(webViewSource, 'formatCandleCountdownLabel');
  const tickerBody = extractFunctionBody(webViewSource, 'scheduleNextCandleCountdownTick');
  const initBody = extractFunctionBody(webViewSource, '_doInitChart');
  const updateDataBody = extractFunctionBody(webViewSource, 'updateChartData');

  assertSourceContains(
    remainingBody,
    /normalizeCandleCountdownBarTimeSeconds\(lastBarTime\)[\s\S]*resolveCandleCountdownCloseTimeMs\(barTimeSeconds, normalizedTimeframe\)/,
    'remaining time must be calculated from the active candle timestamp and selected timeframe',
  );
  assertSourceContains(
    formatBody,
    /candleCountdownTimeframe === 'H1'[\s\S]*padCandleCountdownUnit\(totalMinutes\)/,
    'H1 must display its full sixty-minute countdown as MM:SS',
  );
  assertSourceContains(
    formatBody,
    /candleCountdownTimeframe === 'H4'[\s\S]*padCandleCountdownUnit\(totalHours\)[\s\S]*padCandleCountdownUnit\(minutes\)[\s\S]*padCandleCountdownUnit\(seconds\)/,
    'H4 must display a stable HH:MM:SS countdown through zero',
  );
  assertSourceContains(
    formatBody,
    /candleCountdownTimeframe === 'D1'[\s\S]*padCandleCountdownUnit\(totalHours\)[\s\S]*padCandleCountdownUnit\(minutes\)[\s\S]*padCandleCountdownUnit\(seconds\)/,
    'D1 must display a stable twenty-four-hour HH:MM:SS countdown through zero',
  );
  assertSourceContains(
    formatBody,
    /candleCountdownTimeframe === 'W1' \|\| candleCountdownTimeframe === 'MN'[\s\S]*padCandleCountdownUnit\(totalHours\)[\s\S]*padCandleCountdownUnit\(minutes\)[\s\S]*padCandleCountdownUnit\(seconds\)/,
    'weekly and calendar-month countdowns must display total hours through zero',
  );
  assertSourceContains(
    remainingBody,
    /!candleCountdownRequestedContextSig[\s\S]*candleCountdownRequestedContextSig !== candleCountdownSeriesContextSig/,
    'retained candles from a previous symbol/timeframe must hide instead of showing a wrong countdown',
  );
  assertSourceContains(
    bucketStartBody,
    /Math\.floor\(barTimeSeconds \/ intervalSeconds\) \* intervalSeconds/,
    'intraday and hourly timestamps must snap to the selected market bucket',
  );
  assertSourceContains(
    bucketStartBody,
    /normalizedTimeframe === 'W1'[\s\S]*daysSinceMonday[\s\S]*dayStartSeconds - daysSinceMonday \* 24 \* 60 \* 60/,
    'weekly timestamps must snap to the UTC Monday boundary',
  );
  assertSourceContains(
    closeBody,
    /resolveCandleCountdownBucketStartSeconds\(barTime, normalizedTimeframe\)/,
    'close time must use the aligned bucket instead of a retained lower-timeframe timestamp',
  );
  assertSourceContains(
    initBody,
    /candleCountdownSeriesContextSig = resolvedDataContextSig/,
    'initialized candle data must own its countdown context',
  );
  assertSourceContains(
    updateDataBody,
    /candleCountdownSeriesContextSig = paintedDataContextSig[\s\S]*lastInitDataContextSig = paintedDataContextSig/,
    'replacement candle data and recovery state must move to the new context together',
  );
  assertSourceContains(
    nativeSource,
    /updateChartData\(\[\], \{[\s\S]*dataContextSig: \$\{JSON\.stringify\(chartDataContextSig\)\}/,
    'an empty replacement must still retire the previous countdown context',
  );
  assertSourceContains(
    closeBody,
    /normalizedTimeframe === 'MN'[\s\S]*Date\.UTC\(barDate\.getUTCFullYear\(\), barDate\.getUTCMonth\(\) \+ 1, 1\)/,
    'monthly countdown must use a calendar month boundary',
  );
  assertSourceContains(
    remainingBody,
    /Math\.max\(0, Math\.ceil\(\(closeTimeMs - currentTimeMs\) \/ 1000\)\)/,
    'expired candles must display zero until a newer candle timestamp arrives',
  );
  assertSourceContains(
    tickerBody,
    /setTimeout\(function\(\)[\s\S]*scheduleMarketPriceScaleDomOnly\(\)[\s\S]*scheduleNextCandleCountdownTick\(\)/,
    'countdown must update locally on aligned timer ticks',
  );
  assert.doesNotMatch(
    `${remainingBody}\n${bucketStartBody}\n${closeBody}\n${tickerBody}\n${initBody}\n${updateDataBody}`,
    /series\.update|updateTick\(|updateLiveTick\(/,
  );
});

test('native live price badge renders price first and countdown directly below it', () => {
  const renderBody = extractFunctionBody(webViewSource, 'renderMarketPriceScaleBadge');
  const collectBody = extractFunctionBody(webViewSource, 'collectMarketPriceScaleBadge');

  assertSourceContains(
    renderBody,
    /rtx5-market-price-scale-badge-price[\s\S]*rtx5-market-price-scale-badge-countdown[\s\S]*appendChild\(priceRow\)[\s\S]*appendChild\(countdownRow\)/,
    'badge must retain ordered price and countdown rows',
  );
  assertSourceContains(
    collectBody,
    /desiredTop = Math\.round\(y - priceRowHeight \/ 2\)/,
    'the chart price line must cross the price row rather than the countdown row',
  );
  assertSourceContains(
    webViewSource,
    /window\.setCandleCountdownTimeframe = setCandleCountdownTimeframe/,
    'countdown setter must be part of the WebView bridge contract',
  );
  assertSourceContains(
    webViewSource,
    /window\.setCandleCountdownActive = setCandleCountdownActive/,
    'countdown activity gate must be part of the WebView bridge contract',
  );
});

test('web chart replaces the one-row built-in label with the same two-row badge', () => {
  assertSourceContains(
    webSource,
    /ChartCandleCountdownBadge[\s\S]*active=\{isScreenFocused && chartType !== 'renko'\}[\s\S]*timeframe=\{chartTimeframe\}[\s\S]*visible=\{chartDisplay\.showLivePriceLine && candlesAvailable && chartType !== 'renko'\}/,
    'web chart must render the countdown from the selected timeframe and suppress it for price-based Renko bricks',
  );
  assert.equal((webSource.match(/lastValueVisible: false/g) ?? []).length >= 3, true);
  assertSourceContains(
    webBadgeSource,
    /getChartCandleCountdownSeconds\(\{[\s\S]*candleOpenTime: currentCandle\.time,[\s\S]*timeframe: current\.timeframe/,
    'web badge must use the same strict candle-boundary helper',
  );
  assertSourceContains(
    webBadgeSource,
    /formatChartCandleCountdown\(remainingSeconds, current\.timeframe\)/,
    'web badge must retain the selected timeframe while formatting H1 and H4',
  );
  assertSourceContains(
    webBadgeSource,
    /<span ref=\{priceRef\}[\s\S]*data-rtx5-role="candle-countdown"/,
    'web price row must be followed by the countdown row',
  );
});
