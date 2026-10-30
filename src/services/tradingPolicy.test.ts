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

test('enabled contract v3 instruments do not require the omitted trade_mode field', () => {
  const btc = { symbol: 'BTCUSD', enabled: true, min_volume: .01, max_volume: 100, volume_step: .01 };
  for (const side of ['buy', 'sell']) assert.equal(checkOrderPolicy(btc, .05, side, { status: 'active' }), null);
  for (const enabled of [undefined, false, 'true', 1]) {
    assert.ok(checkOrderPolicy({ ...btc, enabled }, .05, 'buy', {}));
  }
  for (const trade_mode of [0, 3, null, '', 'unknown']) {
    assert.ok(checkOrderPolicy({ ...btc, trade_mode }, .05, 'buy', {}), `explicit mode ${trade_mode} must not be overridden by enabled`);
  }
  for (const restricted of [
    { ...btc, visible: false }, { ...btc, trade_enabled: false },
    { ...btc, min_volume: undefined }, { ...btc, volume_step: undefined },
  ]) assert.ok(checkOrderPolicy(restricted, .05, 'buy', {}));
  assert.ok(checkOrderPolicy(btc, .015, 'buy', {}));
  assert.ok(checkOrderPolicy(btc, .05, 'buy', { trading_enabled: false }));
});

test('wire trading modes normalize numeric strings and case while retaining side restrictions', () => {
  for (const trade_mode of [4, '4', ' full ', 'FULL', 'Enabled', 'BOTH']) {
    for (const side of ['buy', 'sell']) assert.equal(checkOrderPolicy({ ...instrument, trade_mode }, .05, side, {}), null);
  }
  for (const trade_mode of [1, '1', 'LONGONLY', 'long_only']) {
    assert.equal(checkOrderPolicy({ ...instrument, trade_mode }, .05, 'buy', {}), null);
    assert.ok(checkOrderPolicy({ ...instrument, trade_mode }, .05, 'sell', {}));
  }
  for (const trade_mode of [2, '2', 'SHORTONLY', 'short_only']) {
    assert.equal(checkOrderPolicy({ ...instrument, trade_mode }, .05, 'sell', {}), null);
    assert.ok(checkOrderPolicy({ ...instrument, trade_mode }, .05, 'buy', {}));
  }
  assert.equal(checkOrderPolicy({ ...instrument, trade_mode: undefined, tradeMode: '4' }, .05, 'buy', {}), null);
  for (const trade_mode of ['0', '3', 'disabled', 'closeonly', true, NaN, 5]) {
    assert.ok(checkOrderPolicy({ ...instrument, trade_mode }, .05, 'buy', {}));
  }
});
