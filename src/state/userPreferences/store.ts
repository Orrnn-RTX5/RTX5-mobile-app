/**
 * Zustand store for user preferences. Backed by AsyncStorage with a versioned
 * `migrate` so old persisted shapes upgrade safely on app launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import {
  DEFAULT_CHART_SHOW_ON_CHART,
  buildChartShowOnChartSettingsFromLegacy,
  hasLegacyChartShowOnChartDefaults,
  normalizeChartShowOnChartSettings,
  type ChartShowOnChartSettings,
} from '../../features/chart/chartShowOnChart';
import {
  type PersistedChartDrawingsBySymbol,
  getChartDrawingBucketKey,
  getChartDrawingLabels,
  sanitizePersistedChartDrawings,
} from '../../features/chart/drawingPersistence';
import {
  buildAccountEnvironmentKey,
  mergeAccountEnvironment,
  type AccountEnvironment,
  type AccountEnvironmentSource,
  type AccountEnvironmentState,
} from '../../domain/accountType';
import { normalizeCandleHistoryTimeframe } from '../../domain/candles/core/candles';
import { DEFAULT_TRADE_VOLUME, normalizeTradeVolume } from '../../utils/tradeVolume';
import { normalizeLanguageCode } from '../../i18n/translations';
import {
  ORRNN_DEMO_PUBLIC_BROKER_ID,
  ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL,
  resolveBrokerConnectionWithPublicDemoDefault,
} from '../../config/orrnnDemoPublicMarket';
import {
  migrateLegacyAuthSessionCredentials,
} from '../brokerSessionStorage';
import {
  isAsyncStorageCapacityError,
  pruneObsoleteSessionCaches,
} from '../sessionCacheStorage';
import {
  CHART_COLOR_SCHEME_PRESETS,
  DEFAULT_CHART_COLOR_SCHEME,
  DEFAULT_CHART_COLORS,
  DEFAULT_CHART_DISPLAY_SETTINGS,
} from './chartColors';
import {
  failClosedPersistedAuthState,
  injectRuntimeCredentials,
  sanitizePreferenceAuthStorageValue,
} from './authPersistence';
import { setImmediateThemeMode } from '../themeMode';
import { completeChartDrawingHydration } from './chartDrawingHydration';
import type {
  ChartColorsConfig,
  ChartDisplaySettings,
  ChartTradeVolumeDisplayMode,
  ChartVisualType,
  LanguageCode,
  ThemeMode,
  UserPreferencesState,
} from './types';

const defaultSymbols: string[] = [];
const normalizeBrokerConnectionId = (brokerId?: string | null): string =>
  String(brokerId ?? '').trim();

type PersistedUserPreferencesState = Omit<
  UserPreferencesState,
  | 'hasHydrated'
  | 'setLanguage'
  | 'login'
  | 'logout'
  | 'updateTokens'
  | 'setQuoteViewMode'
  | 'setThemeMode'
  | 'addQuoteSymbol'
  | 'removeQuoteSymbol'
  | 'setQuoteSymbols'
  | 'setChartSymbol'
  | 'setChartTimeframe'
  | 'setTradeVolume'
  | 'setChartTradeVolumeDisplayMode'
  | 'setChartVisualType'
  | 'setChartViewportShowVolumePane'
  | 'setChartViewportShowDrawingToolbar'
  | 'setChartOneClickPanelAtBottom'
  | 'setChartVerticalScrollingLocked'
  | 'setChartAutoScaleEnabled'
  | 'addChartDrawing'
  | 'removeChartDrawing'
  | 'setChartDrawings'
  | 'setChartDrawingRecordsForSymbol'
  | 'removeChartDrawingRecordForSymbol'
  | 'setChartLockAll'
  | 'setChartHideAll'
  | 'setChartShowOnChartItem'
  | 'setHistorySummaryDetailsVisible'
  | 'setTradeSummaryDetailsVisible'
  | 'setPriceSource'
  | 'setOpenOrderMode'
  | 'setOneClickAccepted'
  | 'setHistoryRange'
  | 'setHistoryDateRange'
  | 'mergeAccountEnvironmentForAccount'
  | 'setBrokerId'
  | 'setBrokerConnection'
  | 'setHasSetInitialSymbols'
  | 'setChartColorScheme'
  | 'setChartColor'
  | 'setChartDisplaySetting'
  | 'setHasHydrated'
  | 'updateAccountDetails'
>;

const pendingPreferenceWrites = new Map<string, StorageValue<PersistedUserPreferencesState>>();
let preferenceWriteFlushScheduled = false;
let preferenceWriteFlushFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let preferenceWriteQueue: Promise<void> = Promise.resolve();
const PREFERENCES_STORAGE_VERSION = 23;
const CHART_DRAWING_RECORDS_STORAGE_KEY = 'rtx5-chart-drawing-records-v1';
const LEGACY_BLUE_DEFAULT_CHART_COLORS: ChartColorsConfig = {
  background: '#121212',
  foreground: '#94A3B8',
  grid: 'rgba(255,255,255,0.26)',
  candlesUptrend: '#2962FF',
  candlesDowntrend: '#EF5350',
  hollowBody: '#121212',
  barsUptrend: '#2962FF',
  barsDowntrend: '#EF5350',
  lineBody: '#2962FF',
  tradeOpen: '#2962FF',
  tradeTpSl: '#089981',
  tradeStopOut: '#DC2626',
};
const LEGACY_BLUE_DEFAULT_REQUIRED_COLOR_KEYS: Array<keyof ChartColorsConfig> = [
  'background',
  'foreground',
  'grid',
  'candlesUptrend',
  'candlesDowntrend',
  'hollowBody',
  'barsUptrend',
  'barsDowntrend',
  'lineBody',
];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asFiniteNumber = (value: unknown, fallback: number | null): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const normalizeChartColorForComparison = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '') : '';

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : [];

const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark';
const isQuoteViewMode = (value: unknown): value is UserPreferencesState['quoteViewMode'] =>
  value === 'list' || value === 'table' || value === 'edit';
const isChartTradeVolumeDisplayMode = (value: unknown): value is ChartTradeVolumeDisplayMode =>
  value === 'lots' || value === 'margin';
const normalizeChartVisualType = (value: unknown): ChartVisualType => {
  // OHLC bars are retired from the chart type picker, so migrate any old saved value to candles.
  if (value === 'bars') return 'candles';
  // Keep newly supported Area and Renko selections across relaunch, while an
  // unknown or obsolete stored value still falls back to a safe candle chart.
  return value === 'candles' || value === 'line' || value === 'area' || value === 'hollow' || value === 'renko'
    ? value
    : 'candles';
};
const isPriceSource = (value: unknown): value is UserPreferencesState['priceSource'] =>
  value === 'bid' || value === 'ask';
const isOpenOrderMode = (value: unknown): value is UserPreferencesState['openOrderMode'] =>
  value === 'Regular' || value === 'Risk calculator' || value === 'One-click';
const isChartColorScheme = (value: unknown): value is UserPreferencesState['chartColorScheme'] =>
  value === 'green_on_black' || value === 'black_on_white' || value === 'yellow_on_black' || value === 'custom';
const isAccountEnvironment = (value: unknown): value is AccountEnvironment =>
  value === 'demo' || value === 'real' || value === 'contest' || value === 'unknown';
const isKnownAccountEnvironment = (
  value: unknown,
): value is Exclude<AccountEnvironment, 'unknown'> =>
  value === 'demo' || value === 'real' || value === 'contest';
const isAccountEnvironmentSource = (value: unknown): value is AccountEnvironmentSource =>
  value === 'backend-explicit'
  || value === 'backend-group'
  || value === 'demo-registration'
  || value === 'initial-fallback'
  || value === 'legacy-persisted'
  || value === 'unknown';

const toAccountEnvironmentPatch = (
  environment: AccountEnvironmentState | null,
): Pick<
  UserPreferencesState,
  'accountType' | 'accountEnvironmentSource' | 'accountEnvironmentKey' | 'isDemoAccount'
> => environment
  ? {
      accountType: environment.accountType,
      accountEnvironmentSource: environment.accountEnvironmentSource,
      accountEnvironmentKey: environment.accountKey,
      isDemoAccount: environment.isDemoAccount,
    }
  : {
      accountType: 'unknown',
      accountEnvironmentSource: 'unknown',
      accountEnvironmentKey: '',
      isDemoAccount: false,
    };

const readCurrentAccountEnvironment = (
  state: Pick<
    UserPreferencesState,
    'accountType' | 'accountEnvironmentSource' | 'accountEnvironmentKey' | 'isDemoAccount'
  >,
): AccountEnvironmentState | null => (
  state.accountEnvironmentKey
  && isKnownAccountEnvironment(state.accountType)
    ? {
        accountKey: state.accountEnvironmentKey,
        accountType: state.accountType,
        accountEnvironmentSource: state.accountEnvironmentSource,
        isDemoAccount: state.accountType === 'demo',
      }
    : null
);

const normalizeChartColors = (value: unknown): ChartColorsConfig => {
  const record = asRecord(value);
  const next: ChartColorsConfig = { ...DEFAULT_CHART_COLORS };
  (Object.keys(next) as Array<keyof ChartColorsConfig>).forEach((key) => {
    const color = asString(record[key]);
    if (color) {
      next[key] = color;
    }
  });
  return next;
};

const isLegacyBlueDefaultChartColors = (value: unknown): boolean => {
  const record = asRecord(value);
  return LEGACY_BLUE_DEFAULT_REQUIRED_COLOR_KEYS.every((key) =>
    normalizeChartColorForComparison(record[key]) === normalizeChartColorForComparison(LEGACY_BLUE_DEFAULT_CHART_COLORS[key]),
  );
};

const buildChartColorsForScheme = (scheme: Exclude<UserPreferencesState['chartColorScheme'], 'custom'>): ChartColorsConfig => ({
  ...DEFAULT_CHART_COLORS,
  ...CHART_COLOR_SCHEME_PRESETS[scheme].colors,
});

const normalizeChartDisplay = (value: unknown): ChartDisplaySettings => {
  const record = asRecord(value);
  const next: ChartDisplaySettings = { ...DEFAULT_CHART_DISPLAY_SETTINGS };
  const hasPersistedLivePriceLine = typeof record.showLivePriceLine === 'boolean';
  const hasPersistedShowOHLC = typeof record.showOHLC === 'boolean';
  (Object.keys(next) as Array<keyof ChartDisplaySettings>).forEach((key) => {
    next[key] = asBoolean(record[key], next[key]);
  });
  if (!hasPersistedLivePriceLine && typeof record.showBidPriceLine === 'boolean') {
    next.showLivePriceLine = record.showBidPriceLine;
  }
  // Historical default was showOHLC=false, which hid O/H/L/C under the symbol
  // picker. When the preference was never written, keep the new default on.
  if (!hasPersistedShowOHLC) {
    next.showOHLC = true;
  }
  next.showBidPriceLine = next.showLivePriceLine;
  next.showAskPriceLine = false;
  return next;
};

const normalizeAccountDetails = (value: unknown): UserPreferencesState['accountDetails'] => {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;

  const credentials = asRecord(record.credentials);
  const accessToken = asString(credentials.accessToken);
  const refreshToken = asString(credentials.refreshToken);
  const expiresAt = asString(credentials.expiresAt);
  return {
    id,
    name: asString(record.name, `Account ${id}`),
    server: asString(record.server),
    ...(accessToken
      ? {
          credentials: {
            accessToken,
            refreshToken,
            expiresAt,
          },
        }
      : {}),
  };
};

const normalizeDrawingRecordsBySymbol = (value: unknown): PersistedChartDrawingsBySymbol => {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([symbol, drawings]) => [
      getChartDrawingBucketKey(symbol),
      sanitizePersistedChartDrawings(drawings),
    ]),
  );
};

function persistChartDrawingRecordsBySymbol(recordsBySymbol: PersistedChartDrawingsBySymbol): void {
  void AsyncStorage.setItem(CHART_DRAWING_RECORDS_STORAGE_KEY, JSON.stringify(recordsBySymbol)).catch((error) => {
    console.error('[UserPreferences] Failed to persist chart drawings', error);
  });
}

async function readChartDrawingRecordsBySymbol(): Promise<PersistedChartDrawingsBySymbol> {
  try {
    const value = await AsyncStorage.getItem(CHART_DRAWING_RECORDS_STORAGE_KEY);
    const normalized = value ? normalizeDrawingRecordsBySymbol(JSON.parse(value)) : {};
    return normalized;
  } catch (error) {
    console.error('[UserPreferences] Ignoring invalid persisted chart drawings', error);
    void AsyncStorage.removeItem(CHART_DRAWING_RECORDS_STORAGE_KEY).catch((removeError) => {
      console.error('[UserPreferences] Failed to clear invalid persisted chart drawings', removeError);
    });
    return {};
  }
}

export function normalizePersistedUserPreferencesState(
  persistedState: unknown,
  version = PREFERENCES_STORAGE_VERSION,
): PersistedUserPreferencesState {
  const state = asRecord(persistedState);
  const legacyShowOnChartState = {
    showOpenPositions: typeof state.showOpenPositions === 'boolean' ? state.showOpenPositions : undefined,
    showTpSlStopLimit: typeof state.showTpSlStopLimit === 'boolean' ? state.showTpSlStopLimit : undefined,
    showClosedPositions: typeof state.showClosedPositions === 'boolean' ? state.showClosedPositions : undefined,
    showTradingSignals: typeof state.showTradingSignals === 'boolean' ? state.showTradingSignals : undefined,
    showHmrPeriods: typeof state.showHmrPeriods === 'boolean' ? state.showHmrPeriods : undefined,
    showPriceAlerts: typeof state.showPriceAlerts === 'boolean' ? state.showPriceAlerts : undefined,
    showPotentialStopOut: typeof state.showPotentialStopOut === 'boolean' ? state.showPotentialStopOut : undefined,
  };
  const shouldResetLegacyShowOnChartFlags =
    (version ?? 0) < 4 && hasLegacyChartShowOnChartDefaults(legacyShowOnChartState);
  const nextChartShowOnChart = shouldResetLegacyShowOnChartFlags
    ? { ...DEFAULT_CHART_SHOW_ON_CHART }
    : normalizeChartShowOnChartSettings(
        state.chartShowOnChart ?? buildChartShowOnChartSettingsFromLegacy(legacyShowOnChartState),
      );
  const nextDrawingRecordsBySymbol = normalizeDrawingRecordsBySymbol(state.chartDrawingRecordsBySymbol);
  const chartSymbol = asString(state.chartSymbol, 'GBPUSD');
  const activeDrawingLabels = getChartDrawingLabels(
    nextDrawingRecordsBySymbol[getChartDrawingBucketKey(chartSymbol)] ?? [],
  );
  const accountDetails = normalizeAccountDetails(state.accountDetails);
  const isLoggedIn =
    asBoolean(state.isLoggedIn, false) &&
    Boolean(accountDetails?.credentials?.accessToken);
  const persistedBrokerId = asString(state.brokerId);
  const persistedBrokerServerUrl = asString(state.brokerServerUrl);
  // A clean install starts on the public demo broker, but an explicit saved
  // broker selection remains available for the user's next login. Anonymous
  // Quotes/Chart activation depends only on logged-out state, not this value.
  const {
    brokerId,
    serverUrl: brokerServerUrl,
  } = resolveBrokerConnectionWithPublicDemoDefault({
    brokerId: persistedBrokerId,
    serverUrl: persistedBrokerServerUrl,
    isLoggedIn,
  });
  const expectedAccountEnvironmentKey = isLoggedIn && accountDetails?.id && brokerId
    ? buildAccountEnvironmentKey(brokerId, accountDetails.id)
    : '';
  const persistedEnvironmentKey = asString(state.accountEnvironmentKey);
  const persistedEnvironmentSource = isAccountEnvironmentSource(state.accountEnvironmentSource)
    ? state.accountEnvironmentSource
    : 'unknown';
  let normalizedAccountEnvironment: AccountEnvironmentState | null = null;

  if (expectedAccountEnvironmentKey) {
    if (
      persistedEnvironmentKey === expectedAccountEnvironmentKey
      && isAccountEnvironment(state.accountType)
    ) {
      normalizedAccountEnvironment = mergeAccountEnvironment(null, {
        accountKey: expectedAccountEnvironmentKey,
        resolved: state.accountType,
        source: persistedEnvironmentSource,
        allowInitialFallback: true,
      });
    } else if (
      (version ?? 0) < PREFERENCES_STORAGE_VERSION
      && typeof state.isDemoAccount === 'boolean'
    ) {
      normalizedAccountEnvironment = mergeAccountEnvironment(null, {
        accountKey: expectedAccountEnvironmentKey,
        resolved: state.isDemoAccount ? 'demo' : 'real',
        source: 'legacy-persisted',
        allowInitialFallback: true,
      });
    } else {
      normalizedAccountEnvironment = mergeAccountEnvironment(null, {
        accountKey: expectedAccountEnvironmentKey,
        resolved: 'unknown',
        source: 'unknown',
        allowInitialFallback: true,
      });
    }
  }
  const normalizedAccountEnvironmentPatch = toAccountEnvironmentPatch(
    normalizedAccountEnvironment,
  );
  const nextHistoryRange =
    (version ?? 0) < 11 &&
    state.historyRange === 'Last 6 months' &&
    state.historyFromMs == null &&
    state.historyToMs == null
      ? 'All time'
      : asString(state.historyRange, 'All time');
  const hasPersistedChartColors = Object.keys(asRecord(state.chartColors)).length > 0;
  const persistedChartColorScheme = isChartColorScheme(state.chartColorScheme)
    ? state.chartColorScheme
    : undefined;
  const shouldUseDefaultChartColorScheme =
    (!persistedChartColorScheme && (!hasPersistedChartColors || isLegacyBlueDefaultChartColors(state.chartColors))) ||
    (persistedChartColorScheme === 'custom' && isLegacyBlueDefaultChartColors(state.chartColors));
  const nextChartColorScheme = shouldUseDefaultChartColorScheme
    ? DEFAULT_CHART_COLOR_SCHEME
    : persistedChartColorScheme ?? 'custom';
  const nextChartColors = nextChartColorScheme === 'custom'
    ? normalizeChartColors(state.chartColors)
    : buildChartColorsForScheme(nextChartColorScheme);
  const nextChartDisplay = normalizeChartDisplay(state.chartDisplay);
  const persistedChartDisplay = asRecord(state.chartDisplay);
  if (
    typeof persistedChartDisplay.showTradeHistory !== 'boolean'
    && typeof legacyShowOnChartState.showClosedPositions === 'boolean'
  ) {
    // Older builds stored this preference as showClosedPositions. Preserve
    // the user's choice when migrating to the clearer Show trade history row.
    nextChartDisplay.showTradeHistory = legacyShowOnChartState.showClosedPositions;
  }

  return {
    themeMode: isThemeMode(state.themeMode) ? state.themeMode : 'dark',
    quoteSymbols: asStringArray(state.quoteSymbols),
    quoteViewMode: isQuoteViewMode(state.quoteViewMode) ? state.quoteViewMode : 'list',
    chartSymbol,
    chartTimeframe: normalizeCandleHistoryTimeframe(state.chartTimeframe),
    tradeVolume: normalizeTradeVolume(state.tradeVolume ?? DEFAULT_TRADE_VOLUME),
    chartTradeVolumeDisplayMode: isChartTradeVolumeDisplayMode(state.chartTradeVolumeDisplayMode)
      ? state.chartTradeVolumeDisplayMode
      : 'lots',
    chartVisualType: normalizeChartVisualType(state.chartVisualType),
    chartViewportShowVolumePane: asBoolean(state.chartViewportShowVolumePane, false),
    chartViewportShowDrawingToolbar: asBoolean(state.chartViewportShowDrawingToolbar, false),
    chartOneClickPanelAtBottom: asBoolean(state.chartOneClickPanelAtBottom, true),
    chartVerticalScrollingLocked: asBoolean(state.chartVerticalScrollingLocked, false),
    chartAutoScaleEnabled: asBoolean(state.chartAutoScaleEnabled, false),
    chartDrawings: activeDrawingLabels.length > 0 ? activeDrawingLabels : asStringArray(state.chartDrawings),
    chartDrawingRecordsBySymbol: nextDrawingRecordsBySymbol,
    chartLockAll: asBoolean(state.chartLockAll, false),
    chartHideAll: asBoolean(state.chartHideAll, false),
    chartShowOnChart: nextChartShowOnChart,
    historySummaryDetailsVisible:
      typeof state.historySummaryDetailsVisible === 'boolean'
        ? state.historySummaryDetailsVisible
        : typeof state.tradeSummaryDetailsVisible === 'boolean'
          ? state.tradeSummaryDetailsVisible
          : true,
    tradeSummaryDetailsVisible: asBoolean(state.tradeSummaryDetailsVisible, true),
    priceSource: isPriceSource(state.priceSource) ? state.priceSource : 'bid',
    openOrderMode: isOpenOrderMode(state.openOrderMode) ? state.openOrderMode : 'Regular',
    // One-click trading is the product default. An explicitly persisted false
    // still wins, so a user who turns it off keeps the Order Ticket flow after
    // every restart.
    oneClickAccepted: asBoolean(state.oneClickAccepted, true),
    historyRange: nextHistoryRange,
    historyFromMs: asFiniteNumber(state.historyFromMs, null),
    historyToMs: asFiniteNumber(state.historyToMs, null),
    ...normalizedAccountEnvironmentPatch,
    isLoggedIn,
    hasSetInitialSymbols: asBoolean(state.hasSetInitialSymbols, false),
    brokerId,
    brokerServerUrl,
    brokerLogoUrl: asString(state.brokerLogoUrl),
    accountDetails,
    chartColorScheme: nextChartColorScheme,
    chartColors: nextChartColors,
    chartDisplay: nextChartDisplay,
    language: normalizeLanguageCode(state.language),
  };
}

function flushPendingPreferenceWrites() {
  preferenceWriteFlushScheduled = false;
  if (preferenceWriteFlushFallbackTimer !== null) {
    clearTimeout(preferenceWriteFlushFallbackTimer);
    preferenceWriteFlushFallbackTimer = null;
  }
  const writes = Array.from(pendingPreferenceWrites.entries());
  pendingPreferenceWrites.clear();
  if (writes.length === 0) {
    return preferenceWriteQueue;
  }

  const persistWrites = async (): Promise<void> => {
    for (const [name, value] of writes) {
      // Deep auth redaction and serialization stay off the interaction frame.
      // `partializeUserPreferences` already omits runtime credentials, and this
      // final sanitizer still guarantees that only a clean envelope reaches disk.
      const sanitized = sanitizePreferenceAuthStorageValue(value).sanitizedStorageValue;
      await AsyncStorage.setItem(name, JSON.stringify(sanitized));
    }
  };

  const operation = preferenceWriteQueue.then(async () => {
    try {
      await persistWrites();
    } catch (error) {
      if (!isAsyncStorageCapacityError(error)) {
        throw error;
      }

      // Session namespaces are deliberately single-use. Reclaim only those
      // obsolete cache records, then retry the important preference write once.
      await pruneObsoleteSessionCaches();
      await persistWrites();
    }
  });
  preferenceWriteQueue = operation.catch(() => undefined);
  // Scheduled UI-preference writes remain non-blocking, but an explicit session
  // commit can await the same operation through flushUserPreferencesPersistence.
  void operation.catch((error) => {
    console.error('[UserPreferences] Failed to persist preferences', error);
  });
  return operation;
}

/** Waits until the current preference snapshot has reached AsyncStorage. */
export const flushUserPreferencesPersistence = (): Promise<void> =>
  flushPendingPreferenceWrites();

