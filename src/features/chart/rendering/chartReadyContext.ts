export type ChartReadyIdentity = {
  initSignature: string;
  configSig: string;
  dataContextSig: string;
};

export type CurrentChartIdentity = {
  configSig: string;
  dataContextSig: string;
  dataContextEpoch: number;
};

export type ChartDataPaintIdentity = {
  paintToken: string;
  dataContextSig: string;
};

const CHART_INIT_CONTEXT_EPOCH_PREFIX = 'context-epoch=';

export const buildChartInitSignature = (
  dataContextEpoch: number,
  snapshotSignature: string,
): string => {
  const normalizedEpoch = Number.isSafeInteger(dataContextEpoch) && dataContextEpoch >= 0
    ? dataContextEpoch
    : -1;
  return `${CHART_INIT_CONTEXT_EPOCH_PREFIX}${normalizedEpoch}|${snapshotSignature}`;
};

export const readChartInitContextEpoch = (initSignature: string): number => {
  const match = /^context-epoch=(\d+)\|/.exec(initSignature);
  if (!match) {
    return -1;
  }
  const epoch = Number(match[1]);
  return Number.isSafeInteger(epoch) ? epoch : -1;
};

/**
 * A WebView can finish painting an older candle snapshot after a newer live
 * tick has already been dispatched. That acknowledgement is still valid when
 * it belongs to the active symbol/timeframe, visual shell, and selection
 * epoch; the native host immediately synchronizes the newest retained snapshot
 * after accepting it. The epoch prevents a delayed A1 acknowledgement from
 * being reused after a rapid A -> B -> A2 switch.
 */
export const shouldAcceptChartReady = (
  ready: ChartReadyIdentity,
  current: CurrentChartIdentity,
  latestDispatch: CurrentChartIdentity,
): boolean => {
  const readyDataContextEpoch = readChartInitContextEpoch(ready.initSignature);
  return (
    ready.initSignature.length > 0 &&
    readyDataContextEpoch >= 0 &&
    ready.configSig === current.configSig &&
    ready.dataContextSig === current.dataContextSig &&
    readyDataContextEpoch === current.dataContextEpoch &&
    ready.configSig === latestDispatch.configSig &&
    ready.dataContextSig === latestDispatch.dataContextSig &&
    readyDataContextEpoch === latestDispatch.dataContextEpoch
  );
};

export const shouldAcceptChartDataPaint = (
  painted: ChartDataPaintIdentity,
  pending: ChartDataPaintIdentity,
  currentDataContextSig: string,
): boolean =>
  painted.paintToken.length > 0 &&
  painted.paintToken === pending.paintToken &&
  painted.dataContextSig === pending.dataContextSig &&
  painted.dataContextSig === currentDataContextSig;
