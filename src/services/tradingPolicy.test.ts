import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOrderPolicy } from './tradingPolicy';
const instrument = { symbol: 'EURUSD.pro', trade_mode: 4, volume_min: .01, volume_max: 10, volume_step: .01 };
test('account symbols require visibility, trading mode and exact volume restrictions', () => {
  assert.equal(checkOrderPolicy(instrument, .02, 'buy', {}), null);
  for (const volume of [0, .001, .015, 11, NaN]) assert.ok(checkOrderPolicy(instrument, volume, 'buy', {}));
  for (const restricted of [null, { ...instrument, visible: false }, { ...instrument, trade_mode: 0 }, { ...instrument, trade_mode: 3 }, { ...instrument, trade_mode: undefined }, { ...instrument, volume_min: undefined }]) assert.ok(checkOrderPolicy(restricted, .02, 'buy', {}));
  assert.ok(checkOrderPolicy(instrument, .02, 'buy', { trading_enabled: false }));
  assert.ok(checkOrderPolicy({ ...instrument, trade_mode: 2 }, .02, 'buy', {}));
});