function schedulePreferenceWriteFlush() {
  if (preferenceWriteFlushScheduled) return;
  preferenceWriteFlushScheduled = true;

  const scheduleAfterFrame =
    typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame
      : (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16);

  scheduleAfterFrame(() => {
    if (preferenceWriteFlushScheduled) {
      setTimeout(flushPendingPreferenceWrites, 0);
    }
  });

  // requestAnimationFrame can pause as soon as the app backgrounds. Keep a
  // short timer fallback so a just-selected theme is not stranded in memory.
  preferenceWriteFlushFallbackTimer = setTimeout(flushPendingPreferenceWrites, 100);
}

const userPreferencesStorage: PersistStorage<PersistedUserPreferencesState, void> = {
  getItem: async (name) => {
    try {
      const value = await AsyncStorage.getItem(name);
      if (!value) return null;

      const parsed = JSON.parse(value) as StorageValue<PersistedUserPreferencesState>;
      const authSnapshot = sanitizePreferenceAuthStorageValue(parsed);
      let persistedStorageValue = authSnapshot.sanitizedStorageValue;
      let runtimeStorageValue = persistedStorageValue;

      if (
        authSnapshot.shouldRestoreAuthenticatedSession &&
        authSnapshot.accountIdentity &&
        authSnapshot.brokerId
      ) {
        const bundle = await migrateLegacyAuthSessionCredentials({
          brokerId: authSnapshot.brokerId,
          accountLogin: authSnapshot.accountIdentity.id,
          credentials: authSnapshot.legacyCredentials,
        }).catch(async (error) => {
          console.error('[UserPreferences] Secure auth restore failed closed', error);
          return null;
        });

        if (bundle) {
          runtimeStorageValue = injectRuntimeCredentials(
            persistedStorageValue,
            bundle,
            authSnapshot.accountIdentity,
          );
        } else {
          persistedStorageValue = failClosedPersistedAuthState(persistedStorageValue);
          runtimeStorageValue = persistedStorageValue;
        }
      } else {
        if (authSnapshot.shouldRestoreAuthenticatedSession || authSnapshot.legacyCredentials) {
          persistedStorageValue = failClosedPersistedAuthState(persistedStorageValue);
          runtimeStorageValue = persistedStorageValue;
        }
        // A SecureStore manifest + credential bundle is the cold-start session
        // authority. Missing/stale plain preferences must not erase it; the
        // broker session coordinator validates that secure pair after hydration.
      }

      if (
        authSnapshot.containedAuthSecrets ||
        JSON.stringify(persistedStorageValue) !== value
      ) {
        try {
          await AsyncStorage.setItem(name, JSON.stringify(persistedStorageValue));
        } catch (rewriteError) {
          // If a token-bearing legacy blob cannot be rewritten safely, remove
          // the whole preference blob rather than leave credentials in place.
          await AsyncStorage.removeItem(name).catch(() => undefined);
          throw rewriteError;
        }
      }

      return runtimeStorageValue as StorageValue<PersistedUserPreferencesState>;
    } catch (error) {
      console.error('[UserPreferences] Ignoring invalid persisted preferences', error);
      void AsyncStorage.removeItem(name).catch((removeError) => {
        console.error('[UserPreferences] Failed to clear invalid persisted preferences', removeError);
      });
      return null;
    }
  },
  setItem: (name, value) => {
    pendingPreferenceWrites.set(name, value);
    schedulePreferenceWriteFlush();
  },
  removeItem: (name) => {
    pendingPreferenceWrites.delete(name);
    void AsyncStorage.removeItem(name);
  },
};

