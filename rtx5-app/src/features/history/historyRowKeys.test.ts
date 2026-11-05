import assert from 'node:assert/strict';
import test from 'node:test';
import { keyHistoryRows } from './historyRowKeys';

test('sorting and inserting different tickets preserve existing native row identities', () => {
  const source = [{ id: 'deal-11', profit: 10 }, { id: 'deal-12', profit: -5 }];
  const keyed = keyHistoryRows(source);
  const sorted = [...keyed].sort((a, b) => a.profit - b.profit);
  assert.equal(sorted[1], keyed[0]);
  assert.equal(sorted[0].listKey, keyed[1].listKey);
  const withNewTicket = keyHistoryRows([{ id: 'deal-13', profit: 4 }, ...source]);
  assert.equal(withNewTicket[1].listKey, keyed[0].listKey);
  assert.equal(withNewTicket[2].listKey, keyed[1].listKey);
  assert.equal('listKey' in source[0], false);
});

test('repeated ticket IDs remain distinct after sorting and survive an equivalent refresh', () => {
  const source = [{ id: 'position-7', profit: 10 }, { id: 'position-7', profit: -5 }];
  const keyed = keyHistoryRows(source);
  assert.equal(keyed.length, 2);
  assert.notEqual(keyed[0].listKey, keyed[1].listKey);
  assert.deepEqual(keyHistoryRows(source.map(row => ({ ...row }))).map(row => row.listKey), keyed.map(row => row.listKey));
  assert.equal([...keyed].reverse()[0].listKey, keyed[1].listKey);
});

test('punctuation in opaque broker identities cannot collide with occurrence suffixes', () => {
  const rows = keyHistoryRows([{ id: 'p-1' }, { id: 'p-1' }, { id: 'p-1-1' }, { id: '["p-1",1]' }]);
  assert.equal(new Set(rows.map(row => row.listKey)).size, rows.length);
});
