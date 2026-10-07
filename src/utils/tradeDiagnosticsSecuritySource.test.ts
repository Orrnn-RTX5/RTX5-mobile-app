import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('trade and account diagnostics are opt-in and centrally redacted', () => {
  const ticket = readSource('src/features/trade/OrderTicketScreen.tsx');
  const chart = readSource('src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts');
  const nativeChart = readSource('src/features/chart/ChartScreen.native.tsx');
  const market = readSource('src/api/orders/placeMarketOrder.ts');
  const pending = readSource('src/api/orders/placePendingOrder.ts');
  const positions = readSource('src/api/positions/index.ts');
  const accounts = readSource('src/api/accounts.ts');
  const orderQueries = readSource('src/query/orders.ts');

  assert.match(ticket, /ORDER_TICKET_DIAGNOSTICS_ENABLED/);
  assert.match(ticket, /args\.map\(redactDiagnosticValue\)/);
  assert.equal(ticket.match(/const rawMsg = redactSensitiveString/g)?.length, 2);
  assert.match(nativeChart, /const rawMsg = redactSensitiveString/);
  assert.doesNotMatch(ticket, /console\.log\('\[TRADE-(?:BUTTON-PRESS|PAYLOAD|RESPONSE)\]'/);
  for (const source of [chart, market, pending, positions, orderQueries]) {
    assert.match(source, /args\.map\(redactDiagnosticValue\)/);
  }
  // The accounts list endpoint is gone (contract v3); the detail fetch must not
  // log backend payloads. Any future diagnostics there must be redacted.
  if (/console\.(?:log|info|debug|warn)/.test(accounts)) {
    assert.match(accounts, /args\.map\(redactDiagnosticValue\)/);
  }
  assert.doesNotMatch(accounts, /console\.log\([\s\S]{0,120}(?:data|mapped)\)/);
  assert.doesNotMatch(accounts, /Raw backend response:|Mapped accounts:/);
});
