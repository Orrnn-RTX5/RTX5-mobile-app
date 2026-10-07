export type MinimalEngineCandle = {
  time: number;
};

export type ActiveCandleSourceMode = 'quote' | 'server';

const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);

const isTruthyEnv = (value: unknown): boolean =>
  typeof value === 'string' && TRUE_ENV_VALUES.has(value.trim().toLowerCase());

export const getActiveCandleSourceMode = (): ActiveCandleSourceMode => {
  const requestedMode = String(process.env.EXPO_PUBLIC_CANDLE_SOURCE_MODE ?? '')
    .trim()
    .toLowerCase();
  const quoteModeRequested =
    requestedMode === 'quote' ||
    requestedMode === 'quotes' ||
    isTruthyEnv(process.env.EXPO_PUBLIC_DISABLE_SERVER_CANDLE_STREAMS);
  if (quoteModeRequested) {
    return 'quote';
  }

  const serverModeRequested =
    requestedMode === 'server' ||
    requestedMode === 'broker' ||
    isTruthyEnv(process.env.EXPO_PUBLIC_ENABLE_SERVER_CANDLE_STREAMS);
  const serverContractProven = isTruthyEnv(
    process.env.EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE,
  );

  // V2 is deliberately fail-closed: quotes build the active candle unless a
  // release explicitly requests server candles and records that the broker
  // candle contract has been proven compatible.
  return serverModeRequested && serverContractProven ? 'server' : 'quote';
};

export const shouldUseServerCandleStream = (): boolean =>
  getActiveCandleSourceMode() === 'server';

export const shouldRouteBackendCandlePayloads = shouldUseServerCandleStream;

const areSeriesStructurallyEqual = (
  currentCandles: MinimalEngineCandle[],
  cachedCandles: MinimalEngineCandle[],
): boolean => {
  if (currentCandles === cachedCandles) {
    return true;
  }

  if (currentCandles.length !== cachedCandles.length) {
    return false;
  }

  for (let index = 0; index < currentCandles.length; index += 1) {
    if (currentCandles[index].time !== cachedCandles[index].time) {
      return false;
    }
  }

  return true;
};

export const shouldRenderBootstrapPreview = (
  _historyCandlesLength: number,
  _visibleCandlesLength: number,
): boolean => false;

/**
 * Determines whether the stream manager should replace its currently active series 
 * with a series loaded from the local storage cache. 
 * Allows the UI to render immediately on boot while fetching fresh REST history in the background.
 */
export const shouldAdoptCachedSeries = (
  status: 'idle' | 'bootstrapping' | 'ready',
  historyCandlesLength: number,
  currentCandles: MinimalEngineCandle[],
  cachedCandles: MinimalEngineCandle[],
): boolean => {
  if (cachedCandles.length === 0 || areSeriesStructurallyEqual(currentCandles, cachedCandles)) {
    return false;
  }

  const cachedLastTime = cachedCandles[cachedCandles.length - 1]?.time ?? 0;
  const liveLastTime = currentCandles[currentCandles.length - 1]?.time ?? 0;

  return (
    currentCandles.length === 0 ||
    status !== 'ready' ||
    historyCandlesLength === 0 ||
    cachedCandles.length > currentCandles.length ||
    cachedLastTime > liveLastTime
  );
};

/** Describes the current state of the chart data pipeline. */
export type VisibleSeriesMode = 'empty' | 'current' | 'history' | 'merged';

/**
 * Evaluates the available data sources (REST history vs Live WS stream) to determine 
 * how the final chart series should be constructed.
 */
export const resolveVisibleSeriesMode = (
  historyCandles: MinimalEngineCandle[],
  liveCandles: MinimalEngineCandle[],
  currentCandles: MinimalEngineCandle[],
  _timeframe: string,
): VisibleSeriesMode => {
  if (historyCandles.length === 0) {
    return liveCandles.length > 0 || currentCandles.length > 0 ? 'current' : 'empty';
  }

  if (liveCandles.length === 0) {
    return 'history';
  }

  return 'merged';
};

/**
 * Selects the most authoritative array of candles to display based on the current state.
 * Live data takes precedence if available, falling back to cached or historical data.
 */
export const resolveCurrentVisibleSeries = <TCandle extends MinimalEngineCandle>(
  historyCandles: readonly TCandle[],
  liveCandles: readonly TCandle[],
  currentCandles: readonly TCandle[],
): readonly TCandle[] => {
  if (liveCandles.length > 0) {
    return liveCandles;
  }

  if (currentCandles.length > 0) {
    return currentCandles;
  }

  if (historyCandles.length > 0) {
    return historyCandles;
  }

  return [];
};

export const shouldSyncVisibleSeriesCache = (
  visibleSeriesMode: VisibleSeriesMode,
  visibleCandles: MinimalEngineCandle[],
  _timeframe: string,
): boolean => {
  if (visibleSeriesMode === 'empty' || visibleCandles.length === 0) {
    return false;
  }

  return true;
};

export const shouldKeepBootstrappingOnHistoryFailure = (
  historyCandlesLength: number,
  visibleCandlesLength: number,
): boolean => historyCandlesLength === 0 && visibleCandlesLength === 0;
