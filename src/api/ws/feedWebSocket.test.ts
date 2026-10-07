import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { createFeedWebSocket, FEED_SOCKET_HEADERS } from './feedWebSocket.ts';

type Captured = { url: string; protocols: unknown; options: unknown };

const fakeWebSocket = (captured: Captured[]) =>
  class {
    constructor(url: string, protocols?: unknown, options?: unknown) {
      captured.push({ url, protocols, options });
    }
  } as unknown as Parameters<typeof createFeedWebSocket>[2];

test('native feed sockets override the automatic Origin with an empty one', () => {
  // React Native adds `Origin: https://<host>` unless an origin header is
  // supplied; Orrnn's /ws/feed answers that with 403 origin_not_allowlisted.
  const captured: Captured[] = [];
  createFeedWebSocket('wss://service.orrnn.com/ws/feed', 'android', fakeWebSocket(captured));
  createFeedWebSocket('wss://trivanta.orrnn.com/ws/feed', 'ios', fakeWebSocket(captured));

  assert.deepEqual(FEED_SOCKET_HEADERS, { origin: '' });
  for (const call of captured) {
    assert.equal(call.protocols, null);
    assert.deepEqual(call.options, { headers: { origin: '' } });
  }
});

test('web feed sockets keep the browser-controlled Origin', () => {
  const captured: Captured[] = [];
  createFeedWebSocket('wss://service.orrnn.com/ws/feed', 'web', fakeWebSocket(captured));
  assert.deepEqual(captured, [{
    url: 'wss://service.orrnn.com/ws/feed',
    protocols: undefined,
    options: undefined,
  }]);
});

test('both quote feed transports open their sockets through the Origin-safe factory', () => {
  for (const path of [
    'src/api/ws/orrnnDemoPublicMarketSocket.ts',
    'src/api/ws/quotesSocket/QuotesWebSocketService.ts',
  ]) {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    assert.match(source, /createFeedWebSocket\((?:socketUrl|url), Platform\.OS\)/, path);
    assert.doesNotMatch(source, /new WebSocket\(/, path);
  }
});
