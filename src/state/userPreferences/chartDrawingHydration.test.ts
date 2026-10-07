import assert from 'node:assert/strict';
import test from 'node:test';
import { completeChartDrawingHydration } from './chartDrawingHydration';
import { sanitizePersistedChartDrawings, type PersistedChartDrawingsBySymbol } from '../../features/chart/drawingPersistence';

const drawings = (id: string) => sanitizePersistedChartDrawings([{
  id, kind: 'horizontalLine', label: id,
  points: [{ time: 1700000000, price: 1.25 }, { time: 1700000060, price: 1.25 }],
}]);

test('a large drawing file restores all symbols and active labels in one complete ready snapshot', () => {
  const stored: PersistedChartDrawingsBySymbol = Object.fromEntries(
    Array.from({ length: 1000 }, (_, index) => [`SYMBOL${index}`, drawings(`drawing${index}`)]),
  );
  const initial = {};
  const result = completeChartDrawingHydration({ chartSymbol: 'SYMBOL999', chartDrawings: [], chartDrawingRecordsBySymbol: initial }, initial, stored);
  assert.equal(result.hasHydrated, true);
  assert.equal(Object.keys(result.chartDrawingRecordsBySymbol).length, 1000);
  assert.equal(result.chartDrawingRecordsBySymbol.SYMBOL999, stored.SYMBOL999, 'already sanitized records are reused');
  assert.deepEqual(result.chartDrawings, ['drawing999']);
  assert.deepEqual(initial, {});
});

test('late disk reads preserve edits and deletions while restoring unchanged buckets', () => {
  const before = { EURUSD: drawings('old-eur'), GBPUSD: drawings('old-gbp'), USDJPY: drawings('old-jpy') };
  const current = { ...before, EURUSD: drawings('new-eur'), GBPUSD: [] };
  const stored = { EURUSD: drawings('disk-eur'), GBPUSD: drawings('disk-gbp'), USDJPY: drawings('disk-jpy') };
  const result = completeChartDrawingHydration({ chartSymbol: 'EURUSD', chartDrawings: ['new-eur'], chartDrawingRecordsBySymbol: current }, before, stored);
  assert.equal(result.chartDrawingRecordsBySymbol.EURUSD, current.EURUSD);
  assert.equal(result.chartDrawingRecordsBySymbol.GBPUSD, current.GBPUSD);
  assert.equal(result.chartDrawingRecordsBySymbol.USDJPY, stored.USDJPY);
  assert.deepEqual(result.chartDrawings, ['new-eur']);
  assert.equal(current.USDJPY, before.USDJPY);
});

test('a symbol change during hydration derives labels from the currently selected chart', () => {
  const result = completeChartDrawingHydration({ chartSymbol: 'GBPUSD', chartDrawings: [], chartDrawingRecordsBySymbol: {} }, {}, { EURUSD: drawings('eur'), GBPUSD: drawings('gbp') });
  assert.deepEqual(result.chartDrawings, ['gbp']);
});

test('missing or empty separate storage preserves migrated drawings and marks preferences ready', () => {
  const existing = { EURUSD: drawings('legacy') };
  const current = { chartSymbol: 'EURUSD', chartDrawings: ['legacy'], chartDrawingRecordsBySymbol: existing };
  const storedCases: PersistedChartDrawingsBySymbol[] = [{}, { EURUSD: [] }];
  for (const stored of storedCases) {
    const result = completeChartDrawingHydration(current, existing, stored);
    assert.equal(result.hasHydrated, true);
    assert.equal(result.chartDrawingRecordsBySymbol, existing);
    assert.equal(result.chartDrawings, current.chartDrawings);
  }
});
