import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/state/userPreferences/store.ts'), 'utf8');

test('persisted user preferences are normalized before second-launch hydration reaches UI', () => {
  const storeSource = source();

  assert.match(storeSource, /const PREFERENCES_STORAGE_VERSION = 23/);
  assert.match(storeSource, /const CHART_DRAWING_RECORDS_STORAGE_KEY = 'rtx5-chart-drawing-records-v1'/);
  assert.match(storeSource, /normalizePersistedUserPreferencesState/);
  assert.match(storeSource, /quoteSymbols: asStringArray\(state\.quoteSymbols\)/);
  assert.match(storeSource, /chartSymbol = asString\(state\.chartSymbol, 'GBPUSD'\)/);
  assert.match(storeSource, /chartTimeframe: normalizeCandleHistoryTimeframe\(state\.chartTimeframe\)/);
  assert.match(storeSource, /const normalizeChartVisualType = \(value: unknown\): ChartVisualType => \{[\s\S]*if \(value === 'bars'\) return 'candles';[\s\S]*value === 'candles' \|\| value === 'line' \|\| value === 'area' \|\| value === 'hollow' \|\| value === 'renko'/);
  assert.match(storeSource, /chartVisualType: normalizeChartVisualType\(state\.chartVisualType\)/);
  assert.match(storeSource, /chartVerticalScrollingLocked: asBoolean\(state\.chartVerticalScrollingLocked, false\)/);
  assert.match(storeSource, /chartAutoScaleEnabled: asBoolean\(state\.chartAutoScaleEnabled, false\)/);
  assert.match(storeSource, /oneClickAccepted: asBoolean\(state\.oneClickAccepted, true\)/);
  assert.match(storeSource, /oneClickAccepted: true/);
  assert.match(storeSource, /hasPersistedLivePriceLine = typeof record\.showLivePriceLine === 'boolean'/);
  assert.match(storeSource, /!hasPersistedLivePriceLine && typeof record\.showBidPriceLine === 'boolean'[\s\S]*next\.showLivePriceLine = record\.showBidPriceLine/);
  assert.match(storeSource, /next\.showAskPriceLine = false/);
  assert.match(
    storeSource,
    /typeof persistedChartDisplay\.showTradeHistory !== 'boolean'[\s\S]*nextChartDisplay\.showTradeHistory = legacyShowOnChartState\.showClosedPositions/,
  );
  assert.match(storeSource, /chartDisplay: nextChartDisplay/);
  assert.match(storeSource, /DEFAULT_CHART_COLOR_SCHEME/);
  assert.match(storeSource, /LEGACY_BLUE_DEFAULT_CHART_COLORS/);
  assert.match(storeSource, /isLegacyBlueDefaultChartColors\(state\.chartColors\)/);
  assert.match(storeSource, /chartColorScheme: nextChartColorScheme/);
  assert.match(storeSource, /chartColors: nextChartColors/);
  assert.match(storeSource, /chartColorScheme: DEFAULT_CHART_COLOR_SCHEME/);
  assert.match(storeSource, /chartColors: buildChartColorsForScheme\(DEFAULT_CHART_COLOR_SCHEME\)/);
  assert.match(storeSource, /setChartVisualType: \(chartType\) => set\(\{ chartVisualType: normalizeChartVisualType\(chartType\) \}\)/);
  assert.doesNotMatch(storeSource, /const isChartVisualType/);
  assert.match(storeSource, /persistChartDrawingRecordsBySymbol\(nextRecordsBySymbol\)/);
  assert.match(storeSource, /readChartDrawingRecordsBySymbol\(\)[\s\S]*\.then\(\(storedRecordsBySymbol\) => \{[\s\S]*useUserPreferences\.setState\(current => completeChartDrawingHydration\([\s\S]*\.catch\(\(restoreError\) => \{[\s\S]*setHasHydrated\(true\)/);
  const restoreSource = storeSource.slice(storeSource.indexOf('onRehydrateStorage:'));
  assert.doesNotMatch(restoreSource, /state\.setChartDrawingRecordsForSymbol|persistChartDrawingRecordsBySymbol|JSON\.stringify/);
  assert.doesNotMatch(storeSource, /marketNewsSavedIds|setMarketNewsSavedIds|toggleMarketNewsSavedId/);
  assert.match(storeSource, /Boolean\(accountDetails\?\.credentials\?\.accessToken\)/);
  assert.match(storeSource, /resolveBrokerConnectionWithPublicDemoDefault\(\{/);
  assert.match(storeSource, /brokerId: ''/);
  assert.match(storeSource, /brokerServerUrl: ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL/);
  assert.match(storeSource, /buildAccountEnvironmentKey\(brokerId, accountDetails\.id\)/);
  assert.match(storeSource, /source: 'legacy-persisted'/);
  assert.match(storeSource, /allowInitialFallback: true/);
  assert.match(storeSource, /accountType: state\.accountType/);
  assert.match(storeSource, /accountEnvironmentSource: state\.accountEnvironmentSource/);
  assert.match(storeSource, /accountEnvironmentKey: state\.accountEnvironmentKey/);
  assert.match(storeSource, /merge: \(persistedState, currentState\) => \(\{/);
  assert.match(storeSource, /Ignoring invalid persisted preferences/);
  assert.match(storeSource, /let preferenceWriteFlushScheduled = false/);
  assert.match(storeSource, /let preferenceWriteFlushFallbackTimer: ReturnType<typeof setTimeout> \| null = null/);
  assert.match(storeSource, /function schedulePreferenceWriteFlush\(\) \{[\s\S]*if \(preferenceWriteFlushScheduled\) return;[\s\S]*preferenceWriteFlushScheduled = true;[\s\S]*setTimeout\(flushPendingPreferenceWrites, 0\)/);
  assert.match(storeSource, /preferenceWriteFlushFallbackTimer = setTimeout\(flushPendingPreferenceWrites, 100\)/);
  assert.match(
    storeSource,
    /function flushPendingPreferenceWrites\(\) \{[\s\S]*sanitizePreferenceAuthStorageValue\(value\)[\s\S]*AsyncStorage\.setItem\(name, JSON\.stringify\(sanitized\)\)/,
  );
  assert.match(
    storeSource,
    /setItem: \(name, value\) => \{\s*pendingPreferenceWrites\.set\(name, value\);\s*schedulePreferenceWriteFlush\(\);\s*\}/,
  );
  assert.match(storeSource, /isAsyncStorageCapacityError\(error\)/);
  assert.match(storeSource, /await pruneObsoleteSessionCaches\(\);[\s\S]*await persistWrites\(\)/);
  assert.match(storeSource, /export const flushUserPreferencesPersistence/);
});

test('persisted preferences strip credentials and migrate the legacy blob before hydration', () => {
  const storeSource = source();

  assert.match(storeSource, /sanitizePreferenceAuthStorageValue\(parsed\)/);
  assert.match(storeSource, /migrateLegacyAuthSessionCredentials\(\{/);
  assert.match(storeSource, /await AsyncStorage\.setItem\(name, JSON\.stringify\(persistedStorageValue\)\)/);
  assert.match(storeSource, /AsyncStorage\.removeItem\(name\)/);
  assert.match(
    storeSource,
    /accountDetails: state\.accountDetails[\s\S]*id: state\.accountDetails\.id,[\s\S]*name: state\.accountDetails\.name,[\s\S]*server: state\.accountDetails\.server/,
  );
  const partializeStart = storeSource.indexOf('function partializeUserPreferences');
  const partializeEnd = storeSource.indexOf('\nexport const useUserPreferences', partializeStart);
  const partializeSource = storeSource.slice(partializeStart, partializeEnd);
  assert.doesNotMatch(partializeSource, /accessToken|refreshToken|expiresAt|credentials:/);
  assert.doesNotMatch(storeSource, /clearAuthSessionTokens/);
  assert.match(
    storeSource,
    /Missing\/stale plain preferences must not erase it/,
  );
});

test('candidate broker setters cannot rebind an authenticated session', () => {
  const storeSource = source();

  assert.match(
    storeSource,
    /setBrokerId: \(id\) =>[\s\S]*set\(\(state\) => state\.isLoggedIn \? state : \{ brokerId: id \}\)/,
  );
  assert.match(
    storeSource,
    /setBrokerConnection: \(brokerId, serverUrl = '', logoUrl = ''\) =>[\s\S]*if \(state\.isLoggedIn\) \{[\s\S]*return state;/,
  );
});

test('account environment is account scoped, atomically derived, and cleared on logout', () => {
  const storeSource = source();

  assert.match(
    storeSource,
    /const accountEnvironment = mergeAccountEnvironment\(null,[\s\S]*allowInitialFallback: true/,
  );
  assert.match(
    storeSource,
    /mergeAccountEnvironmentForAccount: \(accountKey, resolved, source\) =>[\s\S]*accountKey !== currentAccountKey[\s\S]*state\.accountEnvironmentKey !== currentAccountKey[\s\S]*allowInitialFallback: false/,
  );
  assert.match(
    storeSource,
    /logout: \(\) => \{[\s\S]*accountType: 'unknown'[\s\S]*accountEnvironmentSource: 'unknown'[\s\S]*accountEnvironmentKey: ''[\s\S]*isDemoAccount: false/,
  );
  assert.match(
    storeSource,
    /isDemoAccount: environment\.isDemoAccount/,
  );
  assert.doesNotMatch(storeSource, /setIsDemoAccount/);
});
