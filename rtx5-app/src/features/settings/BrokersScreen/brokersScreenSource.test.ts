import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('broker rows render a plain chevron without a circular shell', () => {
  const source = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const contentStart = source.indexOf('function BrokerDirectoryCardContent');
  const contentEnd = source.indexOf('function BrokerAvatar', contentStart);
  const contentSource = source.slice(contentStart, contentEnd);
  const selectBtnStart = source.indexOf('selectBtn: {');
  const selectBtnEnd = source.indexOf('emptyState:', selectBtnStart);
  const selectBtnStyle = source.slice(selectBtnStart, selectBtnEnd);

  assert.notEqual(contentStart, -1);
  assert.notEqual(contentEnd, -1);
  assert.match(contentSource, /style=\{styles\.selectBtn\} pointerEvents="none"/);
  assert.match(contentSource, /name=\{broker\.selectable \? 'chevron-forward' : 'lock-closed'\}/);
  assert.notEqual(selectBtnStart, -1);
  assert.notEqual(selectBtnEnd, -1);
  assert.match(selectBtnStyle, /width: 36/);
  assert.match(selectBtnStyle, /height: 36/);
  assert.match(selectBtnStyle, /alignItems: 'center'/);
  assert.match(selectBtnStyle, /justifyContent: 'center'/);
  assert.doesNotMatch(selectBtnStyle, /borderRadius|borderWidth|borderColor|backgroundColor/);
});

