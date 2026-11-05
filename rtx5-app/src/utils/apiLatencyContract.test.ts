import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const walkSourceFiles = (root: string): string[] => {
  const absoluteRoot = resolve(process.cwd(), root);
  const entries = readdirSync(absoluteRoot);
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = resolve(absoluteRoot, entry);
    const relativePath = `${root}/${entry}`;
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(relativePath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      files.push(relativePath);
    }
  }

  return files;
};

test('REST API calls are routed through the backend latency recorder', () => {
  const files = [
    ...walkSourceFiles('src/api'),
    ...walkSourceFiles('src/domain/candles/api'),
  ];
  const rawFetchPattern = /(^|[^\w.])fetch\s*\(/;

  for (const file of files) {
    const source = stripComments(readSource(file));
    assert.doesNotMatch(
      source,
      rawFetchPattern,
      `${file} must use timedFetch/apiClient so backend response times are recorded`,
    );
  }
});

test('trade and registration paths record backend response latency', () => {
  const orderSource = readSource('src/api/orders/placeMarketOrder.ts');
  const authSource = readSource('src/api/auth.ts');
  const publicDemoSource = readSource('src/api/publicDemo.ts');
  const apiClientSource = readSource('src/api/apiClient.ts');
  const brokerApiSource = readSource('src/api/brokerApi.ts');
  const apiLatencySource = readSource('src/utils/apiLatency.ts');
  const candlesSource = readSource('src/domain/candles/api/candles.ts');
  const brokerSource = readSource('src/api/broker.ts');
  const healthSource = readSource('src/api/health.ts');

  assert.match(apiClientSource, /import \{ timedFetch \} from '..\/utils\/apiLatency'/);
  assert.match(apiClientSource, /label: `apiClient\.\$\{method\}`/);
  assert.match(apiClientSource, /label: 'apiClient\.refresh'/);
  assert.match(apiLatencySource, /export const API_FETCH_TIMEOUT_MS = Math\.max/);
  assert.match(apiLatencySource, /Number\(process\.env\.EXPO_PUBLIC_API_FETCH_TIMEOUT_MS\) \|\| 7000/);
  assert.match(apiLatencySource, /const controller = new AbortController\(\)/);
  assert.match(apiLatencySource, /signal: controller\.signal/);
  assert.match(apiLatencySource, /Promise\.race\(\[fetchPromise, timedRequest\.timeoutPromise\]\)/);
  assert.match(apiLatencySource, /Request timed out after \$\{timeoutMs\}ms/);
  assert.match(authSource, /label: 'auth\.login'/);
  assert.match(authSource, /label: 'auth\.register'/);
  assert.match(publicDemoSource, /label: 'publicDemo\.status'/);
  assert.match(publicDemoSource, /label: 'publicDemo\.groups'/);
  assert.match(publicDemoSource, /label: 'publicDemo\.createAccount'/);
  assert.match(brokerApiSource, /const response = await timedFetch|let response = await timedFetch/);
  assert.match(brokerApiSource, /label: `apiClient\.\$\{method\}`/);
  assert.match(candlesSource, /const pathSymbol = encodeURIComponent\(requestedSymbol\)/);
  assert.match(candlesSource, /apiJsonClient<unknown>\(`\/\$\{route\.pathPrefix\}\/\$\{pathSymbol\}\?\$\{params\.toString\(\)\}`/);
  assert.match(candlesSource, /commitApiJson\(result, cacheNamespace,/);
  assert.doesNotMatch(candlesSource, /label: 'candles\.publicHistory'/);
  assert.match(brokerSource, /const BROKER_SERVERS_TIMEOUT_MS = 10000/);
  // Matches the Settings/Accounts gate (SELECTED_BROKER_HEALTH_TIMEOUT_MS).
  // The first probe after logout pays a cold DNS + TCP + TLS handshake before
  // the backend responds; a tighter budget false-fired "broker unavailable"
  // on healthy brokers. Retry once on timeout only — genuine failures stay
  // fail-closed so a down broker never stalls login.
  assert.match(brokerSource, /const BROKER_HEALTH_TIMEOUT_MS = 3000/);
  assert.match(
    brokerSource,
    /const isHealthProbeTimeout = \(error: unknown\): boolean =>[\s\S]*error\.name === 'AbortError'/,
  );
  assert.match(
    brokerSource,
    /if \(!isHealthProbeTimeout\(firstError\)\) \{[\s\S]*?throw new BrokerConfigError\(0, 'Selected broker is unavailable'\);[\s\S]*?\}[\s\S]*?response = await requestBrokerHealthUrl\(healthUrl\);/,
  );
  assert.match(brokerSource, /const controller = new AbortController\(\)/);
  assert.match(brokerSource, /timedFetch\(`\$\{baseUrl\}\/broker\/servers`/);
  assert.match(brokerSource, /fetchBrokerDirectoryFromBase\(PUBLIC_BROKER_DIRECTORY_BASE_URL\)/);
  assert.match(brokerSource, /label: 'broker\.servers'/);
  assert.match(
    brokerSource,
    /label: 'broker\.servers'[\s\S]*timeoutMs: BROKER_SERVERS_TIMEOUT_MS/,
  );
  assert.match(brokerSource, /label: 'broker\.health'/);
  assert.match(brokerSource, /Broker list request timed out\. Please check your connection and try again\./);
  assert.match(brokerSource, /clearTimeout\(timeout\)/);
  assert.match(healthSource, /const capture = captureActiveBrokerSession\(\)/);
  assert.match(healthSource, /const statusUrl = capture\.session\.feedStatusUrl/);
  assert.match(healthSource, /timedFetch\(statusUrl/);
  assert.match(healthSource, /isActiveBrokerSessionCurrent\(identity\)/);
  assert.match(healthSource, /label: 'health\.broker'/);
  assert.match(orderSource, /recordApiLatency\(\{/);
  assert.match(orderSource, /label: `trade\.placeMarketOrder\.\$\{requestedSide\}`/);
  assert.match(orderSource, /endpoint: '\/orders'/);
  assert.match(orderSource, /source: 'trade'/);
});

test('expired broker sessions fail fast and do not keep stale secure tokens alive', () => {
  const brokerApiSource = readSource('src/api/brokerApi.ts');
  const brokerRealtimeSource = readSource('src/api/ws/BrokerRealtimeService.ts');

  // Contract v3: refresh timeout raised from 2.5 s to 8 s.
  assert.match(brokerApiSource, /export const AUTH_REFRESH_TIMEOUT_MS = 8000/);
  assert.match(brokerApiSource, /createUnauthenticatedResponse/);
  assert.match(brokerApiSource, /return createUnauthenticatedResponse\(AUTH_SESSION_EXPIRED_MESSAGE\)/);
  assert.match(brokerApiSource, /const capture = captureActiveBrokerSession\(\)/);
  assert.match(brokerApiSource, /const identity = getActiveBrokerSessionIdentity\(capture\.session\)/);
  assert.match(brokerApiSource, /subscribeActiveBrokerSession\(\(event\) => \{[\s\S]*this\.abortInFlightRequests\(\)[\s\S]*this\.refreshPromises\.clear\(\)/);
  assert.match(brokerApiSource, /const namespace = capture\.session\.cacheNamespace/);
  assert.match(brokerApiSource, /const existing = this\.refreshPromises\.get\(namespace\)/);
  assert.match(brokerApiSource, /if \(isAuthFailureStatus\(response\.status\)\) \{[\s\S]*await this\.invalidateAuthSession\(identity\)/);
  // Contract v3: broker_id is compared ignoring case, account_login as number or string.
  assert.match(brokerApiSource, /const identityMismatch = resolveRefreshIdentityMismatch\(normalized, session\);[\s\S]*await this\.invalidateAuthSession\(identity\)/);
  assert.match(brokerApiSource, /private async invalidateAuthSession\(identity: ActiveBrokerSessionIdentity\)/);
  assert.match(brokerApiSource, /beginActiveBrokerSessionTransition\(\)/);
  assert.match(brokerApiSource, /const \{ clearAuthSessionTokens \} = await import\('\.\.\/state\/brokerSessionStorage'\)/);
  assert.match(brokerApiSource, /private assertCurrent\(identity: ActiveBrokerSessionIdentity\)/);
  assert.match(brokerApiSource, /throw new StaleBrokerSessionError\(\)/);
  assert.doesNotMatch(brokerApiSource, /useUserPreferences|getSecureItemAsync\(ACCESS_TOKEN_KEY\)/);
  assert.match(brokerRealtimeSource, /AUTH_SESSION_UNAVAILABLE_PATTERN/);
  assert.match(brokerRealtimeSource, /const capture = captureActiveBrokerSession\(\)/);
  assert.match(brokerRealtimeSource, /getActiveBrokerSessionIdentity\(capture\.session\)/);
  assert.match(brokerRealtimeSource, /isActiveBrokerSessionCurrent\(identity\)/);
  assert.match(brokerRealtimeSource, /private resolveIdentity\(\): ActiveBrokerSessionIdentity \| null/);
  assert.match(brokerRealtimeSource, /private pauseUntilNextLogin\(\): void/);
  assert.match(brokerRealtimeSource, /this\.pauseUntilNextLogin\(\)/);
  assert.doesNotMatch(brokerRealtimeSource, /useUserPreferences/);
});
