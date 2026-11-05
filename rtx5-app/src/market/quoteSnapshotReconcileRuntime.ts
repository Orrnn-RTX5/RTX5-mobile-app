import type { ActiveBrokerSessionIdentity } from '../state/activeBrokerSession';

type QuoteSnapshotReconcileListener = (identity: ActiveBrokerSessionIdentity) => void;

const listeners = new Set<QuoteSnapshotReconcileListener>();

/** Emitted after a validated socket has reconnected and restored its demand. */
export const requestQuoteSnapshotReconcile = (
  identity: ActiveBrokerSessionIdentity,
): void => {
  for (const listener of [...listeners]) {
    listener(identity);
  }
};

export const subscribeQuoteSnapshotReconcile = (
  listener: QuoteSnapshotReconcileListener,
): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const __resetQuoteSnapshotReconcileForTests = (): void => {
  listeners.clear();
};
