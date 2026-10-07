import { acceptTradingHydration } from '../services/tradingAccess';
import { useTradingState } from '../state/tradingState';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSession,
  captureActiveBrokerSessionOwnerStamp,
  getActiveBrokerSessionIdentity,
  subscribeActiveBrokerSession,
  updateActiveBrokerSessionCredentials,
  type ActiveBrokerSessionEvent,
} from '../state/activeBrokerSession';
import {
  AUTH_REFRESH_TIMEOUT_MS,
  BrokerAPI,
  StaleBrokerSessionError,
  createBrokerRefreshRequestInit,
  normalizeBrokerRefreshResponse,
  resolveRefreshIdentityMismatch,
} from './brokerApi';

const activateUnhydrated = (brokerId = 'broker-a') => activateBrokerSession(
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

const testOrderBody = JSON.stringify({ account_login: 10001, symbol: 'XAUUSD', side: 'buy', volume: '.03' });
const activate = (brokerId = 'broker-a') => {
  const capture = activateUnhydrated(brokerId);
  acceptTradingHydration(capture.session.cacheNamespace, {}, { login: 10001 }, [{ symbol: 'XAUUSD', trade_mode: 4, volume_min: .01, volume_max: 100, volume_step: .01 }]);
  useTradingState.getState().setQuote('XAUUSD', { bid: 2000, ask: 2001, transport: 'websocket', lastReceivedAt: Date.now(), stale: false, tradable: true });
  return capture;
};
type TestCredentialLease = Readonly<{
  accessToken: string;
  owner: NonNullable<ReturnType<typeof captureActiveBrokerSessionOwnerStamp>>;
}>;

const rotateCredentials = (accessToken = 'access-rotated'): TestCredentialLease => {
  const capture = captureActiveBrokerSession();
  assert.ok(capture);
  const identity = getActiveBrokerSessionIdentity(capture.session);
  assert.equal(updateActiveBrokerSessionCredentials(identity, {
    ...capture.credentials,
    accessToken,
    refreshToken: `${capture.credentials.refreshToken}-rotated`,
  }), true);
  const owner = captureActiveBrokerSessionOwnerStamp();
  assert.ok(owner);
  return Object.freeze({ accessToken, owner });
};

const currentCredentialLease = (): TestCredentialLease => {
  const capture = captureActiveBrokerSession();
  const owner = captureActiveBrokerSessionOwnerStamp();
  assert.ok(capture);
  assert.ok(owner);
  return Object.freeze({
    accessToken: capture.credentials.accessToken,
    owner,
  });
};

let originalFetch: typeof globalThis.fetch;

test.beforeEach(() => {
  __resetActiveBrokerSessionForTests();
  originalFetch = globalThis.fetch;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('refresh wire sends only the refresh token without bearer authorization', () => {
  const request = createBrokerRefreshRequestInit('rotating-refresh-1');
  const headers = new Headers(request.headers);

  assert.equal(request.method, 'POST');
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(headers.get('Authorization'), null);
  assert.deepEqual(JSON.parse(String(request.body)), {
    refresh_token: 'rotating-refresh-1',
  });
});

test('a 401 with no refresh credential invalidates the unrecoverable session', async () => {
  activate();
  const capture = captureActiveBrokerSession();
  assert.ok(capture);
  const identity = getActiveBrokerSessionIdentity(capture.session);
  assert.equal(updateActiveBrokerSessionCredentials(identity, {
    ...capture.credentials,
    refreshToken: '',
  }), true);

  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify({ detail: 'expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;

  const api = new BrokerAPI();
  let invalidatedIdentity: typeof identity | null = null;
  api.setSessionInvalidationHandler(async (rejectedIdentity) => {
    invalidatedIdentity = rejectedIdentity;
  });

  const response = await api.request('/account');

  assert.equal(response.status, 401);
  assert.deepEqual(invalidatedIdentity, identity);
  assert.equal(requestedUrls.length, 1);
  assert.doesNotMatch(requestedUrls[0] ?? '', /auth\/refresh/);
  api.dispose();
});

test('refresh response requires both rotated access and refresh credentials', () => {
  const normalized = normalizeBrokerRefreshResponse({
    access_token: 'access-2',
    refresh_token: 'refresh-2',
    expires_at: '2099-01-01T00:00:00.000Z',
  });
  assert.equal(normalized.accessToken, 'access-2');
  assert.equal(normalized.refreshToken, 'refresh-2');

  assert.throws(
    () => normalizeBrokerRefreshResponse({ access_token: 'access-2' }),
    /rotated refresh token/,
  );
  assert.throws(
    () => normalizeBrokerRefreshResponse({ refresh_token: 'refresh-2' }),
    /access token/,
  );
});

test('refresh response ignores any feed token and never returns feed auth', () => {
  const normalized = normalizeBrokerRefreshResponse({
    access_token: 'access-2',
    refresh_token: 'rtx5_rt_2',
    expires_in: 86_400,
    broker_id: 'trivanta-markets',
    account_login: 200074,
    feed_token: 'must-be-ignored',
    feed_auth_context: { mode: 'query', credential: 'feed_token', token_query_param: 'token' },
  });

  assert.deepEqual(Object.keys(normalized).sort(), [
    'accessToken',
    'accountLogin',
    'brokerId',
    'expiresAt',
    'refreshToken',
  ]);
  assert.equal(normalized.brokerId, 'trivanta-markets');
  assert.equal(normalized.accountLogin, '200074');
});

test('refresh expires_at is read as epoch seconds (and ms is still tolerated)', () => {
  const seconds = normalizeBrokerRefreshResponse({
    access_token: 'a',
    refresh_token: 'r',
    expires_at: 1_790_327_807,
    expires_in: 86_400,
  });
  assert.equal(seconds.expiresAt, new Date(1_790_327_807_000).toISOString());

  const milliseconds = normalizeBrokerRefreshResponse({
    access_token: 'a',
    refresh_token: 'r',
    expires_at: 1_790_327_807_000,
  });
  assert.equal(milliseconds.expiresAt, new Date(1_790_327_807_000).toISOString());
});

test('refresh identity: broker_id preserves case and account_login preserves integer identity', () => {
  const orrnnSession = { brokerId: 'orrnn', accountLogin: '200074' };
  assert.equal(resolveRefreshIdentityMismatch({ brokerId: 'orrnn', accountLogin: '200074' }, orrnnSession), null);
  assert.equal(
    resolveRefreshIdentityMismatch(
      normalizeBrokerRefreshResponse({ access_token: 'a', refresh_token: 'r', broker_id: 'orrnn', account_login: 200074 }),
      orrnnSession,
    ),
    null,
  );
  assert.equal(
    resolveRefreshIdentityMismatch({ brokerId: 'trivanta-markets' }, { brokerId: 'trivanta-markets', accountLogin: 1 }),
    null,
  );
  assert.equal(resolveRefreshIdentityMismatch({ accountLogin: '200074.0' }, orrnnSession), 'account_identity_mismatch');
  assert.equal(resolveRefreshIdentityMismatch({}, orrnnSession), null);

  assert.equal(
    resolveRefreshIdentityMismatch({ brokerId: 'trivanta-markets' }, orrnnSession),
    'broker_identity_mismatch',
  );
  assert.equal(
    resolveRefreshIdentityMismatch({ brokerId: 'orrnn', accountLogin: '200075' }, orrnnSession),
    'account_identity_mismatch',
  );
});

test('refresh timeout is 8 seconds (contract v3)', () => {
  assert.equal(AUTH_REFRESH_TIMEOUT_MS, 8000);
});

test('refresh is single-flight: concurrent callers share one rotation', async () => {
  activate();
  const api = new BrokerAPI();
  const capture = captureActiveBrokerSession();
  assert.ok(capture);
  const identity = getActiveBrokerSessionIdentity(capture.session);
  let performCount = 0;
  let releaseRefresh: (() => void) | null = null;
  const testApi = api as unknown as {
    performRefresh: (identity: unknown) => Promise<TestCredentialLease>;
    getValidAccessTokenForCapture: (
      capture: unknown,
      identity: unknown,
      forceRefresh: boolean,
    ) => Promise<TestCredentialLease>;
  };
  testApi.performRefresh = async () => {
    performCount += 1;
    await new Promise<void>((resolve) => { releaseRefresh = resolve; });
    return rotateCredentials('access-rotated-once');
  };

  const callers = Array.from({ length: 5 }, () =>
    testApi.getValidAccessTokenForCapture(capture, identity, true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(performCount, 1, 'only one /auth/refresh may be in flight per session');
  releaseRefresh!();
  const leases = await Promise.all(callers);

  assert.equal(performCount, 1);
  assert.deepEqual(new Set(leases.map((lease) => lease.accessToken)), new Set(['access-rotated-once']));
  api.dispose();
});

test('every credential rotation emits the credentials_updated signal for the trade socket', () => {
  activate();
  const events: ActiveBrokerSessionEvent[] = [];
  const unsubscribe = subscribeActiveBrokerSession((event) => events.push(event));
  const before = captureActiveBrokerSessionOwnerStamp();
  assert.ok(before);

  rotateCredentials('access-after-refresh');
  unsubscribe();

  const after = captureActiveBrokerSessionOwnerStamp();
  assert.ok(after);
  assert.deepEqual(events.map((event) => event.type), ['credentials_updated']);
  assert.equal(after.credentialGeneration, before.credentialGeneration + 1);
  assert.notEqual(after.credentialIdentity, before.credentialIdentity);
});

test('REST request uses only the atomically captured broker endpoint and token', async () => {
  activate();
  const api = new BrokerAPI();
  let capturedUrl = '';
  let capturedAuthorization = '';
  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
    return new Response('{}', { status: 200 });
  }) as typeof globalThis.fetch;

  const response = await api.request('/positions');
  assert.equal(response.status, 200);
  assert.equal(capturedUrl, 'https://services.broker-a.com/api/v2/positions');
  assert.equal(capturedAuthorization, 'Bearer access-broker-a');
  api.dispose();
});

test('versioned REST request keeps the active broker and bearer session', async () => {
  activate();
  const api = new BrokerAPI();
  let capturedUrl = '';
  let capturedAuthorization = '';
  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
    return new Response('{"count":0,"logs":[]}', { status: 200 });
  }) as typeof globalThis.fetch;

  const response = await api.request('/journal?mode=2&type=0&filter=%20', { apiVersion: 'v1' });

  assert.equal(response.status, 200);
  assert.equal(capturedUrl, 'https://services.broker-a.com/api/v1/journal?mode=2&type=0&filter=%20');
  assert.equal(capturedAuthorization, 'Bearer access-broker-a');
  api.dispose();
});

test('preflight refresh adopts its exact credential owner before the first send', async () => {
  activate();
  const api = new BrokerAPI();
  const tokenChecks: boolean[] = [];
  let capturedAuthorization = '';
  const testApi = api as unknown as {
    getValidAccessTokenForCapture: (
      capture: unknown,
      identity: unknown,
      forceRefresh: boolean,
    ) => Promise<TestCredentialLease>;
  };
  testApi.getValidAccessTokenForCapture = async (_capture, _identity, forceRefresh) => {
    tokenChecks.push(forceRefresh);
    return rotateCredentials('access-preflight-refreshed');
  };
  globalThis.fetch = (async (_input, init) => {
    capturedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
    return new Response('{}', { status: 200 });
  }) as typeof globalThis.fetch;

  const response = await api.request('/positions');

  assert.equal(response.status, 200);
  assert.deepEqual(tokenChecks, [false]);
  assert.equal(capturedAuthorization, 'Bearer access-preflight-refreshed');
  api.dispose();
});

test('trade mutations receive scoped idempotency keys while non-trade calls do not', async () => {
  activate();
  const api = new BrokerAPI();
  const requests: Array<{ url: string; headers: Headers; body: BodyInit | null | undefined }> = [];
  globalThis.fetch = (async (input, init) => {
    if (String(input).includes('/market/status/')) return new Response('{"trade_open":true}');
    if (String(input).includes('/calculate/margin')) return new Response('{"required_margin":1,"free_margin":100000,"max_lots":100}');
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: init?.body,
    });
    return new Response('{}', { status: 200 });
  }) as typeof globalThis.fetch;

  await api.request('/orders', { method: 'POST', body: testOrderBody });
  await api.request('/orders/pending', { method: 'POST', body: '{}' });
  await api.request('/orders/pending/42', { method: 'PUT', body: '{}' });
  await api.request('/orders/pending/42', { method: 'DELETE' });
  await api.request('/positions/12345/close', { method: 'POST', body: '{"mode":"full"}' });
  await api.request('/positions/12345/close', { method: 'POST', body: '{"mode":"full"}' });
  await api.request('/positions/12345', { method: 'PUT', body: '{}' });

  const idempotencyKeys = requests.map((request) => request.headers.get('Idempotency-Key'));
  assert.deepEqual(idempotencyKeys.slice(0, 6).map(Boolean), [true, true, true, true, true, true]);
  assert.equal(idempotencyKeys[6], null);
  assert.equal(new Set(idempotencyKeys.slice(0, 6)).size, 6);
  assert.match(idempotencyKeys[0] ?? '', /^order-/);
  assert.match(idempotencyKeys[4] ?? '', /^close-12345-/);
  assert.match(idempotencyKeys[5] ?? '', /^close-12345-/);
  assert.notEqual(idempotencyKeys[4], idempotencyKeys[5]);
  requests.slice(4, 6).forEach((request) => {
    assert.equal(request.url, 'https://services.broker-a.com/api/v2/positions/12345/close');
    assert.equal(request.body, '{"mode":"full"}');
  });
  requests.slice(0, 6).forEach((request) => {
    assert.equal(request.headers.get('Authorization'), 'Bearer access-broker-a');
    assert.equal(request.headers.get('Content-Type'), 'application/json');
  });
  api.dispose();
});

test('50 parallel order mutations enter transport before any settles and use distinct keys', { timeout: 2_000 }, async () => {
  activate();
  const api = new BrokerAPI();
  const rapidOrderCount = 50;
  const requestHeaders: Headers[] = [];
  const resolveResponses: Array<(response: Response) => void> = [];
  let notifyAllStarted: (() => void) | null = null;
  const allStarted = new Promise<void>((resolve) => {
    notifyAllStarted = resolve;
  });
  globalThis.fetch = (async (_input, init) => {
    if (String(_input).includes('/market/status/')) return new Response('{"trade_open":true}');
    if (String(_input).includes('/calculate/margin')) return new Response('{"required_margin":1,"free_margin":100000,"max_lots":100}');
    requestHeaders.push(new Headers(init?.headers));
    return new Promise<Response>((resolve) => {
      resolveResponses.push(resolve);
      if (requestHeaders.length === rapidOrderCount) notifyAllStarted?.();
    });
  }) as typeof globalThis.fetch;

  const body = JSON.stringify({
    account_login: 10001,
    symbol: 'XAUUSD',
    side: 'buy',
    volume: '0.03',
    type: 'market',
  });
  const requests = Array.from(
    { length: rapidOrderCount },
    () => api.request('/orders', { method: 'POST', body }),
  );

  await allStarted;
  assert.equal(requestHeaders.length, rapidOrderCount, 'all 50 requests must start before request 1 settles');
  const keys = requestHeaders.map((headers) => headers.get('Idempotency-Key'));
  assert.ok(keys.every(Boolean));
  assert.equal(new Set(keys).size, rapidOrderCount, 'separate intended trades need separate keys');
  requestHeaders.forEach((headers) => {
    assert.equal(headers.get('Authorization'), 'Bearer access-broker-a');
  });

  resolveResponses.forEach((resolve) => resolve(new Response('{}', { status: 200 })));
  const responses = await Promise.all(requests);
  assert.deepEqual(
    responses.map((response) => response.status),
    Array.from({ length: rapidOrderCount }, () => 200),
  );
  api.dispose();
});

test('trade idempotency preserves a caller-provided retry key', async () => {
  activate();
  const api = new BrokerAPI();
  let capturedKey = '';
  globalThis.fetch = (async (_input, init) => {
    if (String(_input).includes('/market/status/')) return new Response(JSON.stringify({ trade_open: true }));
    if (String(_input).includes('/calculate/margin')) return new Response(JSON.stringify({ required_margin: 1, free_margin: 100000, max_lots: 100 }));
    capturedKey = new Headers(init?.headers).get('Idempotency-Key') ?? '';
    return new Response('{}', { status: 200 });
  }) as typeof globalThis.fetch;

  await api.request('/orders', {
    method: 'POST',
    body: testOrderBody,
    headers: { 'Idempotency-Key': 'order-retry-abc123' },
  });

  assert.equal(capturedKey, 'order-retry-abc123');
  api.dispose();
});

test('non-replayable mutation causally rebinds its settled 401 after refresh without replaying the write', async () => {
  activate();
  const api = new BrokerAPI();
  const tokenChecks: boolean[] = [];
  const requests: Array<{ url: string; authorization: string }> = [];
  const testApi = api as unknown as {
    getValidAccessTokenForCapture: (
      capture: unknown,
      identity: unknown,
      forceRefresh: boolean,
    ) => Promise<TestCredentialLease>;
  };
  testApi.getValidAccessTokenForCapture = async (_capture, _identity, forceRefresh) => {
    tokenChecks.push(forceRefresh);
    return forceRefresh
      ? rotateCredentials('access-refreshed')
      : currentCredentialLease();
  };
  globalThis.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get('Authorization') ?? '',
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(init ?? {}, 'replayAfterAuthRefresh'),
      false,
    );
    return new Response(
      JSON.stringify({ error: 'UNAUTHORIZED', message: 'Expired token.' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof globalThis.fetch;

  const response = await api.request('/positions/12345', {
    method: 'PUT',
    body: '{"price_sl":0,"price_tp":1.091}',
    replayAfterAuthRefresh: false,
  });

  assert.equal(response.status, 401);
  assert.deepEqual(tokenChecks, [false, true]);
  assert.deepEqual(requests, [{
    url: 'https://services.broker-a.com/api/v2/positions/12345',
    authorization: 'Bearer access-broker-a',
  }]);
  api.dispose();
});

test('default 401 handling still replays eligible requests once with the refreshed token', async () => {
  activate();
  const api = new BrokerAPI();
  const tokenChecks: boolean[] = [];
  const authorizations: string[] = [];
  const testApi = api as unknown as {
    getValidAccessTokenForCapture: (
      capture: unknown,
      identity: unknown,
      forceRefresh: boolean,
    ) => Promise<TestCredentialLease>;
  };
  testApi.getValidAccessTokenForCapture = async (_capture, _identity, forceRefresh) => {
    tokenChecks.push(forceRefresh);
    return forceRefresh
      ? rotateCredentials('access-refreshed')
      : currentCredentialLease();
  };
  globalThis.fetch = (async (_input, init) => {
    authorizations.push(new Headers(init?.headers).get('Authorization') ?? '');
    return authorizations.length === 1
      ? new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Expired token.' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      )
      : new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  }) as typeof globalThis.fetch;

  const response = await api.request('/positions', { method: 'GET' });

  assert.equal(response.status, 200);
  assert.deepEqual(tokenChecks, [false, true]);
  assert.deepEqual(authorizations, [
    'Bearer access-broker-a',
    'Bearer access-refreshed',
  ]);
  api.dispose();
});

test('external credential rotation during a 401 refresh rejects instead of replaying', async () => {
  activate();
  const api = new BrokerAPI();
  let resolveRefresh: ((response: Response) => void) | undefined;
  let notifyRefreshStarted: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    notifyRefreshStarted = resolve;
  });
  let requestCount = 0;
  globalThis.fetch = ((input) => {
    requestCount += 1;
    if (String(input).endsWith('/auth/refresh')) {
      notifyRefreshStarted?.();
      return new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
    }
    return Promise.resolve(new Response(
      JSON.stringify({ error: 'UNAUTHORIZED', message: 'Expired token.' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    ));
  }) as typeof globalThis.fetch;

  const pending = api.request('/positions');
  await refreshStarted;
  rotateCredentials('access-external');
  resolveRefresh?.(new Response(JSON.stringify({
    access_token: 'access-internal-refresh',
    refresh_token: 'refresh-internal-refresh',
    expires_at: '2099-01-01T00:00:00.000Z',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));

  await assert.rejects(pending, StaleBrokerSessionError);
  assert.equal(requestCount, 2);
  api.dispose();
});

test('epoch transition aborts in-flight work and discards its completion', async () => {
  activate();
  const api = new BrokerAPI();
  globalThis.fetch = ((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  })) as typeof globalThis.fetch;

  const pending = api.request('/positions');
  await Promise.resolve();
  beginActiveBrokerSessionTransition();
  await assert.rejects(pending, StaleBrokerSessionError);
  api.dispose();
});

test('delayed 2xx completion is discarded after an external credential rotation', async () => {
  activate();
  const api = new BrokerAPI();
  let resolveFetch: ((response: Response) => void) | undefined;
  let notifyFetchStarted: (() => void) | undefined;
  const fetchStarted = new Promise<void>((resolve) => {
    notifyFetchStarted = resolve;
  });
  globalThis.fetch = (() => {
    notifyFetchStarted?.();
    return new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
  }) as typeof globalThis.fetch;

  const pending = api.request('/positions');
  await fetchStarted;
  rotateCredentials();
  resolveFetch?.(new Response('{"positions":[]}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));

  await assert.rejects(pending, StaleBrokerSessionError);
  api.dispose();
});

test('delayed fetch error is replaced by stale ownership after credential rotation', async () => {
  activate();
  const api = new BrokerAPI();
  let rejectFetch: ((error: Error) => void) | undefined;
  let notifyFetchStarted: (() => void) | undefined;
  const fetchStarted = new Promise<void>((resolve) => {
    notifyFetchStarted = resolve;
  });
  globalThis.fetch = (() => {
    notifyFetchStarted?.();
    return new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    });
  }) as typeof globalThis.fetch;

  const pending = api.request('/positions');
  await fetchStarted;
  rotateCredentials();
  rejectFetch?.(new Error('upstream failed'));

  await assert.rejects(pending, StaleBrokerSessionError);
  api.dispose();
});

test('absolute endpoints outside the active API base are rejected', async () => {
  activate();
  const api = new BrokerAPI();
  globalThis.fetch = (async () => new Response('{}')) as typeof globalThis.fetch;

  await assert.rejects(
    api.request('https://services.broker-b.com/api/v2/positions'),
    /outside the active broker API base/,
  );
  api.dispose();
});

test('quote feed URL is the plain feedWsBase with no token or query (contract v3)', async () => {
  activate();
  const api = new BrokerAPI();

  const url = await api.getQuoteWebSocketUrl();
  assert.equal(url, 'wss://services.broker-a.com/ws/feed');
  assert.doesNotMatch(url, /[?&]token=|\?/);
  api.dispose();
});

test('a legacy feed token or feed auth context passed at activation is never used', async () => {
  activateBrokerSession(
    beginActiveBrokerSessionTransition(),
    {
      brokerId: 'Orrnn',
      accountLogin: '200074',
      apiBase: 'https://service.orrnn.com/api/v2',
      feedWsBase: 'wss://service.orrnn.com/ws/feed',
      tradeWsBase: 'wss://service.orrnn.com/ws/v2',
      feedStatusUrl: 'https://service.orrnn.com/ws/feed/status',
      servicesDomain: 'service.orrnn.com',
      // Pre-v3 callers could still hand over a feed auth context.
      feedAuthContext: {
        mode: 'query',
        credential: 'feed_token',
        tokenQueryParam: 'token',
        brokerIdQueryParam: 'broker_id',
      },
      configVersion: 'v2:4:1789643254',
    } as Parameters<typeof activateBrokerSession>[1],
    {
      accessToken: 'access-orrnn',
      refreshToken: 'rtx5_rt_orrnn',
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
  );
  const capture = captureActiveBrokerSession();
  assert.ok(capture);
  assert.equal('feedAuthContext' in capture.session, false);
  assert.equal('feedToken' in capture.credentials, false);

  const api = new BrokerAPI();
  assert.equal(await api.getQuoteWebSocketUrl(), 'wss://service.orrnn.com/ws/feed');
  api.dispose();
});

test('trade socket uses the validated /ws/v2 route derived during session commit', async () => {
  activateBrokerSession(
    beginActiveBrokerSessionTransition(),
    {
      brokerId: 'broker-a',
      accountLogin: '10001',
      apiBase: 'https://services.broker-a.com/api/v2',
      feedWsBase: 'wss://services.broker-a.com/ws/feed',
      feedStatusUrl: 'https://services.broker-a.com/ws/feed/status',
      servicesDomain: 'services.broker-a.com',
      configVersion: 'cfg-1',
    },
    {
      accessToken: 'access-a',
      refreshToken: '',
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
  );
  const api = new BrokerAPI();

  assert.equal(
    await api.getWebSocketUrl(),
    'wss://services.broker-a.com/ws/v2?token=access-a',
  );
  api.dispose();
});

test('JSON body completion is discarded when the session epoch changes during parsing', async () => {
  activate();
  const api = new BrokerAPI();
  let resolveBody: ((value: unknown) => void) | undefined;
  let notifyBodyStarted: (() => void) | undefined;
  const bodyStarted = new Promise<void>((resolve) => {
    notifyBodyStarted = resolve;
  });
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: () => {
      notifyBodyStarted?.();
      return new Promise((resolve) => {
        resolveBody = resolve;
      });
    },
  } as Response)) as typeof globalThis.fetch;

  const pending = api.getJsonResponse<{ value: number }>('/instruments');
  await bodyStarted;
  beginActiveBrokerSessionTransition();
  resolveBody?.({ value: 7 });

  await assert.rejects(pending, StaleBrokerSessionError);
  api.dispose();
});

test('cache commit helper rejects a parsed response after an epoch transition', async () => {
  const capture = activate();
  const api = new BrokerAPI();
  globalThis.fetch = (async () => new Response('{"value":7}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof globalThis.fetch;

  const result = await api.getJsonResponse<{ value: number }>('/instruments');
  beginActiveBrokerSessionTransition();

  assert.throws(
    () => api.commitJsonResponse(
      result,
      capture.session.cacheNamespace,
      (data) => data.value,
    ),
    StaleBrokerSessionError,
  );
  api.dispose();
});

test('raw response body readers reject an epoch change while decoding', async () => {
  activate();
  const api = new BrokerAPI();
  let resolveText: ((value: string) => void) | undefined;
  let notifyTextStarted: (() => void) | undefined;
  const textStarted = new Promise<void>((resolve) => {
    notifyTextStarted = resolve;
  });
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: () => {
      notifyTextStarted?.();
      return new Promise<string>((resolve) => {
        resolveText = resolve;
      });
    },
  } as Response)) as typeof globalThis.fetch;

  const response = await api.request('/positions');
  const pendingBody = response.text();
  await textStarted;
  beginActiveBrokerSessionTransition();
  resolveText?.('{"positions":[]}');

  await assert.rejects(pendingBody, StaleBrokerSessionError);
  api.dispose();
});

test('delayed error-body parsing is discarded after credential rotation', async () => {
  activate();
  const api = new BrokerAPI();
  let resolveBody: ((value: unknown) => void) | undefined;
  let notifyBodyStarted: (() => void) | undefined;
  const bodyStarted = new Promise<void>((resolve) => {
    notifyBodyStarted = resolve;
  });
  globalThis.fetch = (async () => ({
    ok: false,
    status: 422,
    json: () => {
      notifyBodyStarted?.();
      return new Promise((resolve) => {
        resolveBody = resolve;
      });
    },
  } as Response)) as typeof globalThis.fetch;

  const pending = api.getJsonResponse<{ error: string }>('/positions');
  await bodyStarted;
  rotateCredentials();
  resolveBody?.({ error: 'INVALID_REQUEST' });

  await assert.rejects(pending, StaleBrokerSessionError);
  api.dispose();
});

test('cache commit helper rejects a parsed response after credential rotation', async () => {
  const capture = activate();
  const api = new BrokerAPI();
  globalThis.fetch = (async () => new Response('{"value":7}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof globalThis.fetch;

  const result = await api.getJsonResponse<{ value: number }>('/instruments');
  rotateCredentials();

  assert.throws(
    () => api.commitJsonResponse(
      result,
      capture.session.cacheNamespace,
      (data) => data.value,
    ),
    StaleBrokerSessionError,
  );
  api.dispose();
});

