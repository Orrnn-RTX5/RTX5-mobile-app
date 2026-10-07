import type { TradeSide } from '../../../domain/tradeSide';

export type ChartTradeQueueStatus =
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'unconfirmed'
  | 'cancelled';

/**
 * Structural counterpart of the chart trade feedback payload. Keeping this
 * type local lets the queue UI stay independent from ChartScreen and the
 * feedback modal implementation.
 */
export type ChartTradeQueueFeedback = {
  visible: boolean;
  type: 'success' | 'error';
  title?: string;
  message?: string;
  side?: TradeSide;
  symbol?: string;
  ticket?: string;
  price?: number;
  volume?: number;
  executedAt?: string;
  executionConfirmed?: boolean;
  protectionDraftId?: string;
  /** Immutable chart-window owner captured when the trade was submitted. */
  chartWindowPaneId?: string;
};

export type ChartTradeQueueEvent = {
  queueId: number;
  status: ChartTradeQueueStatus;
  side: TradeSide;
  symbol: string;
  volume: number;
  /** Immutable chart-window owner captured when the trade was submitted. */
  chartWindowPaneId?: string;
  feedback?: ChartTradeQueueFeedback;
};

export type ChartTradeReceiptSnapshot = readonly ChartTradeQueueEvent[];

export function selectChartTradeReceiptSnapshotForPane(
  snapshot: ChartTradeReceiptSnapshot,
  chartWindowPaneId: string,
): ChartTradeReceiptSnapshot {
  return snapshot.filter(
    (event) => event.chartWindowPaneId === chartWindowPaneId,
  );
}

const TERMINAL_DISMISS_MS = 5_000;

const isTerminalStatus = (status: ChartTradeQueueStatus): boolean =>
  status === 'confirmed' || status === 'failed' || status === 'unconfirmed';

/**
 * Applies a queue event without mutating the previous snapshot. New trades are
 * prepended, while status changes keep the receipt in its original position.
 * There is deliberately no maximum length: FlatList virtualizes large bursts.
 */
export function reduceChartTradeReceiptStack(
  snapshot: ChartTradeReceiptSnapshot,
  event: ChartTradeQueueEvent,
): ChartTradeReceiptSnapshot {
  const existingIndex = snapshot.findIndex((entry) => entry.queueId === event.queueId);

  if (event.status === 'cancelled') {
    if (existingIndex < 0) return snapshot;
    return snapshot.filter((entry) => entry.queueId !== event.queueId);
  }

  if (existingIndex < 0) {
    return [event, ...snapshot];
  }

  const current = snapshot[existingIndex];
  const updated: ChartTradeQueueEvent = {
    ...current,
    ...event,
    // Queue ownership belongs to the initiating tap. A later broker response
    // must not migrate its receipt after pane promotion or a symbol change.
    chartWindowPaneId:
      current.chartWindowPaneId ?? event.chartWindowPaneId,
    feedback: event.feedback ?? current.feedback,
  };

  if (
    current.status === updated.status
    && current.side === updated.side
    && current.symbol === updated.symbol
    && current.volume === updated.volume
    && current.chartWindowPaneId === updated.chartWindowPaneId
    && current.feedback === updated.feedback
  ) {
    return snapshot;
  }

  const next = snapshot.slice();
  next[existingIndex] = updated;
  return next;
}

export function removeChartTradeReceipt(
  snapshot: ChartTradeReceiptSnapshot,
  queueId: number,
): ChartTradeReceiptSnapshot {
  const index = snapshot.findIndex((entry) => entry.queueId === queueId);
  if (index < 0) return snapshot;
  return snapshot.filter((entry) => entry.queueId !== queueId);
}

export type ChartTradeReceiptStackController = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ChartTradeReceiptSnapshot;
  applyEvent: (event: ChartTradeQueueEvent) => void;
  dismiss: (queueId: number) => void;
  clear: () => void;
  dispose: () => void;
};

export type ChartTradeReceiptStackControllerOptions = {
  terminalDismissMs?: number;
};

export function createChartTradeReceiptStackController(
  options: ChartTradeReceiptStackControllerOptions = {},
): ChartTradeReceiptStackController {
  const terminalDismissMs = Number.isFinite(options.terminalDismissMs)
    ? Math.max(0, Number(options.terminalDismissMs))
    : TERMINAL_DISMISS_MS;
  const listeners = new Set<() => void>();
  const dismissTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let snapshot: ChartTradeReceiptSnapshot = [];
  let disposed = false;

  const emit = () => {
    listeners.forEach((listener) => listener());
  };

  const clearDismissTimer = (queueId: number) => {
    const timer = dismissTimers.get(queueId);
    if (!timer) return;
    clearTimeout(timer);
    dismissTimers.delete(queueId);
  };

  const dismiss = (queueId: number) => {
    clearDismissTimer(queueId);
    if (disposed) return;
    const next = removeChartTradeReceipt(snapshot, queueId);
    if (next === snapshot) return;
    snapshot = next;
    emit();
  };

  const scheduleDismiss = (queueId: number) => {
    clearDismissTimer(queueId);
    const timer = setTimeout(() => {
      dismissTimers.delete(queueId);
      dismiss(queueId);
    }, terminalDismissMs);
    dismissTimers.set(queueId, timer);
  };

  return {
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    applyEvent(event) {
      if (disposed) return;

      if (event.status === 'pending') {
        clearDismissTimer(event.queueId);
      }

      const next = reduceChartTradeReceiptStack(snapshot, event);
      if (next !== snapshot) {
        snapshot = next;
        emit();
      }

      if (event.status === 'cancelled') {
        clearDismissTimer(event.queueId);
      } else if (isTerminalStatus(event.status)) {
        scheduleDismiss(event.queueId);
      }
    },
    dismiss,
    clear() {
      dismissTimers.forEach((timer) => clearTimeout(timer));
      dismissTimers.clear();
      if (disposed || snapshot.length === 0) return;
      snapshot = [];
      emit();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      dismissTimers.forEach((timer) => clearTimeout(timer));
      dismissTimers.clear();
      listeners.clear();
      snapshot = [];
    },
  };
}