function partializeUserPreferences(state: UserPreferencesState): PersistedUserPreferencesState {
  return {
    themeMode: state.themeMode,
    quoteSymbols: state.quoteSymbols,
    quoteViewMode: state.quoteViewMode,
    chartSymbol: state.chartSymbol,
    chartTimeframe: state.chartTimeframe,
    tradeVolume: state.tradeVolume,
    chartTradeVolumeDisplayMode: state.chartTradeVolumeDisplayMode,
    // Persist only the chosen visual type. Renko bricks and their ATR cache are
    // regenerated from canonical candles, so synthetic chart data never goes stale.
    chartVisualType: state.chartVisualType,
    chartViewportShowVolumePane: state.chartViewportShowVolumePane,
    chartViewportShowDrawingToolbar: state.chartViewportShowDrawingToolbar,
    chartOneClickPanelAtBottom: state.chartOneClickPanelAtBottom,
    chartVerticalScrollingLocked: state.chartVerticalScrollingLocked,
    chartAutoScaleEnabled: state.chartAutoScaleEnabled,
    chartDrawings: state.chartDrawings,
    chartDrawingRecordsBySymbol: state.chartDrawingRecordsBySymbol,
    chartLockAll: state.chartLockAll,
    chartHideAll: state.chartHideAll,
    chartShowOnChart: state.chartShowOnChart,
    historySummaryDetailsVisible: state.historySummaryDetailsVisible,
    tradeSummaryDetailsVisible: state.tradeSummaryDetailsVisible,
    priceSource: state.priceSource,
    openOrderMode: state.openOrderMode,
    oneClickAccepted: state.oneClickAccepted,
    historyRange: state.historyRange,
    historyFromMs: state.historyFromMs,
    historyToMs: state.historyToMs,
    accountType: state.accountType,
    accountEnvironmentSource: state.accountEnvironmentSource,
    accountEnvironmentKey: state.accountEnvironmentKey,
    isDemoAccount: state.isDemoAccount,
    isLoggedIn: state.isLoggedIn,
    hasSetInitialSymbols: state.hasSetInitialSymbols,
    brokerId: state.brokerId,
    brokerServerUrl: state.brokerServerUrl,
    brokerLogoUrl: state.brokerLogoUrl,
    accountDetails: state.accountDetails
      ? {
          id: state.accountDetails.id,
          name: state.accountDetails.name,
          server: state.accountDetails.server,
        }
      : null,
    chartColorScheme: state.chartColorScheme,
    chartColors: state.chartColors,
    chartDisplay: state.chartDisplay,
    language: state.language,
  };
}

