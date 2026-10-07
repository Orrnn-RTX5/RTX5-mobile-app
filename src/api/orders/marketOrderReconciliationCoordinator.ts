import type { PlaceOrderResponse } from './types';

export type MarketOrderReconciliationHandle = Readonly<{
  markTransportStarted: () => void;
  finish: (evidence: PlaceOrderResponse | null) => void;
}>;

export type MarketOrderReconciliationCoordinatorOptions = Readonly<{
  ownerKey: string;
  isOwnerCurrent: () => boolean;
  reconcile: (
    evidence: readonly (PlaceOrderResponse | null)[],
    isBatchCurrent: () => boolean,
  ) => Promise<unknown>;
  releaseBarrier: () => void;
  onReconcileError?: (error: unknown) => void;
}>;

type ReconciliationBatch = {
  ownerKey: string;
  activeOperations: number;
  version: number;
  pendingReconciliation: boolean;
  running: boolean;
  cancelled: boolean;
  startedBarrierReleases: Set<() => void>;
  evidenceByVersion: Map<number, PlaceOrderResponse | null>;
  isOwnerCurrent: () => boolean;
  reconcile: (
    evidence: readonly (PlaceOrderResponse | null)[],
    isBatchCurrent: () => boolean,
  ) => Promise<unknown>;
  onReconcileError?: (error: unknown) => void;
};

const batches = new Map<string, ReconciliationBatch>();

const releaseStartedBarriers = (batch: ReconciliationBatch) => {
  const releases = [...batch.startedBarrierReleases];
  batch.startedBarrierReleases.clear();
  releases.forEach((release) => release());
};

const removeIdleBatch = (batch: ReconciliationBatch) => {
  if (
    batch.activeOperations === 0 &&
    !batch.pendingReconciliation &&
    !batch.running &&
    batch.startedBarrierReleases.size === 0 &&
    batches.get(batch.ownerKey) === batch
  ) {
    batches.delete(batch.ownerKey);
  }
};

const drainReconciliationBatch = async (batch: ReconciliationBatch): Promise<void> => {
  if (batch.running || batch.cancelled) return;
  batch.running = true;

  try {
    while (
      !batch.cancelled &&
      batch.pendingReconciliation &&
      batch.activeOperations === 0
    ) {
      batch.pendingReconciliation = false;
      const targetVersion = batch.version;
      const reconcile = batch.reconcile;
      const evidence = [...batch.evidenceByVersion.entries()]
        .filter(([version]) => version <= targetVersion)
        .sort(([left], [right]) => left - right)
        .map(([, response]) => response);
      const isBatchCurrent = () => (
        !batch.cancelled &&
        batch.version === targetVersion &&
        batch.isOwnerCurrent()
      );

      try {
        await reconcile(evidence, isBatchCurrent);
      } catch (error) {
        batch.onReconcileError?.(error);
      }

      if (batch.cancelled || !batch.isOwnerCurrent()) {
        batch.pendingReconciliation = false;
        batch.evidenceByVersion.clear();
        releaseStartedBarriers(batch);
        break;
      }

      if (batch.version === targetVersion) {
        batch.evidenceByVersion.clear();
        releaseStartedBarriers(batch);
      } else {
        // A newer order POST started while the read was in flight. Its final
        // coalesced read owns the authoritative commit and all held barriers.
        batch.pendingReconciliation = true;
      }
    }
  } finally {
    batch.running = false;
    if (
      !batch.cancelled &&
      batch.pendingReconciliation &&
      batch.activeOperations === 0
    ) {
      void drainReconciliationBatch(batch);
    } else {
      removeIdleBatch(batch);
    }
  }
};

/**
 * Groups overlapping market-order POSTs by immutable broker owner. Order
 * transport is never queued or capped; only the trailing authoritative
 * positions reconciliation is coalesced after the overlapping POSTs settle.
 */
export function beginCoalescedMarketOrderReconciliation(
  options: MarketOrderReconciliationCoordinatorOptions,
): MarketOrderReconciliationHandle {
  let batch = batches.get(options.ownerKey);
  if (!batch || batch.cancelled) {
    batch = {
      ownerKey: options.ownerKey,
      activeOperations: 0,
      version: 0,
      pendingReconciliation: false,
      running: false,
      cancelled: false,
      startedBarrierReleases: new Set(),
      evidenceByVersion: new Map(),
      isOwnerCurrent: options.isOwnerCurrent,
      reconcile: options.reconcile,
      onReconcileError: options.onReconcileError,
    };
    batches.set(options.ownerKey, batch);
  } else {
    batch.isOwnerCurrent = options.isOwnerCurrent;
    batch.reconcile = options.reconcile;
    batch.onReconcileError = options.onReconcileError;
  }

  batch.activeOperations += 1;
  let transportStarted = false;
  let transportVersion: number | null = null;
  let finished = false;

  return {
    markTransportStarted: () => {
      if (finished || transportStarted) return;
      transportStarted = true;
      if (batch.cancelled) {
        options.releaseBarrier();
        return;
      }
      batch.version += 1;
      transportVersion = batch.version;
      batch.pendingReconciliation = true;
      batch.startedBarrierReleases.add(options.releaseBarrier);
    },
    finish: (evidence) => {
      if (finished) return;
      finished = true;
      batch.activeOperations = Math.max(0, batch.activeOperations - 1);

      if (!transportStarted) {
        options.releaseBarrier();
      } else if (transportVersion !== null && !batch.cancelled) {
        batch.evidenceByVersion.set(transportVersion, evidence);
      }
      if (batch.cancelled) return;

      if (batch.pendingReconciliation && batch.activeOperations === 0) {
        void drainReconciliationBatch(batch);
      } else {
        removeIdleBatch(batch);
      }
    },
  };
}

export function resetMarketOrderReconciliationCoordinatorForTests(): void {
  for (const batch of batches.values()) {
    batch.cancelled = true;
    batch.pendingReconciliation = false;
    batch.evidenceByVersion.clear();
    releaseStartedBarriers(batch);
  }
  batches.clear();
}
