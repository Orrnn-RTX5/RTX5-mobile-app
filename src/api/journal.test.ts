import assert from 'node:assert/strict';
import test from 'node:test';

import { buildJournalQuery, getJournalLogs } from './journal';
import { brokerApi } from './brokerApi';
import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSession,
  captureActiveBrokerSessionOwnerStamp,
  getActiveBrokerSessionIdentity,
  updateActiveBrokerSessionCredentials,
} from '../state/activeBrokerSession';

const activate = (brokerId = 'broker-a') => activateBrokerSession(
  beginActiveBrokerSessionTransition(),
  {
    brokerId,
    accountLogin: '10001',
    apiBase: `https://services.${brokerId}.com/api/v2`,
    feedWsBase: `wss://services.${brokerId}.com/ws/feed`,
    tradeWsBase: `wss://services.${brokerId}.com/ws/v2`,
    feedStatusUrl: `https://services.${brokerId}.com/ws/feed/status`,
    servicesDomain: `services.${brokerId}.com`,
    configVersion: 'cfg-1',
  },
  {
    accessToken: `access-${brokerId}`,
    refreshToken: `refresh-${brokerId}`,
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
);

let originalFetch: typeof globalThis.fetch;

test.beforeEach(() => {
  __resetActiveBrokerSessionForTests();
  originalFetch = globalThis.fetch;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  __resetActiveBrokerSessionForTests();
});

test('journal query sends WebTerminal mode, type, and wildcard filter contract', () => {
  assert.equal(
    buildJournalQuery({ mode: 2, type: 0 }),
    'mode=2&type=0&filter=%20',
  );
  assert.equal(
    buildJournalQuery({ mode: 1, type: 6, filter: '  order rejected  ' }),
    'mode=1&type=6&filter=order%20rejected',
  );
  assert.equal(
    buildJournalQuery({ mode: 0, type: 3, filter: '   ' }),
    'mode=0&type=3&filter=%20',
  );
});

test('journal uses the active broker v2 route and bearer token, never the missing v1 route', async () => {
  const calls: { url: string; authorization: string | null }[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, authorization: headers.get('Authorization') });
    assert.equal(init?.method, 'GET');
    assert.equal(headers.get('accept'), 'application/json');
    if (new URL(url).pathname !== '/api/v2/journal') {
      return new Response('404 page not found', { status: 404 });
    }
    return Response.json({ count: 1, logs: [{
      id: 42, code: 0, code_text: 'OK', type: 6, type_text: 'Trade',
      datetime: 1790241500, source: 'Gateway', message: 'Order executed',
    }] });
  }) as typeof globalThis.fetch;

  activate();
  const response = await getJournalLogs({ mode: 2, type: 0 });
  assert.equal(response.count, 1);
  assert.equal(response.logs[0].message, 'Order executed');
  activate('broker-b');
  await getJournalLogs({ mode: 1, type: 6, filter: '  order rejected  ' });
  assert.deepEqual(calls, [
    {
      url: 'https://services.broker-a.com/api/v2/journal?mode=2&type=0&filter=%20',
      authorization: 'Bearer access-broker-a',
    },
    {
      url: 'https://services.broker-b.com/api/v2/journal?mode=1&type=6&filter=order%20rejected',
      authorization: 'Bearer access-broker-b',
    },
  ]);
});

test('journal retries the same v2 route after a 401 refresh', async (t) => {
  activate();
  const refreshChecks: boolean[] = [];
  // Replace the native secure-storage refresh step; exercise the real
  // broker client's 401 retry and credential ownership with a rotated lease.
  const refreshClient = brokerApi as unknown as {
    getValidAccessTokenForCapture: (...args: unknown[]) => Promise<{
      accessToken: string;
      owner: NonNullable<ReturnType<typeof captureActiveBrokerSessionOwnerStamp>>;
    }>;
  };
  t.mock.method(refreshClient, 'getValidAccessTokenForCapture', async (_capture: unknown, _identity: unknown, forceRefresh: boolean) => {
    refreshChecks.push(Boolean(forceRefresh));
    const current = captureActiveBrokerSession();
    assert.ok(current);
    if (forceRefresh) {
      assert.equal(updateActiveBrokerSessionCredentials(getActiveBrokerSessionIdentity(current.session), {
        ...current.credentials,
        accessToken: 'access-refreshed',
        refreshToken: 'refresh-rotated',
      }), true);
    }
    const refreshed = captureActiveBrokerSession();
    const owner = captureActiveBrokerSessionOwnerStamp();
    assert.ok(refreshed);
    assert.ok(owner);
    return { accessToken: refreshed.credentials.accessToken, owner };
  });
  const calls: { path: string; authorization: string | null }[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    const authorization = new Headers(init?.headers).get('Authorization');
    calls.push({ path: url.pathname + url.search, authorization });
    if (authorization === 'Bearer access-broker-a') {
      return Response.json({ message: 'Expired token' }, { status: 401 });
    }
    return Response.json({ count: 0, logs: [] });
  }) as typeof globalThis.fetch;

  assert.deepEqual(await getJournalLogs({ mode: 2, type: 0 }), { count: 0, logs: [] });
  assert.deepEqual(refreshChecks, [false, true]);
  assert.deepEqual(calls, [
    { path: '/api/v2/journal?mode=2&type=0&filter=%20', authorization: 'Bearer access-broker-a' },
    { path: '/api/v2/journal?mode=2&type=0&filter=%20', authorization: 'Bearer access-refreshed' },
  ]);
});

test('journal reports backend failures instead of returning a false empty success', async () => {
  activate();
  globalThis.fetch = (async () => new Response('404 page not found', { status: 404 })) as typeof globalThis.fetch;
  await assert.rejects(getJournalLogs({ mode: 2, type: 0 }), /HTTP Error: 404/);

  globalThis.fetch = (async () => Response.json({ message: 'Journal unavailable' }, { status: 503 })) as typeof globalThis.fetch;
  await assert.rejects(getJournalLogs({ mode: 2, type: 0 }), /Journal unavailable/);
});

test('journal ignores a late response after the broker session changes', async () => {
  activate();
  let release!: (response: Response) => void;
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  globalThis.fetch = (() => {
    started();
    return new Promise<Response>((resolve) => { release = resolve; });
  }) as typeof globalThis.fetch;

  const request = getJournalLogs({ mode: 2, type: 0 });
  const rejected = assert.rejects(request, /session|abort/i);
  await requestStarted;
  activate('broker-b');
  release(Response.json({ count: 1, logs: [{ message: 'Previous account row' }] }));
  await rejected;
});
