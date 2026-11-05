import { useEffect, useMemo, useRef } from 'react';
import { normalizeSymbol } from '../../domain/symbols';
import { normalizeTimeframeStrict } from '../../domain/candles/core/timeframeUtils';
import { resolveAreaChartVisibleBarTarget } from './areaChartHistoryPolicy';

type UseAreaChartHistoryExpansionInput = Readonly<{
  active: boolean;
  chartType: string;
  symbol: string;
  timeframe: string;
  cacheScopeKey: string;
  candleCount: number;
  hasHistoryCandles: boolean;
  historyLoading: boolean;
  paginate: () => void;
  renderLimit?: number | null;
}>;

const MAX_AREA_HISTORY_EXPANSION_ATTEMPTS = 2;

/**
 * Expands an untouched Area context once, after its lightweight first history
 * paint. paginate() always prepends exact backend candles and is already
 * bounded/deduplicated by the shared candle engine (and public-demo query).
 */
export function useAreaChartHistoryExpansion(
  input: UseAreaChartHistoryExpansionInput,
): number {
  const visibleBarTarget = useMemo(
    () => resolveAreaChartVisibleBarTarget(input.timeframe, input.renderLimit),
    [input.renderLimit, input.timeframe],
  );
  const expansionAttemptRef = useRef({
    contextKey: '',
    attempts: 0,
    candleCount: -1,
  });

  useEffect(() => {
    if (!input.active || input.chartType !== 'area') {
      expansionAttemptRef.current = {
        contextKey: '',
        attempts: 0,
        candleCount: -1,
      };
      return;
    }

    if (
      input.historyLoading
      || !input.hasHistoryCandles
      || input.candleCount >= visibleBarTarget
    ) {
      return;
    }

    const symbol = normalizeSymbol(input.symbol);
    const timeframe = normalizeTimeframeStrict(input.timeframe);
    if (!symbol || !timeframe) {
      return;
    }

    const contextKey = [
      input.cacheScopeKey,
      symbol,
      timeframe,
      visibleBarTarget,
    ].join(':');
    const previousAttempt = expansionAttemptRef.current;
    const nextAttempt = previousAttempt.contextKey === contextKey
      ? previousAttempt
      : { contextKey, attempts: 0, candleCount: -1 };
    if (
      nextAttempt.attempts >= MAX_AREA_HISTORY_EXPANSION_ATTEMPTS
      || input.candleCount <= nextAttempt.candleCount
    ) {
      return;
    }

    // The first call may only reveal deeper retained cache. Permit one second
    // call if that reveal increased the candle count but still missed the
    // target; it can then fetch the established 500-candle network page.
    expansionAttemptRef.current = {
      contextKey,
      attempts: nextAttempt.attempts + 1,
      candleCount: input.candleCount,
    };
    input.paginate();
  }, [
    input.active,
    input.cacheScopeKey,
    input.candleCount,
    input.chartType,
    input.hasHistoryCandles,
    input.historyLoading,
    input.paginate,
    input.symbol,
    input.timeframe,
    visibleBarTarget,
  ]);

  return visibleBarTarget;
}
