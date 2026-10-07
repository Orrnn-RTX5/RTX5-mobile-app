import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('native chart reactively disables Buy and Sell on the strict per-symbol quote policy', () => {
  const component = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx',
  );
  const handler = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts',
  );
  const availability = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/tradeAvailability.ts',
  );

  assert.match(
    component,
    /useExecutableQuote\(symbol, active, TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS\)/,
  );
  assert.match(component, /getCurrentExecutableQuoteState/);
  assert.match(component, /resolveChartTradeQuoteAvailability\(\{/);
  assert.match(component, /quoteActionAllowed: quoteActionAvailability\.allowed/);
  assert.match(component, /getCurrentQuoteActionAvailability,/);
  assert.doesNotMatch(component, /quoteActionQuote:/);
  assert.match(component, /resolveChartTradeButtonDisplayQuote/);

  // Fresh public quotes may open the auth prompt; stale public quotes are no
  // longer exempted from the same disabled state as authenticated controls.
  assert.match(
    handler,
    /const isPublicDemoTradePrompt = useUserPreferences\([\s\S]*!state\.isLoggedIn/,
  );
  assert.match(component, /const tradeBlocked = chartTradeActionDisabled \|\| lotInvalid/);
  assert.doesNotMatch(component, /tradeBlocked = isPublicDemoTradePrompt/);
  assert.doesNotMatch(handler, /chartTradeActionDisabled = isPublicDemoTradePrompt/);

  assert.match(availability, /return !isCurrentChartSymbol \|\| !quoteActionAllowed/);
  assert.match(
    availability,
    /quote\.stale === true \|\| toReportedAgeMs\(quote\) > MARKET_QUOTE_STALE_AFTER_MS/,
  );
  assert.match(availability, /quote\.degraded === true/);
  assert.match(component, /tradeBlocked && baseStyles\.chartTradeActionButtonDisabled/);

  // Every immediate dispatch is authorized from the current per-symbol cache.
  assert.match(handler, /currentQuoteActionAvailabilityRef\.current\(\)/);
  assert.doesNotMatch(handler, /tradeQueueRef|processNextQueuedTrade/);
  assert.match(
    handler,
    /const currentQuoteAvailability = resolveCurrentQuoteActionAvailability\(\);[\s\S]*if \(!currentQuoteAvailability\.allowed\)[\s\S]*if \(!oneClickAccepted && variant !== 'mt5-market'\)/,
  );
  assert.match(
    handler,
    /entryPrice: action\.side === 'buy'[\s\S]*currentQuoteAvailability\.ask[\s\S]*currentQuoteAvailability\.bid/,
  );
  assert.match(
    handler,
    /if \(!oneClickAccepted && variant !== 'mt5-market'\)[\s\S]*showOrderTicketLaunch\(symbol, 'chart'\)[\s\S]*return;[\s\S]*One-click ON:/,
  );
  assert.match(
    handler,
    /resolveChartTradeActionDisabled\(\{[\s\S]*isCurrentChartSymbol,[\s\S]*oneClickAccepted,[\s\S]*quoteActionAllowed,/,
  );
  assert.match(
    handler,
    /isChartTradeActionVisuallyLocked = \(side: TradeSide\) => isChartTradeActionBusy\(side\)/,
  );
});

test('web chart quick trades use the same strict current quote without candle fallback', () => {
  const source = readSource('src/features/chart/ChartScreen.web.tsx');
  const start = source.indexOf('const LiveTradeButtons');
  const end = source.indexOf('// Micro-component:', start + 1);
  const tradeButtons = source.slice(start, end === -1 ? undefined : end);

  assert.match(tradeButtons, /useExecutableQuote\(symbol, active, 16\)/);
  assert.match(tradeButtons, /getCurrentExecutableQuoteState/);
  assert.match(tradeButtons, /resolveChartTradeQuoteAvailability\(\{/);
  assert.match(
    tradeButtons,
    /const currentQuote = getCurrentExecutableQuoteState\(\)/,
  );
  assert.match(
    tradeButtons,
    /const isPublicDemoTradePrompt = useUserPreferences\([\s\S]*!state\.isLoggedIn/,
  );
  assert.match(
    tradeButtons,
    /disabled=\{isPending \|\| !quoteActionAvailability\.allowed\}/,
  );
  assert.match(
    tradeButtons,
    /requestOrrnnDemoTradeAuth\(\{[\s\S]*side,[\s\S]*\}\)[\s\S]*const currentQuote = getCurrentExecutableQuoteState\(\)/,
  );
  assert.doesNotMatch(tradeButtons, /latestTick|latestClose|\.close/);
});
