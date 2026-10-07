import assert from 'node:assert/strict';
import test from 'node:test';
import { SymbolQuoteBatch } from './symbolQuoteBatch';

test('10,000 ticks copy a 100-symbol committed map once and preserve the previous React snapshot', () => {
  const batch = new SymbolQuoteBatch<{ bid: number; volume: number }>();
  const previous = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`S${index}`, Object.freeze({ bid: 1, volume: index })]));
  let copies = 0;
  const committed = new Proxy(previous, { ownKeys: target => { copies++; return Reflect.ownKeys(target); } });
  for (let tick = 0; tick < 10_000; tick++) {
    const symbol = `S${tick % 100}`;
    const current = batch.get(symbol, committed)!;
    batch.set(symbol, { ...current, bid: current.bid + 1 });
  }
  assert.equal(copies, 0, 'individual ticks must not enumerate/copy all symbols');
  const next = batch.commit(committed);
  assert.equal(copies, 1);
  for (let index = 0; index < 100; index++) {
    assert.deepEqual(next[`S${index}`], { bid: 101, volume: index });
    assert.equal(previous[`S${index}`].bid, 1);
  }
  assert.equal(batch.commit(next), next, 'empty commits must preserve snapshot identity');
});

test('clearing on blur/session change discards obsolete ticks without mutating committed values', () => {
  const batch = new SymbolQuoteBatch<{ bid: number }>();
  const old = { EURUSD: { bid: 1 } };
  batch.set('EURUSD', { bid: 2 });
  batch.clear();
  const newSession = { BTCUSD: { bid: 65000 } };
  assert.equal(batch.commit(newSession), newSession);
  assert.equal(batch.get('EURUSD', newSession), undefined);
  assert.equal(old.EURUSD.bid, 1);
});
