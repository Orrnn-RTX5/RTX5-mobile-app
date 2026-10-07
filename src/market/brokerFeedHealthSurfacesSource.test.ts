import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('authenticated price surfaces show broker-scoped outage reason, last success, and retry', () => {
  const banner = readSource('src/market/BrokerFeedHealthBanner.tsx');
  const chart = readSource('src/features/chart/ChartScreen.native.tsx');
  const details = readSource('src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx');
  const trade = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');

  assert.match(
    banner,
    /buildFeedHealthBannerModel\(state, brokerName \|\| identity\.brokerId\)/,
  );
  // Contract v3: the quote feed has no auth contract to surface.
  assert.doesNotMatch(banner, /feedAuthContext/);
  assert.match(banner, /feedHealthStateMatchesIdentity\(state, identity\)/);
  assert.match(banner, /requestFeedHealthRetry\(identity\)/);
  assert.match(banner, /t\('Last success'\)/);
  assert.match(banner, /model\.reasonLabel/);
  assert.match(chart, /<BrokerFeedHealthBanner[\s\S]*latencyLabel="chart\.feedHealth\.retry"/);
  assert.match(details, /<BrokerFeedHealthBanner[\s\S]*latencyLabel="symbolDetails\.feedHealth\.retry"/);
  assert.match(trade, /feedHealthModel\.lastSuccessAt/);
});
