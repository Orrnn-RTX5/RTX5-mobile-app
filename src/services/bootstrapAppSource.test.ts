import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/services/bootstrapApp.ts'), 'utf8');

test('bootstrap applies live data as each startup request resolves', () => {
  const bootstrapSource = source();

  const realtimeConnectIndex = bootstrapSource.indexOf('brokerRealtimeService.connect()');
  const mePromiseIndex = bootstrapSource.indexOf("const mePromise = requestJson('/auth/me')");
  const accountsPromiseIndex = bootstrapSource.indexOf('const accountsPromise = accountLogin');
  const positionsPromiseIndex = bootstrapSource.indexOf('const positionsPromise = accountLogin');
  const ordersPromiseIndex = bootstrapSource.indexOf('const ordersPromise = accountLogin');
  const instrumentsPromiseIndex = bootstrapSource.indexOf("const instrumentsPromise = requestJson('/instruments', () => fetchInstrumentCatalogResponse(cacheNamespace)).then");
  const marketStatusPromiseIndex = bootstrapSource.indexOf("const marketStatusPromise = requestJson('/market/status').then");
  const promiseAllIndex = bootstrapSource.indexOf('const complete = Promise.all([');

  assert.ok(realtimeConnectIndex > -1 && realtimeConnectIndex < mePromiseIndex);
  assert.match(bootstrapSource, /import \{ quotesWsService \} from '\.\.\/api\/ws\/quotesSocket'/);
  assert.match(bootstrapSource, /quotesWsService\.setSubscriptions\(warmSymbols\)/);
  assert.notEqual(mePromiseIndex, -1);
  assert.notEqual(accountsPromiseIndex, -1);
  assert.notEqual(positionsPromiseIndex, -1);
  assert.notEqual(ordersPromiseIndex, -1);
  assert.notEqual(instrumentsPromiseIndex, -1);
  assert.notEqual(marketStatusPromiseIndex, -1);
  assert.ok(promiseAllIndex > marketStatusPromiseIndex);
  assert.match(bootstrapSource, /accountsPromise = accountLogin[\s\S]*requestJson\(buildAccountDetailPath\(accountLogin\), \(\) => fetchAccountSnapshotResponse\(accountLogin\)\)[\s\S]*updateAccountMetricsFromBootstrap\(accounts, accountLogin\)/);
  assert.match(
    bootstrapSource,
    /const detailKey = getAccountDetailQueryKey\(cacheNamespace, Number\(accountLogin\)\)[\s\S]*mapBootstrapAccountRow\([\s\S]*appQueryClient\.getQueryData<TradingAccount>\(detailKey\)[\s\S]*setQueryData<TradingAccount>\(detailKey, snapshots.detail\)/,
  );
  assert.match(
    bootstrapSource,
    /const mapBootstrapAccountRow = \([\s\S]*mapRawAccount\(selected, previous\)/,
  );
  assert.match(
    bootstrapSource,
    /const accountEnvironmentRefresh = beginAccountEnvironmentRefresh\(activeProvenance\)[\s\S]*commitActiveAccountEnvironmentPayload\([\s\S]*accounts,[\s\S]*activeProvenance,[\s\S]*accountEnvironmentRefresh/,
  );
  assert.match(bootstrapSource, /positionsPromise = accountLogin[\s\S]*requestJson\(`\/positions\/\$\{encodedAccountLogin\}`\)[\s\S]*applyPositionsSnapshot\(resolvedRows, accountLogin/);
  assert.doesNotMatch(bootstrapSource, /limit=50&offset=0/);
  assert.match(bootstrapSource, /ordersPromise = accountLogin[\s\S]*requestJson\(`\/orders\/\$\{encodedAccountLogin\}`\)[\s\S]*getOrdersByLoginQueryKey\(cacheNamespace, Number\(accountLogin\)\)/);
  assert.doesNotMatch(bootstrapSource, /requestJson\('\/accounts'\)/);
  assert.doesNotMatch(bootstrapSource, /getAccountsListQueryKey|ACCOUNTS_LIST_PATH|'\/accounts'|'\/exposure'|\/api\/mt5/);
  assert.doesNotMatch(bootstrapSource, /requestJson\('\/positions'\)/);
  assert.doesNotMatch(bootstrapSource, /requestJson\('\/orders'\)/);
  assert.match(bootstrapSource, /instrumentsPromise = requestJson\('\/instruments', \(\) => fetchInstrumentCatalogResponse\(cacheNamespace\)\)\.then\(\(result\) =>[\s\S]*primeInstrumentMetaCacheFromCatalogPayload\(instruments, cacheNamespace\)/);
  assert.match(bootstrapSource, /setQueryData\([\s\S]*\['market', cacheNamespace, 'symbols', 'instrument-catalog-v3'\],[\s\S]*extractMarketSymbols\(instruments\)/);
  assert.doesNotMatch(bootstrapSource, /favorites=true|\['instruments', cacheNamespace, 'favorites'\]/);
  assert.doesNotMatch(bootstrapSource, /setInstrumentSpecs/);
  assert.match(bootstrapSource, /marketStatusPromise = requestJson\('\/market\/status'\)\.then\(\(result\) =>[\s\S]*const marketStatus = normalizeMarketStatusListPayload\(payload\)[\s\S]*setQueryData\(getMarketStatusQueryKey\(cacheNamespace, row\.symbol\), row\)/);
  assert.doesNotMatch(bootstrapSource, /\['marketStatus', cacheNamespace\]/);
});

test('one bootstrap account response seeds both dashboard account caches and its display name', () => {
  const bootstrapSource = source();
  assert.match(bootstrapSource, /summary: mapAccountSummaryApiResponse\(selected as AccountSummaryApiResponse, previousSummary\)/);
  assert.match(bootstrapSource, /const summaryKey = getAccountSummaryQueryKey\(cacheNamespace, accountLogin\)/);
  assert.match(bootstrapSource, /appQueryClient\.getQueryData<AccountSummary>\(summaryKey\)/);
  const commit = bootstrapSource.slice(
    bootstrapSource.indexOf('commitBootstrapResponse(result, cacheNamespace, (accounts)'),
    bootstrapSource.indexOf('const positionsPromise'),
  );
  assert.match(commit, /setQueryData<TradingAccount>\(detailKey, snapshots.detail\)/);
  assert.match(commit, /setQueryData<AccountSummary>\(summaryKey, snapshots.summary\)/);
  assert.match(commit, /updateAccountDetails\(\{[\s\S]*name: snapshots.detail.name/);
});

test('bootstrap binds every parsed response and cache write to one session namespace', () => {
  const bootstrapSource = source();

  assert.match(bootstrapSource, /const sessionCapture = captureActiveBrokerSession\(\)/);
  assert.match(bootstrapSource, /const activeProvenance = getActiveBrokerSessionProvenance\(sessionCapture\.session\)/);
  assert.match(bootstrapSource, /options\.expectedProvenance\.cacheNamespace !== activeProvenance\.cacheNamespace/);
  assert.match(bootstrapSource, /!isActiveBrokerSessionProvenanceCurrent\(options\.expectedProvenance\)/);
  assert.match(bootstrapSource, /requestedAccountLogin !== sessionCapture\.session\.accountLogin/);
  assert.match(bootstrapSource, /const cacheNamespace = sessionCapture\.session\.cacheNamespace/);
  assert.match(bootstrapSource, /brokerApi\.getJsonResponse<T>\(endpoint\)/);
  assert.match(bootstrapSource, /brokerApi\.commitJsonResponse\(result, cacheNamespace, commit\)/);
  assert.match(bootstrapSource, /commitActiveAccountEnvironmentPayload/);
  assert.match(bootstrapSource, /error instanceof StaleBrokerSessionError/);
});

test('authentication joins current bootstrap work and waits only for verified trading snapshots', () => {
  const bootstrapSource = source();
  assert.match(bootstrapSource, /const requestKey = `\$\{activeProvenance.cacheNamespace\}:\$\{activeProvenance.credentialGeneration\}`/);
  assert.match(bootstrapSource, /joinBootstrapRequest\(requestKey, options.waitFor \?\? 'complete'/);
  const ready = bootstrapSource.slice(
    bootstrapSource.indexOf('const ready = Promise.all('),
    bootstrapSource.indexOf('const complete = Promise.all('),
  );
  assert.match(ready, /Promise.all\(\[mePromise, accountsPromise, instrumentsPromise\]\)/);
  assert.match(ready, /acceptTradingHydration\(cacheNamespace, me, accounts, instruments\)/);
  assert.doesNotMatch(ready, /positionsPromise|ordersPromise|marketStatusPromise/);
  const auth = readFileSync(resolve(process.cwd(), 'src/features/auth/GuestFlowHost.tsx'), 'utf8');
  assert.match(auth, /expectedProvenance: getActiveBrokerSessionProvenance\(capture.session\), waitFor: 'trading'/);
  assert.ok(auth.indexOf('!acceptTradingHydration(') < auth.indexOf('completeAuthenticatedFlow(attempt'));
});

test('bootstrap account metrics accepts common backend account aliases', () => {
  const bootstrapSource = source();

  assert.match(bootstrapSource, /const unwrapAccountRows = \(value: unknown\): unknown\[\] => \{/);
  assert.match(bootstrapSource, /import \{ extractLiveAccountMetrics \} from '\.\.\/api\/ws\/accountSocket\.helpers'/);
  assert.match(bootstrapSource, /const parsedMetrics = extractLiveAccountMetrics\(record\) \?\? \{\}/);
  assert.match(bootstrapSource, /typeof value === 'string' && value\.trim\(\) === ''/);
  assert.match(bootstrapSource, /const freeMargin = parsedMetrics\.margin_free;/);
  // Contract v3: missing server metrics are not recomputed; they stay stale.
  assert.doesNotMatch(bootstrapSource, /\(equity \/ margin\) \* 100|balance \+ \(credit \?\? 0\) \+ \(floating \?\? 0\)|equity - margin/);
  assert.match(bootstrapSource, /useLiveAccountState\.getState\(\)\.applyMetricsSnapshot\(liveMetrics\)/);
  assert.match(bootstrapSource, /setAccount merges partial snapshots/);
  assert.doesNotMatch(bootstrapSource, /const margin = Number\(record\./);
});
