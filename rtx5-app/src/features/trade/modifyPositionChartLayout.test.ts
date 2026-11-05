import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveModifyPositionMarkerYPositions } from './modifyPositionChartLayout';

test('modify position chart markers separate different prices that land on nearby pixels', () => {
  const positions = resolveModifyPositionMarkerYPositions(
    [
      { key: 'ask', value: 1.10003, y: 50 },
      { key: 'bid', value: 1.10001, y: 51 },
      { key: 'sl', value: 1.09999, y: 52 },
      { key: 'tp', value: 1.10006, y: 49 },
    ],
    {
      chartHeight: 140,
      sameValueEpsilon: 0.000001,
      minGapPx: 24,
    },
  );

  assert.equal(Math.abs((positions.tp ?? 0) - (positions.ask ?? 0)) >= 24, true);
  assert.equal(Math.abs((positions.ask ?? 0) - (positions.bid ?? 0)) >= 24, true);
  assert.equal(Math.abs((positions.bid ?? 0) - (positions.sl ?? 0)) >= 24, true);
});

test('modify position chart markers overlap only for prices considered the same value', () => {
  const positions = resolveModifyPositionMarkerYPositions(
    [
      { key: 'ask', value: 1.10001, y: 50 },
      { key: 'bid', value: 1.1000104, y: 51 },
      { key: 'sl', value: 1.0998, y: 70 },
    ],
    {
      chartHeight: 140,
      sameValueEpsilon: 0.000001,
      minGapPx: 24,
    },
  );

  assert.equal(positions.ask, positions.bid);
  assert.equal(Math.abs((positions.bid ?? 0) - (positions.sl ?? 0)) >= 24, true);
});