test('broker rows resolve real broker logos before falling back to initials', () => {
  const source = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const directoryRowsSource = readSource(
    'src/features/settings/BrokersScreen/brokerDirectoryRows.ts',
  );

  assert.match(source, /buildBrokerDirectoryRows/);
  assert.match(source, /sortBrokerDirectoryRows/);
  assert.match(directoryRowsSource, /function normalizeBrokerLogoUrl\(logoUrl\?: string \| null\)/);
  assert.match(directoryRowsSource, /function resolveBrokerLogoUrl\(broker: BrokerServer\)/);
  assert.match(directoryRowsSource, /const BROKER_LOGO_KEYS = \[/);
  assert.match(directoryRowsSource, /'logo_url'/);
  assert.match(directoryRowsSource, /'image_url'/);
  assert.match(directoryRowsSource, /'brand_logo_url'/);
  assert.match(directoryRowsSource, /logoUrl: resolveBrokerLogoUrl\(broker\)/);
  assert.match(directoryRowsSource, /function buildBrokerDomainLogoUrl\(domain\?: string\)/);
  assert.match(directoryRowsSource, /https:\/\/www\.google\.com\/s2\/favicons\?domain=/);
  assert.match(source, /const logoUri = broker\.selectable[\s\S]*\? broker\.logoUrl \|\| buildBrokerDomainLogoUrl\(broker\.domain\)[\s\S]*: ''/);
  assert.match(source, /source=\{\{ uri: logoUri, cache: 'reload' \}\}[\s\S]*fadeDuration=\{0\}/);
  assert.doesNotMatch(source, /cache: 'force-cache'/);
  assert.match(source, /failed=\{Boolean\([\s\S]*logoFailed\[item\.logoUrl \|\| buildBrokerDomainLogoUrl\(item\.domain\)\][\s\S]*\)\}/);
  assert.doesNotMatch(directoryRowsSource, /KNOWN_BROKER_DOMAINS|myproptrade:|gtabroker:|testorrnn:/);
  assert.match(directoryRowsSource, /domain: resolution\.endpoints\.servicesDomain/);
});

test('each broker card probes only its own validated feed status endpoint', () => {
  const source = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const rows = readSource('src/features/settings/BrokersScreen/brokerDirectoryRows.ts');
  const health = readSource('src/features/settings/BrokersScreen/brokerDirectoryHealth.ts');

  assert.match(rows, /feedStatusUrl: resolution\.endpoints\.feedStatusUrl/);
  assert.match(source, /broker\.selectable \? \([\s\S]*<BrokerDirectoryHealthBadge[\s\S]*broker=\{broker\}/);
  assert.match(
    source,
    /probeBrokerDirectoryHealth\([\s\S]*broker\.feedStatusUrl,[\s\S]*activeController\.signal/,
  );
  assert.doesNotMatch(health, /broker_id=|URLSearchParams|market_api_url/);
  assert.match(health, /normalizeFeedStatusVerdict\(payload, observedAt\)/);
  assert.doesNotMatch(health, /normalizeConfirmedFeedStatus|upstreamConnected|\.upstream_connected/);
});

test('broker health badges refresh while focused, expire stale results, and clean up', () => {
  const source = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const badgeStart = source.indexOf('function BrokerDirectoryHealthBadge');
  const badgeEnd = source.indexOf('const MT5_BLUE', badgeStart);
  const badgeSource = source.slice(badgeStart, badgeEnd);

  assert.notEqual(badgeStart, -1);
  assert.notEqual(badgeEnd, -1);
  assert.match(source, /enabled=\{healthEnabled\}/);
  assert.match(badgeSource, /const runProbe = async \(\) =>/);
  assert.match(
    badgeSource,
    /expiryTimer = setTimeout\([\s\S]*setHealth\(null\)[\s\S]*BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS/,
  );
  assert.match(
    badgeSource,
    /refreshTimer = setTimeout\([\s\S]*void runProbe\(\)[\s\S]*BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS/,
  );
  assert.match(
    badgeSource,
    /return \(\) => \{[\s\S]*stopped = true[\s\S]*clearTimeout\(refreshTimer\)[\s\S]*clearTimeout\(expiryTimer\)[\s\S]*controller\?\.abort\(\)/,
  );
  assert.doesNotMatch(badgeSource, /setInterval\(/);
});

test('identity-only directory rows are visible but cannot authorize broker actions', () => {
  const source = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const launchShell = readSource('src/features/settings/BrokersLaunchShell.tsx');
  const launchHost = readSource('src/features/settings/BrokersLaunchHost.tsx');
  const route = readSource('app/settings/brokers.tsx');

  assert.match(source, /useBrokerDirectory\(isScreenFocused\)/);
  assert.match(source, /buildBrokerDirectoryRows\(brokerDirectory\?\.entries\)/);
  assert.match(source, /brokerDirectory\?\.mode === 'identity_only'/);
  assert.match(source, /Broker identities are visible, but connection configuration is pending\./);
  assert.match(source, /Connection configuration pending/);
  assert.match(source, /item\.selectable \? \([\s\S]*<Pressable[\s\S]*\) : \([\s\S]*pointerEvents="none"[\s\S]*accessibilityState=\{\{ disabled: true \}\}/);
  assert.match(source, /name=\{broker\.selectable \? 'chevron-forward' : 'lock-closed'\}/);
  assert.match(source, /if \(!broker\.selectable\) \{[\s\S]*cancelled: true,[\s\S]*selection: null,[\s\S]*return;/);
  assert.match(source, /const handleBrokerRowPress[\s\S]*if \(!broker\.selectable\) \{[\s\S]*return;/);

  assert.match(launchShell, /useBrokerDirectory\(dataActive\)/);
  assert.match(launchShell, /buildBrokerDirectoryRows\(brokerDirectory\?\.entries\)/);
  assert.match(launchShell, /if \(onSelectBroker && row\.selectable\)/);
  assert.match(launchShell, /if \(!row\.selectable\) return;[\s\S]*onSelectBroker\(row\)/);
  assert.match(launchHost, /const selectBroker[\s\S]*if \(!broker\.selectable\) \{[\s\S]*return;/);
  assert.match(route, /const handleSelectBroker[\s\S]*if \(!broker\.selectable\) \{[\s\S]*return;/);
});

test('the mounted route removes the retained cover even while the directory is loading', () => {
  const source = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');

  assert.match(
    source,
    /useLayoutEffect\(\(\) => \{[\s\S]*if \(!isScreenFocused\)[\s\S]*scheduleBrokersLaunchCoverRemoval\(launchSnapshot\.revision\)[\s\S]*\}, \[isScreenFocused, onSelectBroker\]\)/,
  );
  assert.match(source, /if \(onSelectBroker\) return;/);
  assert.doesNotMatch(source, /directoryQuerySettled/);
  assert.doesNotMatch(source, /brokerRecords\.length === 0/);
});

test('every broker picker entry waits for exact selected-server health before opening login', () => {
  const screen = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const launchHost = readSource('src/features/settings/BrokersLaunchHost.tsx');
  const route = readSource('app/settings/brokers.tsx');

  const screenSelectStart = screen.indexOf('const handleBrokerRowPress =');
  const screenSelectEnd = screen.indexOf('const handleBack =', screenSelectStart);
  const screenSelect = screen.slice(screenSelectStart, screenSelectEnd);
  const hostSelectStart = launchHost.indexOf('const selectBroker =');
  const hostSelectEnd = launchHost.indexOf('\n\n  useEffect(', hostSelectStart);
  const hostSelect = launchHost.slice(hostSelectStart, hostSelectEnd);
  const routeSelectStart = route.indexOf('const handleSelectBroker =');
  const routeSelectEnd = route.indexOf('\n\n  return (', routeSelectStart);
  const routeSelect = route.slice(routeSelectStart, routeSelectEnd);

  for (const source of [screenSelect, hostSelect, routeSelect]) {
    assert.match(source, /selectedBrokerHealthGate\.run\(\{/);
    assert.match(source, /serverUrl: broker\.serverUrl/);
    assert.match(source, /onAvailable: \(\) => \{/);
    assert.match(
      source,
      /onUnavailable: \(\) => \{[\s\S]*Alert\.alert\(SELECTED_BROKER_UNAVAILABLE_MESSAGE\)/,
    );
    assert.ok(
      source.indexOf('selectedBrokerHealthGate.run({') < source.indexOf('showBrokerDetailLaunch(')
      || !source.includes('showBrokerDetailLaunch('),
    );
  }

  assert.match(screenSelect, /onAvailable: \(\) => \{[\s\S]*openBrokerDetail\(selection\)/);
  assert.match(hostSelect, /onAvailable: \(\) => \{[\s\S]*selectGuestBrokerById\(broker\.brokerId/);
  assert.match(routeSelect, /onAvailable: \(\) => \{[\s\S]*selectGuestBrokerById\(broker\.brokerId/);
  assert.doesNotMatch(screen, /prepareBrokerDetailLaunch/);
  assert.match(
    screen,
    /serverUrl: selection\.brokerServerUrl,[\s\S]*Alert\.alert\(SELECTED_BROKER_UNAVAILABLE_MESSAGE\)/,
  );
});
