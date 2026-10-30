import test from 'node:test';
import assert from 'node:assert/strict';
import { createTradePositionActionHostController } from './tradePositionActionHostController';

test('chart chips retain the exact ticket and selected protection field; subsequent actions reset the selection', () => {
  const host = createTradePositionActionHostController();
  const ticket = '9007199254740993123';
  const tpRevision = host.show('modify', ticket, 'tp');
  assert.equal(host.getSnapshot().positionId, ticket);
  assert.equal(host.getSnapshot().protectionLevel, 'tp');
  host.show('modify', '82', 'sl');
  assert.equal(host.hide(tpRevision), false);
  assert.equal(host.getSnapshot().protectionLevel, 'sl');
  assert.equal(host.getSnapshot().positionId, '82');
  host.hide();
  host.show('modify', ticket);
  assert.equal(host.getSnapshot().protectionLevel, null);
  host.show('close', ticket, 'tp');
  assert.equal(host.getSnapshot().protectionLevel, null);
});
