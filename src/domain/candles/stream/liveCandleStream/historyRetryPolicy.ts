/**
 * Auto-retry policy for a failed (or empty) INITIAL history load.
 *
 * The broker REST `/candles` endpoint is intermittently flaky (multi-second
 * timeouts / transient errors), and on a cold app open the device network can
 * stay unreliable for longer than any short backoff window. Without a retry, a
 * failed fetch leaves the stream entry permanently history-less; the chart then
 * shows only live quote-fed candles (or stays blank) until the user manually
 * switches symbol/timeframe — which is the only thing that mints a fresh entry
 * and re-attempts the fetch.
 *
 * The schedule is a short, fast backoff followed by an unbounded steady-state
 * cadence: the initial load gets quick second chances, and after that the entry
 * keeps re-trying at a slow fixed interval for as long as the chart stays
 * subscribed with no history. This cannot leak or run away: the timer lives on
 * the stream entry and `disposeEntry` clears it the moment the last subscriber
 * leaves, and any successful load stops the loop by filling `historyCandles`.
 *
 * Kept in its own dependency-free module so the backoff logic stays unit
 * testable (the parent historyFetching module transitively imports react-native
 * via the REST client and cannot load under the test transformer).
 */
export const HISTORY_FAILURE_RETRY_BACKOFF_MS = [1000, 3000, 7000];

/** Steady-state retry cadence once the fast backoff ramp is exhausted. */
export const HISTORY_RETRY_STEADY_INTERVAL_MS = 15000;

export type HistoryRetryPlan = {
  shouldRetry: boolean;
  delayMs: number;
  nextAttempt: number;
};

/**
 * Pure decision for whether a just-failed history load should be auto-retried,
 * and after how long. Only the INITIAL window (non-paginated) is retried, and
 * only while no history has arrived. Retries never stop on their own — they
 * simply slow down to the steady interval after the fast ramp.
 */
export const computeHistoryRetryPlan = (
  entry: { historyCandles: readonly unknown[]; historyRetryAttempt: number },
  isPaginationRequest: boolean,
): HistoryRetryPlan => {
  const attempt = entry.historyRetryAttempt;
  if (isPaginationRequest || entry.historyCandles.length > 0) {
    return { shouldRetry: false, delayMs: 0, nextAttempt: attempt };
  }
  const delayMs =
    attempt < HISTORY_FAILURE_RETRY_BACKOFF_MS.length
      ? HISTORY_FAILURE_RETRY_BACKOFF_MS[attempt]
      : HISTORY_RETRY_STEADY_INTERVAL_MS;
  return {
    shouldRetry: true,
    delayMs,
    nextAttempt: attempt + 1,
  };
};
