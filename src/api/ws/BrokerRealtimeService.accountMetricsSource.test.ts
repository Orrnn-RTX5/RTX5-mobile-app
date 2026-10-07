import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/api/ws/BrokerRealtimeService.ts'), 'utf8');

test('broker realtime never owns executable quote or tick-derived PnL state', () => {
  const brokerRealtimeSource = source();
  const legacySocketSource = readFileSync(resolve(process.cwd(), 'src/api/ws/socket.ts'), 'utf8');

  assert.doesNotMatch(brokerRealtimeSource, /ticks\.|handleTick|setQuote|calculateFloatingPnlFromTick|setInstrumentSpecs/);
  assert.doesNotMatch(legacySocketSource, /setQuote|extendActiveCandlesFromQuoteTick/);
  assert.match(legacySocketSource, /Quote channels are disabled; executable quotes use \/ws\/feed only/);
});

test('broker realtime subscribes to positions and metrics (no deals) with singular channel messages', () => {
  const brokerRealtimeSource = source();
  const protocolSource = readFileSync(resolve(process.cwd(), 'src/api/ws/tradeSocketProtocol.ts'), 'utf8');

  assert.match(protocolSource, /TRADE_SOCKET_CHANNEL_PREFIXES = \['positions', 'metrics'\] as const/);
  assert.match(protocolSource, /channel: `\$\{prefix\}\.\$\{login\}`/);
  assert.doesNotMatch(protocolSource, /'deals'\]/);
  assert.match(brokerRealtimeSource, /buildTradeSocketSubscriptionMessages\(accountLogin\)/);
  assert.doesNotMatch(brokerRealtimeSource, /ACTIVE_TRADE_CHANNELS/);
  assert.match(brokerRealtimeSource, /this\.activeChannels\.forEach\(\(channel\) => \{[\s\S]*this\.send\(\{ action: 'subscribe', channel \}\)/);
  assert.doesNotMatch(brokerRealtimeSource, /action: 'subscribe',[\s\S]{0,80}channels:/);
  assert.doesNotMatch(brokerRealtimeSource, /const DEFAULT_SYMBOL = 'EURUSD'/);
  assert.doesNotMatch(brokerRealtimeSource, /const DEFAULT_TIMEFRAME = 'M1'/);
  assert.doesNotMatch(brokerRealtimeSource, /ACTIVE_TRADE_CHANNELS = \[[^\]]*'history'/);
  assert.match(brokerRealtimeSource, /channel\.startsWith\('deals\.'\)/);
  assert.match(brokerRealtimeSource, /channel\.startsWith\('history\.'\)/);
  assert.match(brokerRealtimeSource, /asRecord\(record\.position\) \?\?[\s\S]*asRecord\(record\.item\) \?\?[\s\S]*asRecord\(record\.data\)/);
  assert.match(brokerRealtimeSource, /this\.invalidateLifecycleQueries\(eventName, identity\)/);
  assert.match(brokerRealtimeSource, /const frame = parseTradeSocketFrame\(record\)/);
  assert.match(brokerRealtimeSource, /frame\.kind === 'pong' \|\| frame\.kind === 'ack'/);
  assert.match(brokerRealtimeSource, /frame\.kind === 'error'/);
  assert.match(brokerRealtimeSource, /const data = frame\.nested \? frame\.envelope : frame\.payload/);
  assert.match(brokerRealtimeSource, /this\.send\(\{ action: 'ping' \}\)/);
});

test('position_closed replaces the deals channel as the history refresh signal', () => {
  const brokerRealtimeSource = source();

  assert.match(
    brokerRealtimeSource,
    /isHistoryChangingPositionEvent\(eventName\) \|\|[\s\S]*isHistoryPayloadEvent\(channel, eventName, statusName\)[\s\S]*this\.scheduleHistoryQueryInvalidation\(identity\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /positionEventKind === 'closed'[\s\S]*this\.handlePositionClosed\(closedRow, identity\)/,
  );
  const closedStart = brokerRealtimeSource.indexOf('private handlePositionClosed(');
  const closedEnd = brokerRealtimeSource.indexOf('private handleProtectionTriggered(', closedStart);
  const closed = brokerRealtimeSource.slice(closedStart, closedEnd);
  assert.match(closed, /closeReason !== 'netting_close' && closeReason !== 'netting_reverse'/);
  assert.match(closed, /finishOptimisticClose\(ticket\)/);
  assert.match(closed, /this\.invalidateLifecycleQueryRoots\(identity\)/);
  assert.match(
    brokerRealtimeSource,
    /positionEventKind === 'partial_close' \|\| positionEventKind === 'account'[\s\S]*schedulePositionsReconciliation\(identity\)/,
  );
  // The lifecycle refresh reaches the history roots the queries actually use.
  assert.match(
    brokerRealtimeSource,
    /private invalidateLifecycleQueryRoots\([\s\S]*?this\.scheduleHistoryQueryInvalidation\(identity\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /const HISTORY_CACHE_KEYS = \[\s*'positionHistory',\s*'deals',\s*'accountDeals',\s*\] as const/,
  );
  const readQuery = (name: string) =>
    readFileSync(resolve(process.cwd(), 'src/query', `${name}.ts`), 'utf8');
  assert.match(readQuery('positions'), /export const POSITION_HISTORY_KEY = 'positionHistory'/);
  assert.match(readQuery('deals'), /export const DEALS_KEY = 'deals'/);
  assert.match(readQuery('deals'), /export const ACCOUNT_DEALS_KEY = 'accountDeals'/);
  assert.match(readQuery('dealsHistory'), /\['accountDeals', cacheNamespace,/);
});

test('trade socket reconnects with the rotated token after every credential refresh', () => {
  const brokerRealtimeSource = source();
  const brokerApiSource = readFileSync(resolve(process.cwd(), 'src/api/brokerApi.ts'), 'utf8');

  // The refresh path commits every rotated token through the active-session
  // store, which emits `credentials_updated` to subscribers.
  assert.match(brokerApiSource, /updateActiveBrokerSessionCredentials\(identity,/);
  assert.match(
    brokerRealtimeSource,
    /subscribeActiveBrokerSession\(\(event\) => \{[\s\S]*shouldCycleTradeSocketForSessionEvent\(event, this\.shouldReconnect\)[\s\S]*this\.reconnect\(\);/,
  );
  assert.match(brokerRealtimeSource, /if \(this\.isOpening\) \{\s*this\.pendingCredentialCycle = true;/);
  assert.match(brokerRealtimeSource, /this\.consumePendingCredentialCycle\(\) \|\|/);
  // The URL (and its token) is resolved fresh for every open.
  assert.match(brokerRealtimeSource, /const wsUrl = await brokerApi\.getWebSocketUrl\(\)/);
});

test('broker realtime position batches are filtered, hint-only for SL/TP, and never replace by absence', () => {
  const brokerRealtimeSource = source();

  assert.match(brokerRealtimeSource, /filterRealtimePositionRows\([\s\S]*positionsState\.positions/);
  assert.match(brokerRealtimeSource, /rejectedRows > 0[\s\S]*schedulePositionsReconciliation\(identity\)/);
  assert.match(brokerRealtimeSource, /notifyModifyPositionSocketHint\(/);
  assert.match(brokerRealtimeSource, /acceptedRows\.map\(stripUnversionedPositionProtection\)/);
  assert.match(brokerRealtimeSource, /preserveMissingExisting: true/);
  assert.match(brokerRealtimeSource, /price_sl: _priceSl[\s\S]*price_tp: _priceTp/);
  assert.match(
    brokerRealtimeSource,
    /status: _status[\s\S]*position_state: _positionState[\s\S]*action: _action[\s\S]*event: _event/,
  );
  assert.match(
    brokerRealtimeSource,
    /acceptedRows\.some\(isTerminalPositionUpdate\)[\s\S]*schedulePositionsReconciliation\(identity\)[\s\S]*scheduleHistoryQueryInvalidation\(identity\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /isTerminalPositionUpdate\(acceptedRows\[0\]\)[\s\S]*schedulePositionsReconciliation\(identity\)[\s\S]*scheduleHistoryQueryInvalidation\(identity\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /this\.invalidateLifecycleQueries\([\s\S]*eventName \|\| normalizeEventName\(envelope\?\.event \?\? envelope\?\.type \?\? envelope\?\.action\)[\s\S]*identity/,
  );
  assert.doesNotMatch(brokerRealtimeSource, /isAuthoritativeRealtimePositionsBatch/);
  assert.doesNotMatch(brokerRealtimeSource, /preserveMissingExisting: false/);
  assert.match(brokerRealtimeSource, /POSITIONS_RECONCILE_COOLDOWN_MS = 5_000/);
});

test('deal and close freshness invalidation is narrow, coalesced, and session fenced', () => {
  const brokerRealtimeSource = source();

  assert.match(
    brokerRealtimeSource,
    /const HISTORY_CACHE_KEYS = \[[\s\S]*'positionHistory'[\s\S]*'deals'[\s\S]*'accountDeals'[\s\S]*\] as const/,
  );
  assert.match(brokerRealtimeSource, /HISTORY_INVALIDATION_COALESCE_MS = 250/);
  assert.match(brokerRealtimeSource, /HISTORY_INVALIDATION_COOLDOWN_MS = 1_000/);
  assert.match(
    brokerRealtimeSource,
    /isHistoryPayloadEvent\(channel, eventName, statusName\)[\s\S]*scheduleHistoryQueryInvalidation\(identity\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /SOCKET_CONTROL_EVENT_PATTERN\.test\(eventName\)[\s\S]*SOCKET_CONTROL_EVENT_PATTERN\.test\(statusName\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /historyInvalidationPending = true;[\s\S]*historyInvalidationTimer \|\| this\.historyInvalidationInFlight/,
  );
  assert.match(
    brokerRealtimeSource,
    /this\.ws !== socket[\s\S]*sameIdentity\(getActiveBrokerSessionIdentity\(capture\.session\), identity\)[\s\S]*sameOwnerStamp\(this\.activeOwnerStamp, ownerStamp\)[\s\S]*isActiveBrokerSessionOwnerStampCurrent\(ownerStamp\)/,
  );
  assert.match(
    brokerRealtimeSource,
    /HISTORY_CACHE_KEYS\.map\(\(root\) => appQueryClient\.invalidateQueries\([\s\S]*queryKey: \[root, capture\.session\.cacheNamespace\][\s\S]*cancelRefetch: true/,
  );
  assert.match(
    brokerRealtimeSource,
    /finally \{[\s\S]*epoch !== this\.historyInvalidationEpoch[\s\S]*historyInvalidationPending[\s\S]*armHistoryQueryInvalidation/,
  );
  assert.ok(
    (brokerRealtimeSource.match(/this\.clearHistoryQueryInvalidation\(\)/g) ?? []).length >= 2,
    'socket close and teardown must both cancel pending history work',
  );
});

test('broker realtime delegates account payloads to the shared alias-safe normalizer', () => {
  const brokerRealtimeSource = source();

  assert.match(
    brokerRealtimeSource,
    /import \{ extractLiveAccountMetrics \} from '\.\/accountSocket\.helpers'/,
  );
  assert.match(
    brokerRealtimeSource,
    /const extractedMetrics = extractLiveAccountMetrics\(data\)/,
  );
  assert.match(brokerRealtimeSource, /\.\.\.\(extractedMetrics \?\? \{\}\)/);
});
