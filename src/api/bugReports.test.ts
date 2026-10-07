import assert from 'node:assert/strict';
import test from 'node:test';
import { BrokerAPI, type BrokerApiRequestInit } from './brokerApi';
import { __resetActiveBrokerSessionForTests, activateBrokerSession, beginActiveBrokerSessionTransition, captureActiveBrokerSession, captureActiveBrokerSessionOwnerStamp, getActiveBrokerSessionIdentity, updateActiveBrokerSessionCredentials } from '../state/activeBrokerSession';
import {
  BUG_REPORT_MAX_ATTACHMENT_BYTES, BugReportError, appendBugReportFormData, buildBugReportPayload,
  estimateBugReportRequestBytes, loadBugReportOptions, parseBugReportIncidentTime, sanitizeBugReportContext,
  submitBugReport, truncateUtf8, utf8Bytes, validateBugReport,
  type BugReportAttachment, type BugReportDraft, type BugReportOptions,
} from './bugReports';

const optionsBody = { categories: ['market_data', 'other'], severities: ['low', 'medium', 'high'], enabled: true, max_attachments: 5, max_file_bytes: 8388608 };
const formOptions: BugReportOptions = {
  categories: [{ value: 'market_data', label: 'Market data' }, { value: 'other', label: 'Other' }],
  severities: [{ value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }],
  enabled: true, maxAttachments: 5, maxFileBytes: 8388608,
};
const validDraft: BugReportDraft = { title: ' Chart freezes ', description: ' The chart stops after reconnecting. ', category: 'market_data', severity: 'high', attachments: [] };
const attachment = (patch: Partial<BugReportAttachment> = {}): BugReportAttachment => ({ uri: 'file:///shot.png', name: 'shot.png', size: 100, mimeType: 'image/png', contentVerified: true, reviewed: true, ...patch });
const api = (body: unknown, status = 201) => ({ request: async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }) });
const fakeForm = () => ({ append: () => undefined });
const send = (body: unknown, status = 201, draft = validDraft) => submitBugReport(draft, { formOptions, api: api(body, status), createFormData: fakeForm });
test.beforeEach(() => __resetActiveBrokerSessionForTests());

