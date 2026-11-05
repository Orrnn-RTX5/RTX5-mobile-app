import type { LiveQuoteSnapshot } from './liveQuoteSnapshot';

export type QuoteSnapshotDisplayScope = Readonly<{
  sessionKey: string;
  credentialKey: string;
}>;

/** Preserve the last real prices without renewing their execution eligibility. */
export const markQuoteSnapshotUnavailable = (
  quote: LiveQuoteSnapshot | undefined,
): LiveQuoteSnapshot | undefined => quote && ({
  ...quote,
  stale: true,
  tradable: false,
  degraded: true,
});

/**
 * Memory-only continuity for an in-place token rotation. Account, broker, and
 * activation changes use another session key and can never reuse these prices.
 */
export class QuoteSnapshotContinuity {
  private sessionKey = '';
  private snapshots = new Map<string, {
    credentialKey: string;
    quote: LiveQuoteSnapshot;
  }>();

  private selectSession(scope: QuoteSnapshotDisplayScope): boolean {
    if (this.sessionKey !== scope.sessionKey) {
      this.clear();
      this.sessionKey = scope.sessionKey;
    }
    return Boolean(scope.sessionKey && scope.credentialKey);
  }

  retain(scope: QuoteSnapshotDisplayScope, symbol: string, quote: LiveQuoteSnapshot | undefined): void {
    if (!this.selectSession(scope) || !quote ||
      typeof quote.bid !== 'number' || !Number.isFinite(quote.bid) || quote.bid <= 0 ||
      typeof quote.ask !== 'number' || !Number.isFinite(quote.ask) || quote.ask < quote.bid) {
      return;
    }
    this.snapshots.set(symbol, { credentialKey: scope.credentialKey, quote });
  }

  read(scope: QuoteSnapshotDisplayScope, symbol: string): LiveQuoteSnapshot | undefined {
    if (!this.selectSession(scope)) return undefined;
    const retained = this.snapshots.get(symbol);
    if (!retained) return undefined;
    return retained.credentialKey === scope.credentialKey
      ? retained.quote
      : markQuoteSnapshotUnavailable(retained.quote);
  }

  clear(): void {
    this.sessionKey = '';
    this.snapshots.clear();
  }
}
