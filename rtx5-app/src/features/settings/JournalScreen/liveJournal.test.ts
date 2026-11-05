import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ClosedPosition } from '../../../api/positions';
import type { PositionItem } from '../../../dev/mock/tradingData';
import type { TradeJournalEntry } from './types';
import {
  mapClosedPositionToJournalEntry,
  mapOpenPositionToJournalEntry,
  mergeJournalEntries,
} from './liveJournalMapper';
import {
  advanceJournalSelectionForToday,
  filterClosedHistoryByRange,
  filterJournalEntriesByRetention,
} from './journalRetention';

function makeClosedPosition(overrides: Partial<ClosedPosition> & Record<string, unknown> = {}): ClosedPosition {
  return {
    ticket: 100,
    account_login: 200074,
    symbol: 'BTCUSD',
    side: 'buy',
    volume: 0.1,
    price_open: 30_000,
    price_close: 30_500,
    price_sl: 29_800,
    price_tp: 30_600,
    profit: 50,
    swap: -1,
    commission: -2,
    comment: 'EA close',
    time_create: 1_700_000_000,
    time_update: 1_700_000_900,
    time_close: 1_700_000_900,
    ...overrides,
  } as ClosedPosition;
}

function makeManualEntry(overrides: Partial<TradeJournalEntry> = {}): TradeJournalEntry {
  return {
    id: 'manual-1',
    createdAt: '2026-01-02T10:00:00.000Z',
    date: '2026-01-02T10:00:00.000Z',
    session: 'London',
    market: 'Forex',
    symbol: 'EURUSD',
    tradeType: 'Buy',
    strategy: 'Breakout',
    pnlMoney: 25,
    result: 'Win',
    ...overrides,
  };
}

function makeOpenPosition(overrides: Partial<PositionItem> = {}): PositionItem {
  return {
    id: '501',
    symbol: 'EURUSD',
    side: 'buy',
    volume: 0.5,
    openPrice: 1.08234,
    currentPrice: 1.0846,
    pnl: 72.4,
    swap: 0,
    openTime: '2026-06-12T04:11:00.000Z',
    sl: 1.0802,
    tp: 1.0878,
    ...overrides,
  };
}

test('mapClosedPositionToJournalEntry maps account history into a live journal entry', () => {
  const entry = mapClosedPositionToJournalEntry(makeClosedPosition({ fee: -0.25 }));

  assert.equal(entry.id, 'live-100-BTCUSD-1700000900-0.1-30500');
  assert.equal(entry.createdAt, '2023-11-14T22:13:20.000Z');
  assert.equal(entry.date, '2023-11-14T22:28:20.000Z');
  assert.equal(entry.market, 'Crypto');
  assert.equal(entry.symbol, 'BTCUSD');
  assert.equal(entry.tradeType, 'Buy');
  assert.equal(entry.entryPrice, 30_000);
  assert.equal(entry.exitPrice, 30_500);
  assert.equal(entry.lotSize, 0.1);
  assert.equal(entry.pnlMoney, 46.75);
  assert.equal(entry.result, 'Win');
  assert.equal(entry.finalRMultiple, 2.5);
  assert.equal(entry.rewardToRiskRatio, 3);
  assert.equal(entry.closeType, 'Manual Close');
  assert.equal(entry.entryReason, 'EA close');
});

test('mapClosedPositionToJournalEntry computes negative R for losing sell history', () => {
  const entry = mapClosedPositionToJournalEntry(
    makeClosedPosition({
      ticket: 200,
      symbol: 'EURUSD',
      side: 'sell',
      price_open: 1.1,
      price_close: 1.12,
      price_sl: 1.11,
      price_tp: 1.08,
      profit: -20,
      swap: 0,
      commission: 0,
      fee: 0,
    }),
  );

  assert.equal(entry.market, 'Forex');
  assert.equal(entry.tradeType, 'Sell');
  assert.equal(entry.result, 'Loss');
  assert.equal(Number(entry.finalRMultiple?.toFixed(2)), -2);
});

