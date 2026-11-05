import { useEffect } from 'react';
import { getCandleHistory } from '../../domain/candles/api/candles';
import { CANDLE_HISTORY_TIMEFRAMES, getBucketGapCount, normalizeTimeframeStrict } from '../../domain/candles/core/timeframeUtils';
import type { CandleStreamEvent } from '../../domain/candles/core/candles';
import { getStoredAccessToken } from '../../domain/candles/ws/candlesSocket/authToken';
import { CandlesWebSocketService } from '../../domain/candles/ws/candlesSocket/CandlesWebSocketService';

const TEST_SYMBOLS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD'];
const ENABLE_DATA_ANALYZER_ENV = 'true';

/** Opt-in developer tool: requires a dev build AND the env flag, never runs in production. */
const isDataAnalyzerEnabled = () =>
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  process.env.EXPO_PUBLIC_ENABLE_DATA_ANALYZER === ENABLE_DATA_ANALYZER_ENV;

export function useDataAnalyzer() {
  useEffect(() => {
    if (!isDataAnalyzerEnabled()) {
      return;
    }

    const runAnalysis = async () => {
      const token = getStoredAccessToken();
      if (!token) {
        console.log('[DataAnalyzer] Waiting for user to log in...');
        return;
      }

      console.log('\n\n======================================================');
      console.log('[DataAnalyzer] Backend candle API analysis starting');
      console.log('======================================================\n');

      for (const symbol of TEST_SYMBOLS) {
        for (const tf of CANDLE_HISTORY_TIMEFRAMES) {
          if (tf === 'W1' || tf === 'MN') continue;

          const timeframe = normalizeTimeframeStrict(tf);
          if (!timeframe) continue;

          try {
            console.log(`Fetching REST History for ${symbol} ${timeframe}...`);
            const history = await getCandleHistory(symbol, timeframe, 1000);
            const candles = history.candles;

            if (candles.length === 0) {
              console.log(`[DataAnalyzer] ${symbol} ${timeframe}: 0 candles returned.`);
              continue;
            }

            let gapCount = 0;
            let maxGap = 0;
            let invalidOhlc = 0;

            for (let i = 0; i < candles.length - 1; i++) {
              const current = candles[i];
              const next = candles[i + 1];

              if (
                current.high < Math.max(current.open, current.close) ||
                current.low > Math.min(current.open, current.close)
              ) {
                invalidOhlc++;
              }

              const gaps = getBucketGapCount(current.time, next.time, timeframe);
              if (gaps > 1) {
                gapCount += gaps - 1;
                maxGap = Math.max(maxGap, gaps - 1);
              }
            }

            const lastCandle = candles[candles.length - 1];
            const nowSeconds = Math.floor(Date.now() / 1000);
            const ageSeconds = nowSeconds - lastCandle.time;
            const isForming = !((lastCandle as { closed?: boolean }).closed);

            console.log(`[DataAnalyzer] ${symbol} ${timeframe}: ${candles.length} candles.`);
            console.log(`   -> Missing Buckets (Gaps): ${gapCount} total gaps (Max contiguous gap: ${maxGap})`);
            console.log(`   -> Invalid OHLC Geometry: ${invalidOhlc}`);
            console.log(`   -> Last Candle Age: ${ageSeconds} seconds ago (Is forming? ${isForming})`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`[DataAnalyzer] Error fetching ${symbol} ${timeframe}: ${message}`);
          }
        }
      }

      console.log('\n======================================================');
      console.log('[DataAnalyzer] Backend candle API analysis complete');
      console.log('======================================================\n\n');

      console.log('\n[DataAnalyzer] Listening for WebSocket live candles...');
      const wsService = CandlesWebSocketService.getInstance();
      const wsListener = (event: CandleStreamEvent) => {
        if (event.type === 'replace_last' || event.type === 'append') {
          console.log(`[WS Live Candle] ${event.symbol} ${event.tf}:`, JSON.stringify(event.candle));
        }
      };
      wsService.addStreamListener(wsListener);

      setTimeout(() => {
        wsService.removeStreamListener(wsListener);
        console.log('\n[DataAnalyzer] Stopped WebSocket logging');
      }, 30_000);
    };

    const timer = setTimeout(runAnalysis, 5000);
    return () => clearTimeout(timer);
  }, []);
}
