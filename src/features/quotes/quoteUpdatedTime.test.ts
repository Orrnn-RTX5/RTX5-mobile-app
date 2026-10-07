import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { formatQuoteUpdatedTime } from './quoteUpdatedTime';
import { applyLiveQuoteTickToSnapshot } from './liveQuoteSnapshot';

const serverTime = Date.parse('2026-10-01T01:30:45Z');

test('Updated uses the latest server quote timestamp in the existing broker timezone', () => {
  assert.equal(formatQuoteUpdatedTime([
    { feedTickAt: serverTime - 2000 },
    { feedTickAt: serverTime },
    undefined,
  ]), '07:00:45');
});

test('server timestamp units and ISO strings produce the same broker time', () => {
  for (const feedTickAt of [serverTime, serverTime / 1000, serverTime * 1000, '2026-10-01T01:30:45Z']) {
    assert.equal(formatQuoteUpdatedTime([{ feedTickAt }]), '07:00:45');
  }
});

test('the last server update stays fixed when client receipt time advances', () => {
  const first = applyLiveQuoteTickToSnapshot('EURUSD', undefined, {
    symbol: 'EURUSD', bid: 1.1, ask: 1.1001,
    feedTickAt: serverTime, timestamp: serverTime,
    receivedAt: serverTime + 500,
  }, 1);
  const next = applyLiveQuoteTickToSnapshot('EURUSD', first, {
    symbol: 'EURUSD', bid: 1.2, ask: 1.2001,
    timestamp: serverTime + 120_000, receivedAt: serverTime + 120_000,
  }, 2);
  assert.equal(formatQuoteUpdatedTime([next]), '07:00:45');
  assert.equal(next?.lastReceivedAt, serverTime + 120_000);
});

test('missing server timestamps never display the client clock as broker time', () => {
  const localOnly = applyLiveQuoteTickToSnapshot('EURUSD', undefined, {
    symbol: 'EURUSD', bid: 1.1, ask: 1.1001,
    timestamp: serverTime, receivedAt: serverTime,
  }, 1);
  assert.equal(localOnly?.feedTickAt, undefined);
  assert.equal(formatQuoteUpdatedTime([localOnly]), '--');
  assert.equal(formatQuoteUpdatedTime([]), '--');
  assert.equal(formatQuoteUpdatedTime([{ feedTickAt: NaN }, { feedTickAt: 'invalid' }]), '--');
});

test('broker switching and hidden screens retain no independent device clock', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/quotes/QuotesScreen.tsx'), 'utf8');
  const start = source.indexOf('function BrokerQuoteUpdatedTime(');
  const end = source.indexOf('function TickCounter(', start);
  const clock = source.slice(start, end);
  assert.match(clock, /if \(!active\) return/);
  assert.match(clock, /formatQuoteUpdatedTime\([\s\S]*map\(getCurrentLiveQuoteSnapshot\)/);
  assert.match(clock, /clearInterval\(id\)/);
  assert.doesNotMatch(clock, /Date\.now\(|new Date\(|gmtClock| GMT/);
  assert.match(source, /<BrokerQuoteUpdatedTime\s+key=\{`\$\{quoteLiveProofGenerationKey\}:\$\{selectedBrokerId\}:\$\{isPublicDemoMarket\}`\}/);
});