export const useUserPreferences = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      themeMode: 'dark' as ThemeMode,
      quoteSymbols: defaultSymbols,
      quoteViewMode: 'list',
      chartSymbol: 'GBPUSD',
      chartTimeframe: 'M1',
      tradeVolume: DEFAULT_TRADE_VOLUME,
      chartTradeVolumeDisplayMode: 'lots',
      chartVisualType: 'candles',
      chartViewportShowVolumePane: false,
      chartViewportShowDrawingToolbar: false,
      chartOneClickPanelAtBottom: true,
      chartVerticalScrollingLocked: false,
      chartAutoScaleEnabled: false,
      chartDrawings: [],
      chartDrawingRecordsBySymbol: {},
      chartLockAll: false,
      chartHideAll: false,
      chartShowOnChart: { ...DEFAULT_CHART_SHOW_ON_CHART },
      historySummaryDetailsVisible: true,
      tradeSummaryDetailsVisible: true,
      priceSource: 'bid',
      openOrderMode: 'Regular',
      oneClickAccepted: true,
      historyRange: 'All time',
      historyFromMs: null,
      historyToMs: null,
      accountType: 'unknown',
      accountEnvironmentSource: 'unknown',
      accountEnvironmentKey: '',
      isDemoAccount: false,
      isLoggedIn: false,
      hasSetInitialSymbols: false,
      brokerId: '',
      brokerServerUrl: ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL,
      brokerLogoUrl: '',
      accountDetails: null,
      chartColorScheme: DEFAULT_CHART_COLOR_SCHEME,
      chartColors: buildChartColorsForScheme(DEFAULT_CHART_COLOR_SCHEME),
      chartDisplay: DEFAULT_CHART_DISPLAY_SETTINGS,
      language: 'en' as LanguageCode,
      setLanguage: (lang) => set({ language: normalizeLanguageCode(lang) }),
      login: (id, name, server, tokens, brokerId, brokerConnection) =>
        set((state) => {
          const nextBrokerId = brokerId || state.brokerId || '';
          const sameBroker =
            normalizeBrokerConnectionId(state.brokerId) === normalizeBrokerConnectionId(nextBrokerId);
          const nextServerUrl = brokerConnection?.serverUrl || (sameBroker ? state.brokerServerUrl : '') || '';
          const nextLogoUrl = brokerConnection?.logoUrl || (sameBroker ? state.brokerLogoUrl : '') || '';
          const accountEnvironment = mergeAccountEnvironment(null, {
            accountKey: buildAccountEnvironmentKey(nextBrokerId, id),
            resolved: brokerConnection?.accountType ?? 'unknown',
            source: brokerConnection?.accountEnvironmentSource ?? 'unknown',
            allowInitialFallback: true,
          });
          return {
            isLoggedIn: true,
            ...toAccountEnvironmentPatch(accountEnvironment),
            // Persist brokerId atomically with login to prevent race conditions.
            // Falls back to existing brokerId if not provided (e.g., for register flow).
            brokerId: nextBrokerId,
            brokerServerUrl: nextServerUrl,
            brokerLogoUrl: nextLogoUrl,
            accountDetails: {
              id,
              name,
              server,
              credentials: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: tokens.expires_at,
              },
            },
          };
        }),
      logout: () => {
        // Preserve the broker selection for a convenient next login. Public
        // Quotes and Chart remain active for every logged-out selection.
        set({
          isLoggedIn: false,
          accountDetails: null,
          accountType: 'unknown',
          accountEnvironmentSource: 'unknown',
          accountEnvironmentKey: '',
          isDemoAccount: false,
          quoteSymbols: [],
          hasSetInitialSymbols: false,
        });
      },
      updateTokens: (accessToken, refreshToken, expiresAt) =>
        set((state) => {
          if (!state.accountDetails) return state;
          return {
            accountDetails: {
              ...state.accountDetails,
              credentials: {
                accessToken,
                refreshToken,
                expiresAt,
              },
            },
          };
        }),
      setQuoteViewMode: (mode) => set({ quoteViewMode: mode }),
      setThemeMode: (mode) => {
        // Advance the lightweight visual clock before mirroring the durable
        // preference. Storage sanitizing and serialization remain deferred.
        setImmediateThemeMode(mode);
        if (get().themeMode !== mode) {
          set({ themeMode: mode });
        }
      },
      addQuoteSymbol: (symbol) => {
        const current = get().quoteSymbols;
        if (!current.includes(symbol)) {
          set({ quoteSymbols: [...current, symbol] });
        }
      },
      removeQuoteSymbol: (symbol) => {
        set({ quoteSymbols: get().quoteSymbols.filter((item) => item !== symbol) });
      },
      setQuoteSymbols: (symbols) => set({ quoteSymbols: symbols }),
      setChartSymbol: (symbol) =>
        set((state) => {
          const nextKey = getChartDrawingBucketKey(symbol);
          const nextDrawings = state.chartDrawingRecordsBySymbol[nextKey] ?? [];
          return {
            chartSymbol: symbol,
            chartDrawings: getChartDrawingLabels(nextDrawings),
          };
        }),
      setChartTimeframe: (timeframe) => set({ chartTimeframe: normalizeCandleHistoryTimeframe(timeframe) }),
      setTradeVolume: (volume) => {
        // The caller (ChartScreen) already normalizes against the active
        // instrument's bounds (min/max/stepVolume). Re-normalizing here
        // with default bounds (step = 0.01) would silently override
        // instrument-specific step rounding for symbols whose step isn't
        // 0.01 — e.g., a value the caller intended as "1.5 lots on a
        // step=0.5 instrument" stays 1.5, but if the caller passed a
        // raw user input like "0.001" we still need a finite-number
        // safety net. Just clamp to a positive finite number.
        const next = typeof volume === 'number' && Number.isFinite(volume) && volume > 0
          ? volume
          : normalizeTradeVolume(volume);
        set({ tradeVolume: next });
      },
      setChartTradeVolumeDisplayMode: (mode) => set({ chartTradeVolumeDisplayMode: mode }),
      setChartVisualType: (chartType) => set({ chartVisualType: normalizeChartVisualType(chartType) }),
      setChartViewportShowVolumePane: (visible) => set({ chartViewportShowVolumePane: visible }),
      setChartViewportShowDrawingToolbar: (visible) => set({ chartViewportShowDrawingToolbar: visible }),
      setChartOneClickPanelAtBottom: (visible) => set({ chartOneClickPanelAtBottom: visible }),
      setChartVerticalScrollingLocked: (locked) => set({ chartVerticalScrollingLocked: locked }),
      setChartAutoScaleEnabled: (enabled) => set({ chartAutoScaleEnabled: enabled }),
      addChartDrawing: (drawing) => {
        const list = get().chartDrawings;
        set({ chartDrawings: [...list, drawing] });
      },
      removeChartDrawing: (drawing) => {
        set({ chartDrawings: get().chartDrawings.filter((item) => item !== drawing) });
      },
      setChartDrawings: (drawings) => set({ chartDrawings: drawings }),
      setChartDrawingRecordsForSymbol: (symbol, drawings) =>
        set((state) => {
          const bucketKey = getChartDrawingBucketKey(symbol);
          const nextDrawings = sanitizePersistedChartDrawings(drawings);
          const nextRecordsBySymbol: PersistedChartDrawingsBySymbol = {
            ...state.chartDrawingRecordsBySymbol,
            [bucketKey]: nextDrawings,
          };
          persistChartDrawingRecordsBySymbol(nextRecordsBySymbol);

          return {
            chartDrawingRecordsBySymbol: nextRecordsBySymbol,
            chartDrawings: getChartDrawingBucketKey(state.chartSymbol) === bucketKey
              ? getChartDrawingLabels(nextDrawings)
              : state.chartDrawings,
          };
        }),
      removeChartDrawingRecordForSymbol: (symbol, drawingId) =>
        set((state) => {
          const bucketKey = getChartDrawingBucketKey(symbol);
          const currentDrawings = state.chartDrawingRecordsBySymbol[bucketKey] ?? [];
          const nextDrawings = currentDrawings.filter((drawing) => drawing.id !== drawingId);
          const nextRecordsBySymbol: PersistedChartDrawingsBySymbol = {
            ...state.chartDrawingRecordsBySymbol,
            [bucketKey]: nextDrawings,
          };
          persistChartDrawingRecordsBySymbol(nextRecordsBySymbol);

          return {
            chartDrawingRecordsBySymbol: nextRecordsBySymbol,
            chartDrawings: getChartDrawingBucketKey(state.chartSymbol) === bucketKey
              ? getChartDrawingLabels(nextDrawings)
              : state.chartDrawings,
          };
        }),
      setChartLockAll: (lock) => set({ chartLockAll: lock }),
      setChartHideAll: (hide) => set({ chartHideAll: hide }),
      setChartShowOnChartItem: (key, value) =>
        set((state) => ({
          chartShowOnChart: {
            ...state.chartShowOnChart,
            [key]: value,
          },
        })),
      setHistorySummaryDetailsVisible: (visible) => set({ historySummaryDetailsVisible: visible }),
      setTradeSummaryDetailsVisible: (visible) => set({ tradeSummaryDetailsVisible: visible }),
      setPriceSource: (source) => set({ priceSource: source }),
      setOpenOrderMode: (mode) => set({ openOrderMode: mode }),
      setOneClickAccepted: (accepted) => set({ oneClickAccepted: accepted }),
      setHistoryRange: (range) => set({ historyRange: range }),
      setHistoryDateRange: (fromMs, toMs) => set({ historyFromMs: fromMs, historyToMs: toMs }),
      mergeAccountEnvironmentForAccount: (accountKey, resolved, source) =>
        set((state) => {
          const currentAccountKey = state.isLoggedIn && state.accountDetails?.id && state.brokerId
            ? buildAccountEnvironmentKey(state.brokerId, state.accountDetails.id)
            : '';
          if (
            !accountKey
            || accountKey !== currentAccountKey
            || state.accountEnvironmentKey !== currentAccountKey
          ) {
            return state;
          }

          const merged = mergeAccountEnvironment(
            readCurrentAccountEnvironment(state),
            {
              accountKey,
              resolved,
              source,
              allowInitialFallback: false,
            },
          );
          return merged
            ? toAccountEnvironmentPatch(merged)
            : state;
        }),
      setBrokerId: (id) =>
        set((state) => state.isLoggedIn ? state : { brokerId: id }),
      setBrokerConnection: (brokerId, serverUrl = '', logoUrl = '') =>
        set((state) => {
          if (state.isLoggedIn) {
            return state;
          }
          const sameBroker =
            normalizeBrokerConnectionId(state.brokerId) === normalizeBrokerConnectionId(brokerId);
          return {
            brokerId,
            brokerServerUrl: serverUrl || (sameBroker ? state.brokerServerUrl : '') || '',
            brokerLogoUrl: logoUrl || (sameBroker ? state.brokerLogoUrl : '') || '',
          };
        }),
      setHasSetInitialSymbols: (hasSet) => set({ hasSetInitialSymbols: hasSet }),
      setChartColorScheme: (scheme) =>
        set(() => {
          if (scheme === 'custom') {
            return { chartColorScheme: scheme };
          }

          return {
            chartColorScheme: scheme,
            chartColors: buildChartColorsForScheme(scheme),
          };
        }),
      setChartColor: (key, color) =>
        set((state) => ({
          chartColorScheme: 'custom',
          chartColors: { ...state.chartColors, [key]: color },
        })),
      setChartDisplaySetting: (key, value) =>
        set((state) => ({
          chartDisplay: { ...state.chartDisplay, [key]: value },
        })),
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
      updateAccountDetails: (updates) =>
        set((state) => {
          if (!state.accountDetails) return state;
          return {
            accountDetails: {
              ...state.accountDetails,
              ...updates,
              credentials: updates.credentials ?? state.accountDetails.credentials,
            },
          };
        }),
    }),
    {
      name: 'rtx5-user-preferences-v2',
      version: PREFERENCES_STORAGE_VERSION,
      storage: userPreferencesStorage,
      partialize: partializeUserPreferences,
      migrate: (persistedState, version) => normalizePersistedUserPreferencesState(persistedState, version),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedUserPreferencesState(persistedState),
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[UserPreferences] Failed to rehydrate persisted preferences', error);
        }
        if (state?.themeMode) {
          setImmediateThemeMode(state.themeMode, { deferRetained: false });
        }
        const drawingsBeforeRead = state?.chartDrawingRecordsBySymbol ?? {};
        void readChartDrawingRecordsBySymbol()
          .then((storedRecordsBySymbol) => {
            if (!state) return;
            // The disk reader already sanitized every record. Publish the
            // restored map and readiness atomically; per-symbol edit actions
            // would repeatedly serialize/write the entire map during startup.
            useUserPreferences.setState(current => completeChartDrawingHydration(
              current, drawingsBeforeRead, storedRecordsBySymbol,
            ));
          })
          .catch((restoreError) => {
            console.error('[UserPreferences] Failed to restore chart drawing state', restoreError);
            state?.setHasHydrated(true);
          });
      },
    }
  )
);
