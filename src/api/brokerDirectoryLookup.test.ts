import assert from 'node:assert/strict';
import test from 'node:test';

process.env.EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL = 'https://superadmin-prod.orrnn.com/api/v2';
process.env.EXPO_PUBLIC_ADDITIONAL_BROKER_DIRECTORY_BASE_URL = 'https://nexa-terminal.orrnn.com/discovery-api/api/v2';
process.env.EXPO_PUBLIC_ADDITIONAL_BROKER_IDS = 'Nexa';

const primaryUrl = 'https://superadmin-prod.orrnn.com/api/v2/broker/servers';
const additionalUrl = 'https://nexa-terminal.orrnn.com/discovery-api/api/v2/broker/servers';
const originalFetch = globalThis.fetch;
const row = (brokerId: string, host: string) => ({
  id: brokerId === 'Orrnn' ? 1 : brokerId === 'Nexa' ? 2 : 3, broker_id: brokerId, broker_name: brokerId, created_at: 1,
  protocol: 'https', server: `${host}:443`, server_ip: '66.23.232.22', server_port: 443,
  server_url: `https://${host}`, market_api_url: `https://${host}`,
  services_domain: host, feed_wss_url: `wss://${host}/ws/feed`,
  feed_status_https_url: `https://${host}/ws/feed/status`,
});
const response = (rows: unknown[]) => new Response(JSON.stringify(rows), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

test.beforeEach(async () => {
  const { __clearBrokerDirectoryReadCacheForTests } = await import('./broker');
  __clearBrokerDirectoryReadCacheForTests();
});
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('a primary broker resolves without requesting an unavailable optional source', async () => {
  const { getBrokerDirectoryForBroker } = await import('./broker');
  const urls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input); urls.push(url);
    assert.equal(new Headers(init?.headers).get('Authorization'), null);
    assert.equal(new Headers(init?.headers).get('X-Broker-ID'), null);
    if (url === additionalUrl) throw new Error('optional source timed out');
    return response([row('Orrnn', 'service.orrnn.com')]);
  }) as typeof globalThis.fetch;
  const result = await getBrokerDirectoryForBroker('Orrnn');
  assert.deepEqual(result.selectableServers.map((server) => server.broker_id), ['Orrnn']);
  assert.deepEqual(urls, [primaryUrl]);
});

test('an optional source already pending in the full directory does not block a primary broker', async () => {
  const { getBrokerDirectory, getBrokerDirectoryForBroker } = await import('./broker');
  let resolveAdditional!: (value: Response) => void;
  let markAdditionalStarted!: () => void;
  const additional = new Promise<Response>((resolve) => { resolveAdditional = resolve; });
  const started = new Promise<void>((resolve) => { markAdditionalStarted = resolve; });
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input); urls.push(url);
    if (url === additionalUrl) { markAdditionalStarted(); return additional; }
    return response([row('Orrnn', 'service.orrnn.com')]);
  }) as typeof globalThis.fetch;
  const full = getBrokerDirectory();
  await started;
  try {
    const result = await getBrokerDirectoryForBroker('Orrnn');
    assert.equal(result.selectableServers[0]?.broker_id, 'Orrnn');
    assert.deepEqual(urls, [primaryUrl, additionalUrl]);
  } finally {
    resolveAdditional(response([])); await full;
  }
});

test('only an allowlisted broker absent from primary uses the additional directory', async () => {
  const { getBrokerDirectoryForBroker } = await import('./broker');
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input); urls.push(url);
    return response(url === primaryUrl
      ? [row('Orrnn', 'service.orrnn.com')]
      : [row('Nexa', 'nexa.orrnn.com'), row('Other', 'other.orrnn.com')]);
  }) as typeof globalThis.fetch;
  const unsupported = await getBrokerDirectoryForBroker('Other');
  assert.deepEqual(unsupported.selectableServers.map((server) => server.broker_id), ['Orrnn']);
  assert.deepEqual(urls, [primaryUrl]);
  const allowed = await getBrokerDirectoryForBroker('Nexa');
  assert.deepEqual(allowed.selectableServers.map((server) => server.broker_id), ['Orrnn', 'Nexa']);
  assert.deepEqual(urls, [primaryUrl, additionalUrl]);
});

test('primary source precedence is case-insensitive but returned broker identity remains exact', async () => {
  const { getBrokerDirectoryForBroker } = await import('./broker');
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input)); return response([row('Nexa', 'primary-nexa.orrnn.com')]);
  }) as typeof globalThis.fetch;
  const result = await getBrokerDirectoryForBroker('nexa');
  assert.equal(result.selectableServers[0]?.broker_id, 'Nexa');
  assert.equal(result.selectableServers[0]?.server_url, 'https://primary-nexa.orrnn.com');
  assert.deepEqual(urls, [primaryUrl]);
});

