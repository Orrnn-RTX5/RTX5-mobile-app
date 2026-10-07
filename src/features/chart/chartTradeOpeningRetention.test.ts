import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createChartTradeOpeningRetentionState,
  retainChartTradeOpenings,
} from './chartTradeOpeningRetention';

const opening = (id: string, symbol = 'XAUUSD') => ({
  id,
  symbol,
  side: 'buy' as const,
  volume: 0.01,
  openPrice: 4_588.06 + Number(id),
  openTime: `2026-08-21T16:4${id}:00.000Z`,
});

test('opening survives the live-position removal that follows a close', () => {
  const state = createChartTradeOpeningRetentionState();
  const whileOpen = retainChartTradeOpenings(state, 'broker-a:200156:7', [opening('1')]);
  const afterClose = retainChartTradeOpenings(state, 'broker-a:200156:7', []);

  assert.equal(whileOpen.length, 1);
  assert.deepEqual(afterClose, whileOpen);
});

test('retained openings never cross broker/account session scope', () => {
  const state = createChartTradeOpeningRetentionState();
  retainChartTradeOpenings(state, 'broker-a:200156:7', [opening('1')]);

  assert.deepEqual(retainChartTradeOpenings(state, 'broker-b:300156:8', []), []);
  assert.deepEqual(retainChartTradeOpenings(state, '', [opening('2')]), []);
});

test('retention remains bounded and keeps the newest observed openings', () => {
  const state = createChartTradeOpeningRetentionState();
  const retained = retainChartTradeOpenings(
    state,
    'broker-a:200156:7',
    [opening('1'), opening('2'), opening('3')],
    2,
  );

  assert.deepEqual(retained.map((position) => position.id), ['2', '3']);
});
