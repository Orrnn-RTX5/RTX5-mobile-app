import {
  normalizePriceDigits,
  resolveDecimalsFromPriceValue,
  resolveDecimalsFromPriceStep,
} from '../../utils/pricePrecision';

const DEFAULT_CHART_DISPLAY_DECIMALS = 2;
const OVER_PRECISE_METADATA_DECIMALS = 8;
const OVER_PRECISE_DECIMAL_GAP = 2;

export type ChartDisplayDecimalInput = {
  instrumentDigits?: unknown;
  instrumentPoint?: unknown;
  instrumentTickSize?: unknown;
  liveQuoteDigits?: unknown;
  liveQuoteDigitsFromBackend?: boolean;
  liveQuotePoint?: unknown;
  liveQuoteTickSize?: unknown;
  liveQuoteBid?: unknown;
  liveQuoteAsk?: unknown;
  liveQuoteLast?: unknown;
  candlePrices?: unknown[];
};

export const normalizeChartDisplayDecimals = (digits: unknown): number | undefined => {
  return normalizePriceDigits(digits);
};

export const normalizeChartPriceStepDecimals = (step: unknown): number | undefined => {
  return resolveDecimalsFromPriceStep(step);
};

export const inferChartPriceDecimalsFromValues = (values: unknown[]): number | undefined => {
  const inferred = values
    .map((value) => resolveDecimalsFromPriceValue(value))
    .filter((value): value is number => value !== undefined);

  return inferred.length > 0 ? Math.max(...inferred) : undefined;
};

const reconcileMetadataDecimalsWithObservedPrices = (
  metadataDecimals: number | undefined,
  observedPriceDecimals: number | undefined,
): number | undefined => {
  if (metadataDecimals === undefined) {
    return undefined;
  }

  if (
    observedPriceDecimals !== undefined &&
    observedPriceDecimals >= DEFAULT_CHART_DISPLAY_DECIMALS &&
    metadataDecimals >= OVER_PRECISE_METADATA_DECIMALS &&
    metadataDecimals - observedPriceDecimals > OVER_PRECISE_DECIMAL_GAP
  ) {
    return observedPriceDecimals;
  }

  return metadataDecimals;
};

export const resolveChartDisplayDecimals = ({
  instrumentDigits,
  instrumentPoint,
  instrumentTickSize,
  liveQuoteDigits,
  liveQuoteDigitsFromBackend = false,
  liveQuotePoint,
  liveQuoteTickSize,
  liveQuoteBid,
  liveQuoteAsk,
  liveQuoteLast,
  candlePrices = [],
}: ChartDisplayDecimalInput): number => {
  const inferredPriceDecimals = inferChartPriceDecimalsFromValues([
    liveQuoteBid,
    liveQuoteAsk,
    liveQuoteLast,
    ...candlePrices,
  ]);

  const instrumentDecimals = reconcileMetadataDecimalsWithObservedPrices(
    normalizeChartDisplayDecimals(instrumentDigits),
    inferredPriceDecimals,
  );
  if (instrumentDecimals !== undefined) {
    return instrumentDecimals;
  }

  const instrumentPointDecimals = reconcileMetadataDecimalsWithObservedPrices(
    normalizeChartPriceStepDecimals(instrumentPoint),
    inferredPriceDecimals,
  );
  if (instrumentPointDecimals !== undefined) {
    return instrumentPointDecimals;
  }

  const instrumentTickSizeDecimals = reconcileMetadataDecimalsWithObservedPrices(
    normalizeChartPriceStepDecimals(instrumentTickSize),
    inferredPriceDecimals,
  );
  if (instrumentTickSizeDecimals !== undefined) {
    return instrumentTickSizeDecimals;
  }

  if (liveQuoteDigitsFromBackend) {
    const liveQuoteDecimals = reconcileMetadataDecimalsWithObservedPrices(
      normalizeChartDisplayDecimals(liveQuoteDigits),
      inferredPriceDecimals,
    );
    if (liveQuoteDecimals !== undefined) {
      return liveQuoteDecimals;
    }
  }

  const liveQuotePointDecimals = reconcileMetadataDecimalsWithObservedPrices(
    normalizeChartPriceStepDecimals(liveQuotePoint),
    inferredPriceDecimals,
  );
  if (liveQuotePointDecimals !== undefined) {
    return liveQuotePointDecimals;
  }

  const liveQuoteTickSizeDecimals = reconcileMetadataDecimalsWithObservedPrices(
    normalizeChartPriceStepDecimals(liveQuoteTickSize),
    inferredPriceDecimals,
  );
  if (liveQuoteTickSizeDecimals !== undefined) {
    return liveQuoteTickSizeDecimals;
  }

  if (inferredPriceDecimals !== undefined) {
    return inferredPriceDecimals;
  }

  const liveQuoteFallbackDecimals = normalizeChartDisplayDecimals(liveQuoteDigits);
  if (liveQuoteFallbackDecimals !== undefined) {
    return liveQuoteFallbackDecimals;
  }

  return DEFAULT_CHART_DISPLAY_DECIMALS;
};