test('primary directory failure stays fail-closed and a subsequent attempt retries', async () => {
  const { getBrokerDirectoryForBroker } = await import('./broker');
  const urls: string[] = []; let primaryAttempts = 0;
  globalThis.fetch = (async (input) => {
    const url = String(input); urls.push(url);
    if (++primaryAttempts === 1) throw new Error('primary unavailable');
    return response([row('Orrnn', 'service.orrnn.com')]);
  }) as typeof globalThis.fetch;
  await assert.rejects(getBrokerDirectoryForBroker('Nexa'), /Network error/);
  const result = await getBrokerDirectoryForBroker('Orrnn');
  assert.equal(result.selectableServers[0]?.broker_id, 'Orrnn');
  assert.deepEqual(urls, [primaryUrl, primaryUrl]);
});

test('failed additional reads remain unsupported and are retried when needed', async () => {
  const { getBrokerDirectoryForBroker } = await import('./broker');
  let additionalAttempts = 0;
  globalThis.fetch = (async (input) => {
    if (String(input) === primaryUrl) return response([]);
    additionalAttempts += 1;
    if (additionalAttempts === 1) throw new Error('optional source timed out');
    return response([row('Nexa', 'nexa.orrnn.com')]);
  }) as typeof globalThis.fetch;
  assert.deepEqual((await getBrokerDirectoryForBroker('Nexa')).selectableServers, []);
  assert.equal((await getBrokerDirectoryForBroker('Nexa')).selectableServers[0]?.broker_id, 'Nexa');
  assert.equal(additionalAttempts, 2);
});

test('full directory refreshes still fetch fresh source data', async () => {
  const { getBrokerDirectoryForBroker, getBrokerDirectory } = await import('./broker');
  let primaryAttempts = 0;
  globalThis.fetch = (async (input) => {
    if (String(input) !== primaryUrl) return response([]);
    primaryAttempts += 1;
    return response(primaryAttempts === 1 ? [row('Orrnn', 'service.orrnn.com')] : []);
  }) as typeof globalThis.fetch;
  assert.equal((await getBrokerDirectoryForBroker('Orrnn')).selectableServers.length, 1);
  assert.equal((await getBrokerDirectoryForBroker('Orrnn')).selectableServers.length, 1);
  assert.deepEqual((await getBrokerDirectory()).selectableServers, []);
  assert.equal(primaryAttempts, 2);
});

test('full directory search starts both approved origins before either response settles', async () => {
  const { getBrokerDirectory } = await import('./broker');
  let resolvePrimary!: (value: Response) => void;
  let resolveAdditional!: (value: Response) => void;
  const primary = new Promise<Response>(resolve => { resolvePrimary = resolve; });
  const additional = new Promise<Response>(resolve => { resolveAdditional = resolve; });
  const urls: string[] = [];
  globalThis.fetch = (async input => {
    const url = String(input); urls.push(url);
    return url === primaryUrl ? primary : additional;
  }) as typeof fetch;
  const result = getBrokerDirectory();
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(urls, [primaryUrl, additionalUrl]);
  } finally {
    resolvePrimary(response([row('Orrnn', 'service.orrnn.com')]));
    resolveAdditional(response([row('Nexa', 'nexa.orrnn.com'), row('Unapproved', 'unapproved.orrnn.com')]));
  }
  assert.deepEqual((await result).selectableServers.map(server => server.broker_id), ['Orrnn', 'Nexa']);
});

test('full directory fails closed as soon as primary fails without waiting for optional discovery', async () => {
  const { getBrokerDirectory } = await import('./broker');
  let resolveAdditional!: (value: Response) => void;
  const additional = new Promise<Response>(resolve => { resolveAdditional = resolve; });
  globalThis.fetch = (async input => {
    if (String(input) === primaryUrl) throw new Error('primary unavailable');
    return additional;
  }) as typeof fetch;
  try {
    await assert.rejects(getBrokerDirectory(), /Network error/);
  } finally {
    resolveAdditional(response([row('Nexa', 'nexa.orrnn.com')]));
    // Let the optional cache settle so this test cannot leak into the next one.
    await new Promise(resolve => setImmediate(resolve));
  }
});

test('an optional failure arriving first does not prevent valid primary search results', async () => {
  const { getBrokerDirectory } = await import('./broker');
  let resolvePrimary!: (value: Response) => void;
  const primary = new Promise<Response>(resolve => { resolvePrimary = resolve; });
  globalThis.fetch = (async input => {
    if (String(input) === primaryUrl) return primary;
    throw new Error('optional unavailable');
  }) as typeof fetch;
  const result = getBrokerDirectory();
  await new Promise(resolve => setImmediate(resolve));
  resolvePrimary(response([row('Orrnn', 'service.orrnn.com')]));
  assert.deepEqual((await result).selectableServers.map(server => server.broker_id), ['Orrnn']);
});