test('mapOpenPositionToJournalEntry maps live open positions for snapshot activity', () => {
  const entry = mapOpenPositionToJournalEntry(
    makeOpenPosition(),
    Date.parse('2026-06-12T04:45:00.000Z'),
  );

  assert.equal(entry.id, 'open-501-EURUSD-1781237460000');
  assert.equal(entry.createdAt, '2026-06-12T04:11:00.000Z');
  assert.equal(entry.date, '2026-06-12T04:45:00.000Z');
  assert.equal(entry.market, 'Forex');
  assert.equal(entry.tradeType, 'Buy');
  assert.equal(entry.entryPrice, 1.08234);
  assert.equal(entry.exitPrice, 1.0846);
  assert.equal(entry.stopLoss, 1.0802);
  assert.equal(entry.takeProfit, 1.0878);
  assert.equal(entry.lotSize, 0.5);
  assert.equal(entry.pnlMoney, 72.4);
  assert.equal(entry.result, 'Open');
});

test('mergeJournalEntries preserves manual entries and sorts all rows by trade date', () => {
  const olderLive = mapClosedPositionToJournalEntry(makeClosedPosition({ ticket: 300, time_close: 1_700_000_000 }));
  const newerManual = makeManualEntry({
    id: 'manual-newer',
    date: '2026-01-02T10:00:00.000Z',
  });

  const merged = mergeJournalEntries([olderLive], [newerManual]);

  assert.deepEqual(merged.map((entry) => entry.id), ['manual-newer', olderLive.id]);
  assert.equal(merged[0], newerManual);
});

test('filterJournalEntriesByRetention keeps only the current local calendar day', () => {
  const now = new Date(2026, 5, 12, 23, 59, 59, 999);
  const retainedFromMidnight = makeManualEntry({
    id: 'retained-midnight',
    date: new Date(2026, 5, 12, 0, 0, 0, 0).toISOString(),
  });
  const retainedUntilEndOfDay = makeManualEntry({
    id: 'retained-end-of-day',
    date: new Date(2026, 5, 12, 23, 59, 0, 0).toISOString(),
  });
  const expiredPreviousDay = makeManualEntry({
    id: 'expired-previous-day',
    date: new Date(2026, 5, 11, 23, 59, 59, 999).toISOString(),
  });
  const expiredNextDay = makeManualEntry({
    id: 'expired-next-day',
    date: new Date(2026, 5, 13, 0, 0, 0, 0).toISOString(),
  });
  const fallbackRetained = makeManualEntry({
    id: 'fallback-retained',
    date: 'bad-date',
    createdAt: new Date(2026, 5, 12, 1, 0, 0, 0).toISOString(),
  });

  const visible = filterJournalEntriesByRetention(
    [expiredPreviousDay, retainedFromMidnight, retainedUntilEndOfDay, expiredNextDay, fallbackRetained],
    now.getTime(),
  );

  assert.deepEqual(visible.map((entry) => entry.id), ['retained-midnight', 'retained-end-of-day', 'fallback-retained']);
});

test('filterClosedHistoryByRange keeps authoritative closes inside the Journal day', () => {
  const records = [
    makeClosedPosition({ ticket: 1, time_close: 1_700_000_000 }),
    makeClosedPosition({ ticket: 2, time_close: 1_700_000_100_000 }),
    makeClosedPosition({ ticket: 3, time_close: 1_700_000_300 }),
    makeClosedPosition({ ticket: 4, time_close: undefined, time_update: 1_700_000_200 }),
  ];

  const visible = filterClosedHistoryByRange(records, 1_700_000_050, 1_700_000_300);

  assert.deepEqual(visible.map((record) => record.ticket), [2, 4]);
});

test('Journal follows midnight only while the user is viewing Today', () => {
  assert.equal(
    advanceJournalSelectionForToday('2026-08-13', '2026-08-13', '2026-08-14'),
    '2026-08-14',
  );
  assert.equal(
    advanceJournalSelectionForToday('2026-08-10', '2026-08-13', '2026-08-14'),
    '2026-08-10',
  );
  assert.equal(
    advanceJournalSelectionForToday('2026-08-15', '2026-08-13', '2026-08-14'),
    '2026-08-14',
  );
});
