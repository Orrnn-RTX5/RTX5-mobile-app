import {
  getMarketDataOperationalMetricsSnapshot,
  getMarketDataTelemetrySnapshot,
} from './marketDataTelemetry';
import { getQuoteLatencyMetricsSnapshot } from './quoteLatencyMetrics';

/**
 * Redacted, in-memory support snapshot. It deliberately contains no tokens,
 * URLs with query values, account payloads, or persisted device identifiers.
 */
export const getMarketDataSupportSnapshot = () => Object.freeze({
  generatedAt: Date.now(),
  latency: getQuoteLatencyMetricsSnapshot(),
  operational: getMarketDataOperationalMetricsSnapshot(),
  events: getMarketDataTelemetrySnapshot(),
});
