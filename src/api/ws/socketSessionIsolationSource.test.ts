import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const socketFiles = [
  'src/api/ws/socket.ts',
  'src/api/ws/accountSocket.ts',
  'src/api/ws/BrokerRealtimeService.ts',
  'src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts',
] as const;

test('non-quote sockets resolve only the immutable active trading endpoint', () => {
  for (const file of socketFiles) {
    const contents = source(file);
    assert.match(contents, /brokerApi\.getWebSocketUrl\(\)/, file);
    assert.match(contents, /isActiveBrokerSessionCurrent/, file);
    assert.doesNotMatch(contents, /useUserPreferences|brokerServerUrl|buildBrokerWsUrl/, file);
    assert.doesNotMatch(contents, /EXPO_PUBLIC_(?:WS|ACCOUNT_WS|CANDLES_WS)|DEFAULT_[A-Z_]*WS/, file);
  }
});

test('socket callbacks reject old broker/account/epoch captures before writes', () => {
  for (const file of socketFiles) {
    const contents = source(file);
    assert.match(contents, /getActiveBrokerSessionIdentity|ActiveBrokerSessionIdentity|AccountWsSession/, file);
    assert.match(
      contents,
      /this\.ws !== socket[\s\S]{0,220}isActiveBrokerSessionCurrent/,
      file,
    );
    assert.match(contents, /payloadMatchesSocketIdentity/, file);
  }
  const brokerRealtime = source('src/api/ws/BrokerRealtimeService.ts');
  assert.match(brokerRealtime, /captureActiveBrokerSessionOwnerStamp/);
  assert.match(brokerRealtime, /isActiveBrokerSessionOwnerStampCurrent\(ownerStamp\)/);
});

test('non-quote sockets stop reconnecting on authentication close codes', () => {
  for (const file of socketFiles) {
    const contents = source(file);
    assert.match(contents, /isSocketAuthenticationFailure\(event\?\.code\)/, file);
  }
});

test('candle protocol accepts exact WSS only and has no shared fallback', () => {
  const protocol = source('src/domain/candles/ws/candlesSocketProtocol.ts');
  assert.match(protocol, /normalizeBrokerWssUrl\(exactTradeWsBase\)/);
  assert.doesNotMatch(protocol, /backend\.orrnn\.com|buildBrokerWsUrl|normalizeConfiguredWsUrl/);
});

test('gateway health uses the exact active feedStatusUrl and rejects stale responses', () => {
  const health = source('src/api/health.ts');
  assert.match(health, /const statusUrl = capture\.session\.feedStatusUrl/);
  assert.match(health, /timedFetch\(statusUrl/);
  assert.match(health, /isActiveBrokerSessionCurrent\(identity\)/);
  assert.doesNotMatch(health, /apiClient\('\/health'\)|buildBrokerHealthUrl|brokerServerUrl/);
});

test('protection terminal handling tombstones its exact ticket before reconciliation', () => {
  const brokerRealtime = source('src/api/ws/BrokerRealtimeService.ts');
  const handlerStart = brokerRealtime.indexOf('private handleProtectionTriggered(');
  const handlerEnd = brokerRealtime.indexOf(
    'private applyRealtimePositionsBatch(',
    handlerStart,
  );

  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);
  const handler = brokerRealtime.slice(handlerStart, handlerEnd);
  assert.match(
    handler,
    /notifyModifyPositionSocketHint\(\s*\[terminalEvent\.ticket\],\s*identity\.accountLogin,\s*\)/,
  );
  assert.match(
    handler,
    /usePositionsState\.getState\(\)\.finishOptimisticClose\(terminalEvent\.ticket\)/,
  );
  assert.match(
    handler,
    /processedTerminalEvents\.has\(dedupeKey\)[\s\S]*return true;[\s\S]*processedTerminalEvents\.add\(dedupeKey\)/,
  );
  assert.doesNotMatch(
    handler,
    /applyRealtimePositionUpdate|stripUnversionedPositionProtection|upsertPosition/,
  );
  assert.ok(
    handler.indexOf('finishOptimisticClose(terminalEvent.ticket)') <
      handler.indexOf('notifyModifyPositionSocketHint('),
  );
  assert.ok(
    handler.indexOf('notifyModifyPositionSocketHint(') <
      handler.indexOf('schedulePositionsReconciliation(identity)'),
  );
});

test('queued position reconciliation is bound to the current socket and owner stamp', () => {
  const brokerRealtime = source('src/api/ws/BrokerRealtimeService.ts');
  const reconcileStart = brokerRealtime.indexOf(
    'private schedulePositionsReconciliation(',
  );
  const reconcileEnd = brokerRealtime.indexOf(
    'private clearPositionsReconcileTimer(',
    reconcileStart,
  );

  assert.notEqual(reconcileStart, -1);
  assert.notEqual(reconcileEnd, -1);
  const reconcile = brokerRealtime.slice(reconcileStart, reconcileEnd);
  assert.match(reconcile, /const socket = this\.ws/);
  assert.match(reconcile, /const ownerStamp = this\.activeOwnerStamp/);
  assert.match(
    reconcile,
    /this\.positionsReconcileSocket === socket/,
  );
  assert.match(
    reconcile,
    /sameOwnerStamp\(this\.positionsReconcileOwnerStamp, ownerStamp\)/,
  );
  assert.match(
    reconcile,
    /sameOwnerStamp\(this\.activeOwnerStamp, ownerStamp\)/,
  );
  assert.match(
    reconcile,
    /isActiveBrokerSessionOwnerStampCurrent\(ownerStamp\)/,
  );
  assert.match(
    reconcile,
    /this\.ws !== socket[\s\S]*this\.positionsReconcileSocket !== socket/,
  );
  assert.match(
    reconcile,
    /this\.positionsReconcileTimer !== reconcileTimer[\s\S]*return;/,
  );
});
