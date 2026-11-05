import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// The store imports react-native (AsyncStorage), which this node runner
// cannot load, so the latency pairing is pinned at the source level.
const source = readFileSync(resolve(process.cwd(), 'src/state/terminalJournalState.ts'), 'utf8');

test('request rows are paired with their result and back-filled with its latency', () => {
  assert.match(source, /setEntryLatency: \(id: string, latencyMs: number\) => void/);
  assert.match(
    source,
    /function takeRequestLatencyMs\(key: string\)[\s\S]*pendingRequests\.delete\(key\)[\s\S]*setEntryLatency\(pending\.entryId, latencyMs\)/,
  );
  assert.match(source, /const PENDING_REQUEST_MAX = 50/);
});

test('market orders, close, modify and account flows are all timed', () => {
  assert.match(source, /markRequestStarted\(`order:\$\{payload\.started_at_ms\}`, id, payload\.started_at_ms\)/);
  assert.match(source, /takeRequestLatencyMs\(`order:\$\{payload\.started_at_ms\}`\) \?\? measureLatencyMs\(payload\.started_at_ms\)/);
  assert.equal((source.match(/latencyMs: takeOrderLatencyMs\(payload\)|const latencyMs = takeOrderLatencyMs\(payload\)/g) ?? []).length, 2);
  for (const kind of ['close', 'modify']) {
    assert.match(source, new RegExp(`markRequestStarted\\(\`${kind}:\\$\\{ticketId\\}\`, id\\)`));
    assert.equal(
      (source.match(new RegExp(`takeRequestLatencyMs\\(\`${kind}:\\$\\{ticketId\\}\`\\)`, 'g')) ?? []).length,
      2,
      `${kind} success and failure must both report latency`,
    );
  }
  assert.match(source, /const ACCOUNT_FLOW_PREFIXES = \['broker detail login', 'demo account', 'account switch', 'login'\]/);
  assert.match(source, /if \(flowKey && \/\\brequested\\b\/i\.test\(trimmedMessage\)\) \{\s*markRequestStarted\(flowKey, id\);/);
});

test('placeMarketOrder stamps the start time on the journal payload', () => {
  const orderSource = readFileSync(resolve(process.cwd(), 'src/api/orders/placeMarketOrder.ts'), 'utf8');
  assert.match(orderSource, /started_at_ms: Date\.now\(\),\s*\};\s*recordMarketOrderJournalRequest\(journalPayload\)/);
});

test('LATENCY prefers the measured gateway round trip over whole-flow time', () => {
  const orderSource = readFileSync(resolve(process.cwd(), 'src/api/orders/placeMarketOrder.ts'), 'utf8');
  const positionsSource = readFileSync(resolve(process.cwd(), 'src/api/positions/index.ts'), 'utf8');

  assert.match(source, /const latencyMs = pending\.gatewayLatencyMs \?\? measureLatencyMs\(pending\.startedAtMs\)/);
  assert.equal((orderSource.match(/recordMarketOrderGatewayLatency\(journalPayload, durationMs\)/g) ?? []).length, 2);
  assert.match(
    positionsSource,
    /const sentAtMs = getApiLatencyNow\(\);[\s\S]*recordClosePositionGatewayLatency\(descriptor\.ticket, getApiLatencyNow\(\) - sentAtMs\)/,
  );
  assert.match(
    positionsSource,
    /replayAfterAuthRefresh: false,\s*\}\);\s*recordModifyPositionGatewayLatency\(normalizedTicket\.path, getApiLatencyNow\(\) - sentAtMs\)/,
  );
});

test('a filled market order writes the web-terminal Timing and Order filled pair', () => {
  const success = source.slice(
    source.indexOf('export function recordMarketOrderJournalSuccess('),
    source.indexOf('function formatTradeText('),
  );

  assert.match(source, /Trade started: \$\{buildMarketOrderText\(payload\)\}/);
  assert.match(success, /message: `\$\{formatLoginPrefix\(login\)\}Timing \$\{tradeText\}`/);
  assert.match(success, /message: `\$\{formatLoginPrefix\(login\)\}Order \$\{tradeText\} filled\$\{priceText\}\$\{ticketText\}`/);
  assert.equal((success.match(/latencyMs,\n/g) ?? []).length, 2, 'both rows carry the gateway latency');
  assert.equal((success.match(/origin: 'Gateway'/g) ?? []).length, 2);
});

test('the Terminal executed row is driven by the backend realtime event', () => {
  const orderSource = readFileSync(resolve(process.cwd(), 'src/api/orders/placeMarketOrder.ts'), 'utf8');
  const positionsSource = readFileSync(resolve(process.cwd(), 'src/api/positions/index.ts'), 'utf8');
  const realtimeSource = readFileSync(resolve(process.cwd(), 'src/api/ws/BrokerRealtimeService.ts'), 'utf8');
  const terminal = source.slice(source.indexOf('export function recordTerminalExecutionEvent('));

  // Each attempt is watched by its own client_order_id from the moment it is sent.
  assert.match(
    orderSource,
    /const startedAtMs = getApiLatencyNow\(\);[\s\S]{0,300}watchMarketOrderExecution\(clientOrderId, \{ \.\.\.journalPayload, symbol: canonicalSymbol \}, startedAtMs\)/,
  );
  assert.match(positionsSource, /watchClosePositionExecution\(prepared\.clientOrderId, descriptor\.ticket, sentAtMs\)/);
  // The realtime event's echoed client_order_id closes the watch.
  assert.match(realtimeSource, /recordTerminalExecutionEvent\(frame\.clientOrderId, eventName, frame\.payload\)/);

  assert.match(source, /const ORDER_EXECUTION_EVENT = \/\(opened\|increased\|decreased\|reversed\)\$\//);
  assert.match(terminal, /const latencyMs = nowMs - watch\.sentAtMs/);
  assert.match(terminal, /origin: 'Terminal'/);
  // Price and ticket come from the backend event, not the request.
  assert.match(terminal, /formatPrice\(row\.price_open \?\? row\.price, symbol\)/);
  assert.match(terminal, /row\.ticket \?\? row\.position_ticket \?\? watch\.ticket/);
  assert.match(terminal, /executionWatches\.delete\(id\)/);
  assert.match(source, /return Math\.max\(0, Math\.round\(latencyMs \* 10\) \/ 10\)/);
});
