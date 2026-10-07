import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/trade/TradeScreen/TradeScreen.tsx'),
  'utf8',
);

test('trade overview visibly labels broker-scoped delayed/unavailable prices', () => {
  assert.match(source, /buildFeedHealthBannerModel/);
  assert.match(source, /feedHealthStateMatchesIdentity/);
  assert.match(source, /accessibilityRole="alert"/);
  assert.match(source, /feedHealthModel\.brokerLabel/);
  assert.match(source, /requestFeedHealthRetry\(activeFeedIdentity\)/);
  assert.match(source, /quotesWsService\.connect\(\)/);
});
