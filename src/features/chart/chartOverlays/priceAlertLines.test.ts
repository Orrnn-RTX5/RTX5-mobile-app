import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import type { PriceAlert } from '../../../api/alerts';
import { buildPriceAlertLines } from './lineBuilders';

const alert = (id: number, condition: PriceAlert['condition']): PriceAlert => ({
  id,
  symbol: 'EURUSD',
  condition,
  price: 1.1 + id / 1000,
  message: '',
  triggered: false,
  created_at: 0,
});

test('chart alert lines label above, below and cross separately', () => {
  const lines = buildPriceAlertLines(
    [alert(1, 'above'), alert(2, 'below'), alert(3, 'cross')],
    'EURUSD',
  );
  assert.deepEqual(lines.map((line) => line.title), ['ALERT ABOVE', 'ALERT BELOW', 'ALERT CROSS']);
  assert.equal(new Set(lines.map((line) => line.color)).size, 3);
});

test('alert rows show a Cross label instead of treating cross as Below', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/chart/PriceAlertsScreen/AlertRow.tsx'),
    'utf8',
  );
  assert.match(source, /isCross = alert\.condition === 'cross'/);
  assert.match(source, /'↕ Cross'/);
});
