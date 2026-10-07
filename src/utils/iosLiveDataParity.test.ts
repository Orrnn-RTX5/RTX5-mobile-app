import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('broker routing accepts only explicit TLS endpoints without scheme or host synthesis', () => {
  const source = readSource('src/api/brokerRouting.ts');

  assert.match(source, /export const normalizeBrokerWssUrl/);
  assert.match(source, /normalizeStrictServiceUrl\(value, 'wss:'\)/);
  assert.match(source, /url\.protocol !== protocol/);
  assert.match(source, /!isApprovedPublicHostname\(url\.hostname\)/);
  assert.match(source, /const feed = resolveExplicitEndpoint\(\[record\.feed_wss_url, record\.feed_ws_url\], 'wss:'\)/);
  assert.match(source, /const trade = resolveExplicitEndpoint\(\[record\.trade_wss_url, record\.trade_ws_url\], 'wss:'\)/);
  assert.doesNotMatch(source, /replace\(\/\^https:|replace\(\/\^http:|replace\(\/\^ws:/);
});

test('quote and candle sockets use the exact immutable active-session endpoints', () => {
  const quotes = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');
  const candles = readSource('src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts');
  const candleProtocol = readSource('src/domain/candles/ws/candlesSocketProtocol.ts');

  assert.match(quotes, /captureActiveBrokerSession\(\)/);
  assert.match(quotes, /brokerApi\.getQuoteWebSocketUrl\(\)/);
  assert.match(quotes, /isActiveBrokerSessionCurrent\(identity\)/);
  assert.doesNotMatch(quotes, /EXPO_PUBLIC_QUOTES_WS_URL|DEFAULT_QUOTES_WS_URL|appendFeedAuthToWsUrl/);

  assert.match(candleProtocol, /resolveCandlesWsUrl = \([\s\S]*normalizeBrokerWssUrl\(exactTradeWsBase\)/);
  assert.match(candles, /captureActiveBrokerSession\(\)/);
  assert.match(candles, /resolveCandlesWsUrl\(capture\.session\.tradeWsBase\)/);
  assert.match(candles, /brokerApi\.getWebSocketUrl\(\)/);
  assert.match(candles, /isActiveBrokerSessionCurrent\(identity\)/);
  assert.doesNotMatch(candles, /EXPO_PUBLIC_CANDLES_WS_URL|DEFAULT_CANDLES_WS_URL/);
});

test('account socket has no global or environment fallback outside the active session', () => {
  const source = readSource('src/api/ws/accountSocket.ts');

  assert.match(source, /captureActiveBrokerSession\(\)/);
  assert.match(source, /resolveAccountWsSession\(captureActiveBrokerSession\(\)\)/);
  assert.match(source, /brokerApi\.getWebSocketUrl\(\)/);
  assert.match(source, /isActiveBrokerSessionCurrent\(session\.identity\)/);
  assert.doesNotMatch(source, /DEFAULT_ACCOUNT_WS_URL|EXPO_PUBLIC_ACCOUNT_WS_URL|buildBrokerWsUrl/);
});

test('legacy price socket has no synthesized or global fallback endpoint', () => {
  const source = readSource('src/api/ws/socket.ts');

  assert.match(source, /captureActiveBrokerSession\(\)/);
  assert.match(source, /session\.tradeWsBase/);
  assert.match(source, /isActiveBrokerSessionCurrent\(identity\)/);
  assert.doesNotMatch(source, /EXPO_PUBLIC_WS_URL|buildBrokerWsUrl|wss:\/\/backend\.orrnn\.com/);
});
