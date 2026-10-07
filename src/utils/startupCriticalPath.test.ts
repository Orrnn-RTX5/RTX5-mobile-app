import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file: string) => readFileSync(file, 'utf8');

test('startup overlaps anonymous broker discovery with secure restore and reveals after paint', () => {
  const root = read('app/_layout.tsx');
  assert.match(root, /useEffect\(\(\) => \{[\s\S]*void prefetchBrokerServers\(\)\.catch\(\(\) => undefined\);\s*\}, \[\]\)/);
  assert.match(root, /hasHydrated && sessionRestoreComplete && fontsReady[\s\S]*return scheduleAfterVisualFrame\(\(\) => \{\s*void SplashScreen\.hideAsync\(\)/);
  assert.doesNotMatch(root, /setTimeout\(\(\) => \{\s*void SplashScreen\.hideAsync\(\);\s*\}, 100\)/);
  assert.match(root, /const InnerLayout = memo\(function InnerLayout\(\)/);
  assert.match(root, /const accountLogin = useUserPreferences\(\(s\) => s\.accountDetails\?\.id\)/);
});

test('root bootstrap yields to the dashboard and rejects stale session work', () => {
  const root = read('app/_layout.tsx');
  assert.match(root, /const bootAccountData = async \(\) => \{\s*if \(!accountLogin \|\| !isActiveBrokerSessionCurrent\(identity\)\) return/);
  assert.match(root, /expectedProvenance: getActiveBrokerSessionProvenance\(capture\.session\)/);
  assert.match(root, /const cancelBootstrap = scheduleAfterVisualFrame\(\(\) => \{ void bootAccountData\(\); \}\);[\s\S]*cancelBootstrap\(\)/);
});

test('hidden prewarming yields to authentication but focused routes bypass that gate', () => {
  const provider = read('src/ui/components/RetainedRoutePrewarm.tsx');
  const route = read('src/ui/components/DeferredRouteMount.tsx');
  const tabs = read('app/(tabs)/_layout.tsx');
  assert.match(provider, /if \(!allowed \|\| firstPaintComplete\) return/);
  assert.match(provider, /scheduleAfterVisualFrame\([\s\S]*scheduleIdleWork\([\s\S]*setFirstPaintComplete\(true\)/);
  assert.match(provider, /cancelPaint\(\); cancelIdle\?\.\(\)/);
  assert.match(route, /return useDeferredRouteContentReady\(focused \? 0 : prewarmDelayMs, focused \|\| prewarmAllowed\)/);
  assert.match(tabs, /const AnonymousChartHistoryStartupPrefetch[\s\S]*if \(!backgroundWorkAllowed\) return/);
});
