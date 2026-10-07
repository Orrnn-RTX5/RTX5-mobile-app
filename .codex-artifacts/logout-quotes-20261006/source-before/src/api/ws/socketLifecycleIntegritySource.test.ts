import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('background lifecycle suspends every non-quote socket before foreground validation', () => {
  const layout = readSource('app/_layout.tsx');

  assert.match(layout, /brokerRealtimeService\.suspend\(\)/);
  assert.match(layout, /accountWsService\.suspend\(\)/);
  assert.match(layout, /candlesWsService\.suspend\(\)/);
  assert.match(layout, /wsService\.suspend\(\)/);

  const validation = layout.indexOf('brokerApi.getValidAccessToken(false)');
  const identityGuard = layout.indexOf('isActiveBrokerSessionCurrent(identity)', validation);
  const resume = layout.indexOf('brokerRealtimeService.resume()', validation);
  const bootstrap = layout.indexOf('bootstrapApp({ accountLogin: identity.accountLogin })', validation);
  assert.ok(validation > -1 && identityGuard > validation);
  assert.ok(resume > identityGuard && bootstrap > resume);
});

test('socket suspension preserves demand and caches while disconnect keeps logout teardown', () => {
  const sources = [
    readSource('src/api/ws/BrokerRealtimeService.ts'),
    readSource('src/api/ws/accountSocket.ts'),
    readSource('src/api/ws/socket.ts'),
    readSource('src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts'),
  ];

  for (const source of sources) {
    assert.match(source, /suspend\(\): void/);
    assert.match(source, /resume\(\): void/);
    assert.match(source, /private isSuspended = AppState\.currentState !== 'active'/);
  }

  const candles = sources[3];
  const candleSuspend = candles.slice(candles.indexOf('public suspend()'), candles.indexOf('public resume()'));
  assert.doesNotMatch(candleSuspend, /subscriptions\.clear|candleCache = \[\]|engineUnsubscribe/);
  assert.match(candles, /public disconnect\(\): void \{[\s\S]*subscriptions\.clear\(\)[\s\S]*candleCache = \[\]/);

  const account = sources[1];
  const accountSuspend = account.slice(account.indexOf('public suspend()'), account.indexOf('public resume()'));
  assert.doesNotMatch(accountSuspend, /clearPositions|resetMetrics/);

  const legacy = sources[2];
  const legacySuspend = legacy.slice(legacy.indexOf('public suspend()'), legacy.indexOf('public resume()'));
  assert.doesNotMatch(legacySuspend, /activeSubscriptions\.clear/);
});

test('broker realtime and candles use capped full jitter and do not reset on TCP open', () => {
  const broker = readSource('src/api/ws/BrokerRealtimeService.ts');
  const candles = readSource('src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts');

  for (const source of [broker, candles]) {
    assert.match(source, /resolveFullJitterBackoffMs\(\{/);
    assert.match(source, /startStableConnectionTimer\(socket, identity\)/);
    assert.match(source, /hasStableConnectionSucceeded\(\{/);
    assert.match(source, /acceptedPayloadCount \+= 1/);
    assert.match(source, /markConnectionHealthy\(\)/);
    const onOpen = source.slice(source.indexOf('socket.onopen ='), source.indexOf('socket.onmessage ='));
    assert.doesNotMatch(onOpen, /reconnectAttempts = 0/);
  }

  assert.match(broker, /const accepted = this\.handleMessage[\s\S]*if \(accepted\) \{[\s\S]*this\.markConnectionHealthy\(\)/);
  assert.match(candles, /const accepted = this\.handlePayload[\s\S]*if \(accepted\) \{[\s\S]*this\.markConnectionHealthy\(\)/);
});

test('quote socket recovers after active-session credentials refresh without any auth latch', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  assert.match(quotes, /subscribeActiveBrokerSession/);
  assert.match(quotes, /event\.type !== 'credentials_updated'/);
  assert.match(quotes, /reportFeedCredentialsRefreshed\(identity\)/);
  assert.match(quotes, /this\.shouldReconnect = this\.hasActiveDemand\(\)/);
  // Contract v3: /ws/feed has no token, so there is no rejected-URL latch and
  // no forced access-token refresh from the quote socket.
  assert.doesNotMatch(quotes, /authRefreshAttemptedCredentialIdentity/);
  assert.doesNotMatch(quotes, /rejectedSocketUrl/);
  assert.doesNotMatch(quotes, /getValidAccessToken/);
  assert.doesNotMatch(quotes, /isQuoteSocketAuthenticationFailure|isBrokerMarketAuthFailure/);
  assert.doesNotMatch(quotes, /feedToken|feedAuthContext|accessTokenSnippet|DEBUG_SESSION_AUTH|Quotes WS DEBUG/);
});

test('quote socket callbacks and timers are fenced by credential owner generation', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');
  const health = readSource('src/market/feedHealthProbe.ts');

  assert.match(quotes, /captureActiveBrokerSessionOwnerStamp/);
  assert.match(quotes, /isActiveBrokerSessionOwnerStampCurrent\(owner\)/);
  assert.match(quotes, /socketOwnerStamp/);
  assert.match(quotes, /schedulePreOpenErrorFallback\(socket, owner, identity\)/);
  assert.match(quotes, /QUOTE_WS_PREOPEN_ERROR_CLOSE_WAIT_MS/);
  assert.match(health, /captureActiveBrokerSessionOwnerStamp/);
  assert.match(health, /isActiveBrokerSessionOwnerStampCurrent\(owner\)/);
});

test('quote socket opens right after URL resolve and the status endpoint can never stop it', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  const connectStart = quotes.indexOf('public connect(): void');
  const connectEnd = quotes.indexOf('private openResolvedSocket(', connectStart);
  const connectSource = quotes.slice(connectStart, connectEnd);
  assert.match(connectSource, /this\.openResolvedSocket\(resolved\)/);
  assert.doesNotMatch(connectSource, /probeActiveFeedHealth|healthConfirmed|shouldPauseForConfirmedHealth/);
  assert.doesNotMatch(quotes, /feedHealthBlocksSocketConnection|stopForHealthBlock|scheduleHealthProbe/);
});

test('every quote-socket close reconnects with backoff (503 restart included)', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  const closeStart = quotes.indexOf('socket.onclose = (event) =>');
  const closeEnd = quotes.indexOf('socket.onerror = () =>', closeStart);
  const closeSource = quotes.slice(closeStart, closeEnd);
  assert.match(closeSource, /category: 'transport'/);
  assert.doesNotMatch(closeSource, /category: 'authentication'/);
  assert.doesNotMatch(closeSource, /this\.shouldReconnect = false/);
  assert.match(closeSource, /reportFeedSocketClosed\(identity\)/);
  assert.match(closeSource, /markBrokerSocketUnavailable\(socketUrl, 'closed before open'\)/);
  assert.match(closeSource, /this\.teardownSocket\(false\);\s*this\.attemptReconnect\(\);/);
});

test('quote socket sends no app-level ping and tolerates unsupported_request errors', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  assert.doesNotMatch(quotes, /type: 'ping'/);
  assert.doesNotMatch(quotes, /startHeartbeat|heartbeatInterval/);
  assert.match(quotes, /const extractFeedError = /);
  assert.match(quotes, /unsupported_request/);
});

test('silence watchdog greys prices at 8 s and reconnects only after 60 s with the market open', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  const watchdogStart = quotes.indexOf('private startWatchdog(): void');
  const watchdogEnd = quotes.indexOf('private stopWatchdog(): void', watchdogStart);
  const watchdogSource = quotes.slice(watchdogStart, watchdogEnd);
  assert.match(watchdogSource, /decideQuoteSocketSilenceAction\(silentFor\)/);
  assert.match(watchdogSource, /reportFeedSilence\(this\.socketIdentity, now\)/);
  assert.match(watchdogSource, /action === 'check_market_then_reconnect'/);
  // The 8 s stage never tears the socket down.
  const staleStage = watchdogSource.slice(
    watchdogSource.indexOf('const silentFor'),
    watchdogSource.indexOf("action === 'check_market_then_reconnect'"),
  );
  assert.ok(staleStage.length > 0);
  assert.doesNotMatch(staleStage, /teardownSocket|triggerInvisibleReconnect|markBrokerSocketUnavailable/);
  assert.match(
    watchdogSource,
    /fetchAllMarketStatuses\(\)[\s\S]*isMarketOpenForSymbols\(statuses, symbols\)[\s\S]*\.catch\(\(\) => true\)[\s\S]*if \(!marketOpen\) \{[\s\S]*return;[\s\S]*this\.triggerInvisibleReconnect\(\)/,
  );
  // /ws/feed/status is probed on demand at the silence check only.
  assert.match(watchdogSource, /void probeActiveFeedHealth\(owner\)/);
  // Backoff still resets only after sustained valid traffic (3 ticks, 3 s).
  assert.match(quotes, /this\.acceptedTicksSinceOpen >= 3 &&[\s\S]*receivedAt - this\.connectedAt >= 3_000[\s\S]*this\.reconnectAttempts = 0/);
});

test('NetInfo failures use the same advancing reconnect policy and telemetry', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  assert.match(quotes, /\.catch\(\(\) => \{[\s\S]*this\.scheduleNextBackoffReconnect\('network_status_failed'\)/);
  assert.match(quotes, /resolveNextReconnectAttempt\(\{[\s\S]*currentAttempt: this\.reconnectAttempts/);
  assert.match(quotes, /recordMarketDataEvent\('reconnect_scheduled',[\s\S]*trigger,[\s\S]*attempt: decision\.attempt/);
});

test('quote socket open and subscription ACK telemetry require the current session identity', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  assert.match(
    quotes,
    /socket\.onopen = \(\) => \{[\s\S]*isActiveBrokerSessionOwnerStampCurrent\(owner\)[\s\S]*recordMarketDataEvent\('socket_open',[\s\S]*brokerId: identity\.brokerId[\s\S]*sessionEpoch: identity\.sessionEpoch/,
  );
  assert.match(
    quotes,
    /handleSubscriptionAckPayload\(payload: unknown\)[\s\S]*const identity = this\.socketIdentity;[\s\S]*const owner = this\.socketOwnerStamp;[\s\S]*isActiveBrokerSessionOwnerStampCurrent\(owner\)[\s\S]*recordMarketDataEvent\('subscribe_ack',[\s\S]*symbolCount: symbols\.length[\s\S]*sessionEpoch: identity\.sessionEpoch/,
  );
});

test('broker and legacy trade sockets cannot write executable quotes', () => {
  const broker = readSource('src/api/ws/BrokerRealtimeService.ts');
  const legacy = readSource('src/api/ws/socket.ts');

  assert.doesNotMatch(broker, /setQuote|handleTick|ticks\.|calculateFloatingPnlFromTick/);
  assert.doesNotMatch(legacy, /setQuote|extendActiveCandlesFromQuoteTick/);
  assert.match(legacy, /normalized === 'prices' \|\| normalized\.startsWith\('quotes\.'\)/);
});

test('a momentary zero-demand window (chart symbol switch) keeps the quote socket open', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');

  assert.match(quotes, /const QUOTE_WS_IDLE_TEARDOWN_GRACE_MS = 1_500;/);
  // Both demand-sync paths defer teardown instead of closing on the spot.
  assert.match(
    quotes,
    /private syncActiveSymbols\(\): void \{[\s\S]*?this\.scheduleIdleTeardown\(\);[\s\S]*?\n  \}/,
  );
  assert.match(
    quotes,
    /private syncActiveCandleSubscriptions\(\): void \{[\s\S]*?if \(!this\.hasActiveDemand\(\)\) \{\s*this\.scheduleIdleTeardown\(\);/,
  );
  // The deferred teardown re-checks demand, and every real teardown (logout,
  // suspend, session change) cancels a pending one.
  assert.match(
    quotes,
    /private scheduleIdleTeardown\(\): void \{[\s\S]*?if \(this\.hasActiveDemand\(\)\) \{\s*return;\s*\}[\s\S]*?this\.teardownSocket\(\);[\s\S]*?QUOTE_WS_IDLE_TEARDOWN_GRACE_MS\);/,
  );
  assert.match(quotes, /private teardownSocket\(resetDemand: boolean = false\): void \{[\s\S]*?this\.cancelIdleTeardown\(\);/);
});
