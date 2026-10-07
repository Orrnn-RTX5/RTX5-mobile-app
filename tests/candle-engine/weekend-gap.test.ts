import assert from 'node:assert/strict';
import test from 'node:test';

import { getBucketGapCount, getExpectedNextCandleTime } from '../../src/domain/candles/core/candles';
import { materializeCanonicalHistoryAndLiveCandles } from '../../src/domain/candles/core/candles';
import { resolveVisibleSeriesMode } from '../../src/domain/candles/ws/liveCandlesEnginePolicy';
import {
  assertNoDuplicateCandleTimes,
  makeBackendLiveCandle,
  makeTrustedHistoryCandle,
  secondsUtc,
} from '../support/candleTestUtils';

test('D1 Friday-to-Monday market gap preserves missing UTC daily buckets', () => {
  const friday = secondsUtc(2024, 3, 19, 0, 0, 0);
  const saturday = secondsUtc(2024, 3, 20, 0, 0, 0);
  const monday = secondsUtc(2024, 3, 22, 0, 0, 0);

  assert.equal(getExpectedNextCandleTime(friday, 'D1'), saturday);
  assert.equal(getBucketGapCount(friday, monday, 'D1'), 3);
});

test('daily weekend rollover merges without fabricating Saturday or Sunday candles', () => {
  const friday = secondsUtc(2024, 3, 19, 0, 0, 0);
  const monday = secondsUtc(2024, 3, 22, 0, 0, 0);
  const history = [makeTrustedHistoryCandle(friday, { serverTimeframe: 'D1' })];
  const live = [makeBackendLiveCandle(monday, { serverTimeframe: 'D1' })];

  assert.equal(resolveVisibleSeriesMode(history, live, history, 'D1'), 'merged');

  const visible = materializeCanonicalHistoryAndLiveCandles(history, live, 'D1');
  assert.deepEqual(visible.map((candle) => candle.time), [friday, monday]);
  assertNoDuplicateCandleTimes(visible);
});