test('flat payload uses exact supported fields, arrays and epoch seconds', () => {
  const payload = buildBugReportPayload({ ...validDraft, stepsToReproduce: ' Open chart\n\n Reconnect ', expectedBehavior: ' Updates ', actualBehavior: ' Frozen ', context: { route: '/chart?token=secret#fragment', page: 'RTX Mobile / Chart', browser: '', quote_age_ms: 1200, ...{ token: 'secret', account_login: '123', device_model: 'phone', source: 'mobile' } } }, formOptions, 1790812800123);
  assert.deepEqual(payload, { title: 'Chart freezes', description: 'The chart stops after reconnecting.', category: 'market_data', severity: 'high', steps_to_reproduce: ['Open chart', 'Reconnect'], expected_behavior: 'Updates', actual_behavior: 'Frozen', occurred_at: 1790812800, route: '/chart', page: 'RTX Mobile / Chart', browser: '', quote_age_ms: 1200 });
  for (const key of ['broker_id', 'account_login', 'reporter', 'license', 'context', 'application', 'environment', 'source', 'device_model', 'token']) assert.equal(key in payload, false);
});
test('required fields and multibyte byte bounds are enforced before transport', () => {
  assert.equal(validateBugReport({ ...validDraft, title: ' ab ', description: ' x ' }).title, 'Enter at least 3 characters.');
  assert.equal(validateBugReport({ ...validDraft, title: '😀'.repeat(50) }).title, undefined);
  assert.ok(validateBugReport({ ...validDraft, title: '😀'.repeat(51) }).title);
  assert.ok(validateBugReport({ ...validDraft, description: '界'.repeat(2667) }).description);
  assert.ok(validateBugReport({ ...validDraft, expectedBehavior: '界'.repeat(667), actualBehavior: '😀'.repeat(501) }).expectedBehavior);
  assert.ok(validateBugReport({ ...validDraft, category: 'invented' }, formOptions).category);
  assert.ok(validateBugReport({ ...validDraft, severity: 'critical' }, formOptions).severity);
  assert.equal(utf8Bytes('é界😀'), 9);
  assert.equal(truncateUtf8('é界😀', 8), 'é界');
});
test('steps enforce 30 nonempty lines and 300 UTF-8 bytes each', () => {
  assert.equal(validateBugReport({ ...validDraft, stepsToReproduce: Array(30).fill('界'.repeat(100)).join('\n') }).stepsToReproduce, undefined);
  assert.ok(validateBugReport({ ...validDraft, stepsToReproduce: Array(31).fill('step').join('\n') }).stepsToReproduce);
  assert.ok(validateBugReport({ ...validDraft, stepsToReproduce: '😀'.repeat(76) }).stepsToReproduce);
});
test('local incident time accepts real dates and sends seconds; blank uses send time', () => {
  const parsed = parseBugReportIncidentTime('2026-10-01 14:30');
  assert.equal(parsed, Math.floor(new Date(2026, 9, 1, 14, 30).getTime() / 1000));
  for (const invalid of ['2026-02-30 12:00', '2026-13-01 12:00', '2026-01-01 25:00', 'yesterday']) assert.ok(Number.isNaN(parseBugReportIncidentTime(invalid)));
  assert.equal(buildBugReportPayload({ ...validDraft, occurredAt: '2026-10-01 14:30' }).occurred_at, parsed);
  assert.ok(validateBugReport({ ...validDraft, occurredAt: 'bad' }).occurredAt);
});
test('context is bounded, strips sensitive query/URL credentials and omits unknown metadata', () => {
  const context = sanitizeBugReportContext({ route: 'https://user:pass@broker.test/chart?password=secret', symbol: '界'.repeat(30), timeframe: 'M'.repeat(50), quote_age_ms: -3, ...{ access_token: 'secret', storage: 'private' } });
  assert.equal(context.route, '/chart'); assert.equal(utf8Bytes(context.symbol!), 30);
  assert.equal(context.timeframe?.length, 16); assert.equal(context.quote_age_ms, undefined);
  assert.equal(Object.keys(context).length, 3);
});
test('multipart has a regular JSON text field with repeated ordered file parts, including no-file reports', () => {
  for (const files of [[], [attachment(), attachment({ uri: 'file:///log.txt', name: 'log.txt', mimeType: 'text/plain' })]]) {
    const entries: Array<[string, unknown]> = [];
    appendBugReportFormData({ append: (name, value) => entries.push([name, value]) }, { ...validDraft, attachments: files }, formOptions);
    assert.equal(entries[0][0], 'payload'); assert.equal(typeof entries[0][1], 'string');
    assert.equal(JSON.parse(String(entries[0][1])).title, 'Chart freezes');
    assert.deepEqual(entries.slice(1).map(([name]) => name), files.map(() => 'attachments'));
    assert.deepEqual(entries.slice(1).map(([, file]) => (file as { name: string }).name), files.map((file) => file.name));
  }
});
test('empty, excessive, unreviewed, unsupported and oversized attachments are rejected', () => {
  for (const files of [Array(6).fill(attachment()), [attachment({ size: 0 })], [attachment({ size: NaN })], [attachment({ size: BUG_REPORT_MAX_ATTACHMENT_BYTES + 1 })], [attachment({ mimeType: 'application/pdf' })], [attachment({ contentVerified: false })], [attachment({ reviewed: false })]]) assert.ok(validateBugReport({ ...validDraft, attachments: files }, formOptions).attachments);
  assert.equal(validateBugReport({ ...validDraft, attachments: [attachment({ size: BUG_REPORT_MAX_ATTACHMENT_BYTES })] }, formOptions).attachments, undefined);
  assert.ok(validateBugReport({ ...validDraft, attachments: [attachment({ size: 101 })] }, { ...formOptions, maxFileBytes: 100 }).attachments);
  assert.ok(validateBugReport({ ...validDraft, attachments: [attachment()] }, { ...formOptions, maxAttachments: 0 }).attachments);
});
test('combined multipart budget reserves payload, filenames, headers and boundaries', () => {
  const files = Array(3).fill(attachment({ size: 8_388_608 }));
  assert.ok(validateBugReport({ ...validDraft, attachments: files }).attachments);
  assert.ok(estimateBugReportRequestBytes({ ...validDraft, attachments: files }) > 25_165_824);
  assert.equal(validateBugReport({ ...validDraft, attachments: Array(5).fill(attachment({ size: 4_000_000 })) }).attachments, undefined);
});
test('options preserve exact API values, friendly labels, disabled state and broker limits', async () => {
  const loaded = await loadBugReportOptions(api(optionsBody, 200));
  assert.equal(loaded.categories[0].value, 'market_data'); assert.equal(loaded.categories[0].label, 'Market data');
  assert.equal(loaded.enabled, true); assert.equal(loaded.maxFileBytes, 8388608);
  assert.equal((await loadBugReportOptions(api({ ...optionsBody, enabled: false }, 200))).enabled, false);
  assert.equal((await loadBugReportOptions(api({ ...optionsBody, max_attachments: 10, max_file_bytes: 9000000 }, 200))).maxAttachments, 5);
});
test('failed or invalid options requests never enable reporting or invent fallback choices', async () => {
  for (const [body, status] of [['not JSON', 200], [{}, 200], [{ ...optionsBody, enabled: undefined }, 200], [{ ...optionsBody, severities: [] }, 200], ['proxy error', 502]] as const) await assert.rejects(() => loadBugReportOptions(api(body, status)), BugReportError);
  await assert.rejects(() => loadBugReportOptions({ request: async () => { throw new TypeError('Failed to fetch'); } }), (e: unknown) => e instanceof BugReportError && e.kind === 'offline');
  let sent = false;
  await assert.rejects(() => submitBugReport(validDraft, { formOptions: { ...formOptions, enabled: false }, api: { request: async () => { sent = true; return new Response(); } } }), (e: unknown) => e instanceof BugReportError && e.kind === 'disabled');
  assert.equal(sent, false);
});
test('POST explicitly opts out of automatic auth replay, exposes cancellation and lets library choose boundary', async () => {
  const controller = new AbortController(); let request: BrokerApiRequestInit | undefined;
  await submitBugReport(validDraft, { formOptions, signal: controller.signal, createFormData: fakeForm, api: { request: async (endpoint, init) => { assert.equal(endpoint, '/bug-reports'); request = init; return api({ report_id: 'BR-1' }).request(); } } });
  assert.equal(request?.method, 'POST'); assert.equal(request?.replayAfterAuthRefresh, false);
  assert.equal(request?.signal, controller.signal); assert.equal(request?.timeoutMs, 180000);
  assert.equal(new Headers(request?.headers).get('Content-Type'), null);
  assert.equal(new Headers(request?.headers).get('Accept'), 'application/json');
});
for (const failed of [null, [], [1, 2]]) test(`valid receipt accepts failed_attachments=${JSON.stringify(failed)} without replay`, async () => {
  const result = await send({ report_id: 'BR-2', status: 'open', failed_attachments: failed }, 201, { ...validDraft, attachments: [attachment(), attachment()] });
  assert.deepEqual(result, { reportId: 'BR-2', failedAttachments: failed ?? [] });
});
for (const [status, body, kind] of [
  [400, { error: 'INVALID_INPUT', message: 'Invalid title' }, 'validation'],
  [401, { error: 'UNAUTHORIZED' }, 'unauthorized'],
  [403, { error: 'INVESTOR_READ_ONLY' }, 'read-only'],
  [502, { error: 'UPSTREAM_UNAVAILABLE' }, 'server'],
  [503, { error: 'BUG_REPORTS_DISABLED' }, 'disabled'],
  [413, '<html>Too large</html>', 'validation'],
  [504, '<html>Timeout</html>', 'uncertain'],
  [200, { report_id: 'BR-wrong-status' }, 'uncertain'],
  [201, {}, 'uncertain'],
  [201, { report_id: 99 }, 'uncertain'],
] as const) test(`HTTP ${status} maps to ${kind} and preserves draft`, async () => {
  const before = JSON.stringify(validDraft);
  await assert.rejects(() => send(body, status), (error: unknown) => error instanceof BugReportError && error.kind === kind);
  assert.equal(JSON.stringify(validDraft), before);
});
test('network loss, timeout and cancellation after POST mean unconfirmed acceptance; never automatically retry', async () => {
  for (const error of [new TypeError('Network request failed'), new Error('Network request timed out'), Object.assign(new Error('Aborted'), { name: 'AbortError' })]) {
    let calls = 0;
    await assert.rejects(() => submitBugReport(validDraft, { formOptions, createFormData: fakeForm, api: { request: async () => { calls++; throw error; } } }), (e: unknown) => e instanceof BugReportError && e.kind === 'uncertain' && /duplicate/.test(e.message));
    assert.equal(calls, 1);
  }
});
test('options cancellation stays an abort, not enabled metadata', async () => {
  const controller = new AbortController(); const error = new Error('Aborted');
  await assert.rejects(() => loadBugReportOptions({ request: async () => { controller.abort(); throw error; } }, { signal: controller.signal }), (e) => e === error);
});

