import type { QuoteTickEvent } from '../../api/ws/quoteTickNormalizer';
import { normalizeQuoteSymbolKey } from '../../domain/symbols';

export const QUOTE_LIVE_PROOF_MIN_TICKS = 3;
export const QUOTE_LIVE_PROOF_MIN_SPAN_MS = 3_000;
const QUOTE_LIVE_PROOF_MAX_FUTURE_SKEW_MS = 5_000;

export type QuoteLiveProofState = Readonly<{
  qualifyingTickCount: number;
  firstQualifyingTickAt: number;
  lastQualifyingTickAt: number;
  sustained: boolean;
}>;

export type QuoteLiveProofAdvanceResult = Readonly<{
  accepted: boolean;
  state: QuoteLiveProofState;
}>;

export const createQuoteLiveProofState = (): QuoteLiveProofState => Object.freeze({
  qualifyingTickCount: 0,
  firstQualifyingTickAt: 0,
  lastQualifyingTickAt: 0,
  sustained: false,
});

const isFinitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isRequestedSymbol = (
  tick: QuoteTickEvent,
  requestedSymbols: ReadonlySet<string>,
): boolean => {
  const candidates = [tick.rawSymbol, tick.symbol]
    .map((symbol) => normalizeQuoteSymbolKey(String(symbol ?? '')))
    .filter(Boolean);
  return candidates.some((symbol) => requestedSymbols.has(symbol));
};

const hasFreshServerTimestamp = (
  feedTickAt: number,
  receivedAt: number,
  staleAfterMs: number,
): boolean => {
  const ageMs = receivedAt - feedTickAt;
  return (
    Number.isFinite(staleAfterMs) &&
    staleAfterMs > 0 &&
    ageMs >= -QUOTE_LIVE_PROOF_MAX_FUTURE_SKEW_MS &&
    ageMs <= staleAfterMs
  );
};

/**
 * Tracks the narrow proof used by the Quotes Speed/LIVE indicator.
 *
 * The transport has already fenced the callback by broker/account/credential
 * owner. This final UI gate additionally requires a requested symbol, a valid
 * bid/ask pair, and a real server timestamp (`feedTickAt`). Client receive-time
 * fallback ticks can still support the existing quote/candle compatibility
 * paths, but they cannot claim a live feed in the Quotes header.
 */
export const advanceQuoteLiveProof = (
  previous: QuoteLiveProofState,
  tick: QuoteTickEvent,
  requestedSymbols: ReadonlySet<string>,
  staleAfterMs: number,
): QuoteLiveProofAdvanceResult => {
  if (
    tick.transport !== 'websocket' ||
    !isRequestedSymbol(tick, requestedSymbols) ||
    !isFinitePositive(tick.bid) ||
    !isFinitePositive(tick.ask) ||
    tick.ask < tick.bid ||
    !isFinitePositive(tick.feedTickAt) ||
    !isFinitePositive(tick.receivedAt) ||
    !hasFreshServerTimestamp(tick.feedTickAt, tick.receivedAt, staleAfterMs) ||
    tick.stale === true ||
    tick.degraded === true
  ) {
    return Object.freeze({ accepted: false, state: previous });
  }

  const resetForGap =
    previous.lastQualifyingTickAt > 0 &&
    (
      tick.receivedAt < previous.lastQualifyingTickAt ||
      tick.receivedAt - previous.lastQualifyingTickAt > staleAfterMs
    );
  const base = resetForGap ? createQuoteLiveProofState() : previous;
  const firstQualifyingTickAt =
    base.firstQualifyingTickAt > 0
      ? base.firstQualifyingTickAt
      : tick.receivedAt;
  const qualifyingTickCount = Math.min(
    QUOTE_LIVE_PROOF_MIN_TICKS,
    base.qualifyingTickCount + 1,
  );
  const sustained =
    base.sustained ||
    (
      qualifyingTickCount >= QUOTE_LIVE_PROOF_MIN_TICKS &&
      tick.receivedAt - firstQualifyingTickAt >= QUOTE_LIVE_PROOF_MIN_SPAN_MS
    );

  return Object.freeze({
    accepted: true,
    state: Object.freeze({
      qualifyingTickCount,
      firstQualifyingTickAt,
      lastQualifyingTickAt: tick.receivedAt,
      sustained,
    }),
  });
};

export const hasFreshSustainedQuoteLiveProof = (
  state: QuoteLiveProofState,
  now: number,
  staleAfterMs: number,
): boolean =>
  state.sustained &&
  Number.isFinite(now) &&
  now >= state.lastQualifyingTickAt &&
  now - state.lastQualifyingTickAt <= staleAfterMs;

/**
 * Public demo quotes are display-only and already passed the strict frame
 * validator above. One fresh accepted WebSocket tick is sufficient to show
 * anonymous users that prices are live; authenticated execution health keeps
 * the stronger sustained three-second proof.
 */
export const hasFreshAcceptedQuoteLiveProof = (
  state: QuoteLiveProofState,
  now: number,
  staleAfterMs: number,
): boolean =>
  state.qualifyingTickCount > 0 &&
  Number.isFinite(now) &&
  now >= state.lastQualifyingTickAt &&
  now - state.lastQualifyingTickAt <= staleAfterMs;
