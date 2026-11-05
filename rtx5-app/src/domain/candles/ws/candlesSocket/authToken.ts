import { captureActiveBrokerSession } from '../../../../state/activeBrokerSession';
import { normalizeSymbol, normalizeTimeframeStrict } from '../../core/candles';

/**
 * Safely extracts the user's current JWT access token from the Zustand preferences store.
 * Returns null if the user is a guest or the token is unavailable.
 */
export const getStoredAccessToken = (): string | null => {
  try {
    return captureActiveBrokerSession()?.credentials.accessToken ?? null;
  } catch {
    return null;
  }
};

/**
 * Generates a unique, deterministic string identifier for a given market symbol and timeframe.
 * Used internally by the WebSocket service to deduplicate active subscriptions.
 */
export const createSubscriptionKey = (symbol: string, tf: string): string => {
  const normalizedTimeframe = normalizeTimeframeStrict(tf);
  return `${normalizeSymbol(symbol)}::${normalizedTimeframe ?? ''}`;
};