function activate(brokerId: string, investor = false) {
  activateBrokerSession(beginActiveBrokerSessionTransition(), {
    brokerId, accountLogin: '10001', apiBase: `https://services.${brokerId}.test/api/v2`,
    feedWsBase: `wss://services.${brokerId}.test/ws/feed`, tradeWsBase: `wss://services.${brokerId}.test/ws/v2`,
    feedStatusUrl: `https://services.${brokerId}.test/ws/feed/status`, servicesDomain: `services.${brokerId}.test`, configVersion: 'cfg-1', investor,
  }, { accessToken: `test-token-${brokerId}`, refreshToken: '', expiresAt: '2099-01-01T00:00:00Z' });
}
test('selected broker routes authenticated options and multipart POST with exactly one /api/v2', async () => {
  const originalFetch = globalThis.fetch; const client = new BrokerAPI();
  try {
    for (const broker of ['broker-a', 'broker-b']) {
      activate(broker);
      const requests: Request[] = [];
      globalThis.fetch = (async (input, init) => {
        const request = new Request(String(input), init); requests.push(request);
        return request.method === 'GET' ? new Response(JSON.stringify(optionsBody), { status: 200 }) : new Response(JSON.stringify({ report_id: 'BR-routed' }), { status: 201 });
      }) as typeof fetch;
      await loadBugReportOptions(client);
      await submitBugReport({ ...validDraft, attachments: [attachment({ blob: new Blob(['png-binary-test'], { type: 'image/png' }) })] }, { formOptions, api: client });
      assert.equal(requests[0].url, `https://services.${broker}.test/api/v2/bug-reports/options`);
      assert.equal(requests[1].url, `https://services.${broker}.test/api/v2/bug-reports`);
      for (const request of requests) assert.equal(request.headers.get('Authorization'), `Bearer test-token-${broker}`);
      assert.match(requests[1].headers.get('Content-Type')!, /^multipart\/form-data; boundary=/);
      assert.equal(requests[1].headers.get('Idempotency-Key'), null);
      const multipart = await requests[1].formData() as unknown as { get: (key: string) => unknown; getAll: (key: string) => unknown[] };
      assert.equal(typeof multipart.get('payload'), 'string'); assert.equal(multipart.getAll('attachments').length, 1);
      assert.equal(String(multipart.get('payload')).includes('test-token-'), false);
    }
  } finally { globalThis.fetch = originalFetch; client.dispose(); }
});
test('investor can load options, but local guard prevents any POST', async () => {
  activate('broker-a', true); let count = 0;
  const stub = { request: async () => { count++; return new Response(JSON.stringify(optionsBody), { status: 200 }); } };
  await loadBugReportOptions(stub);
  await assert.rejects(() => submitBugReport(validDraft, { formOptions, api: stub, createFormData: fakeForm }), (e: unknown) => e instanceof BugReportError && e.kind === 'read-only');
  assert.equal(count, 1);
});
test('401 token refresh recovers session but does not replay the multipart POST', async () => {
  activate('broker-a'); const originalFetch = globalThis.fetch; const client = new BrokerAPI(); let posts = 0;
  (client as any).getValidAccessTokenForCapture = async (_capture: unknown, identity: ReturnType<typeof getActiveBrokerSessionIdentity>, force: boolean) => {
    const capture = captureActiveBrokerSession()!;
    if (force) updateActiveBrokerSessionCredentials(identity, { ...capture.credentials, accessToken: 'test-rotated' });
    return { accessToken: captureActiveBrokerSession()!.credentials.accessToken, owner: captureActiveBrokerSessionOwnerStamp()! };
  };
  globalThis.fetch = (async () => { posts++; return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 }); }) as typeof fetch;
  try {
    await assert.rejects(() => submitBugReport(validDraft, { formOptions, api: client }), (e: unknown) => e instanceof BugReportError && e.kind === 'unauthorized');
    assert.equal(posts, 1); assert.equal(captureActiveBrokerSession()!.credentials.accessToken, 'test-rotated');
  } finally { globalThis.fetch = originalFetch; client.dispose(); }
});
