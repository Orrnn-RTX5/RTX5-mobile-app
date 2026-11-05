/**
 * Process-wide, in-memory order latency telemetry (port of the web
 * terminal's `orderLatencyTelemetry.ts`). The Journal builds its local
 * "Terminal" trade rows and the "Last trade latency" readout from it.
 *
 * Deliberately NOT persisted: it is lost on restart, and server journal rows
 * are the durable record.
 */

export type OrderTerminalStatus = 'filled' | 'rejected' | 'expired' | 'failed';

export type OrderLatencyPhase =
  | 'placement_terminal'
  | 'order_filled'
  | 'order_rejected'
  | 'rest_completed'
  | 'rest_failed'
  | (string & {});

export type OrderLatencySample = {
  /** Monotonically increasing; assigned by the buffer. */
  sequence: number;
  /** Wall clock (Date.now()); becomes the journal row datetime. */
  recordedAtEpochMs: number;
  phase: OrderLatencyPhase;
  transport: 'websocket' | 'rest';
  /** Last 8 characters of clientOrderId, or "unknown". */
  traceId: string;
  /** The same id sent to the server as client_order_id. */
  clientOrderId?: string;
  /** Journal session scope captured when the order was placed. */
  sessionScope?: string;
  symbol?: string;
  side?: 'buy' | 'sell';
  volume?: number;
  terminalStatus?: OrderTerminalStatus;
  errorCode?: string;
  errorMessage?: string;
  /** Tap-to-result duration from a MONOTONIC clock. */
  totalMs?: number;
  terminalRttMs?: number;
  restRttMs?: number;
};

export type OrderLatencySampleInput = Omit<OrderLatencySample, 'sequence' | 'recordedAtEpochMs' | 'traceId'> & {
  recordedAtEpochMs?: number;
};

export const ORDER_LATENCY_BUFFER_LIMIT = 200;

let samples: OrderLatencySample[] = [];
let sequence = 0;
const listeners = new Set<(sample: OrderLatencySample) => void>();

export function traceIdFor(clientOrderId: string | undefined): string {
  const id = clientOrderId?.trim();
  return id ? id.slice(-8) : 'unknown';
}

/**
 * Stores the sample synchronously and notifies subscribers on the next task,
 * so diagnostics never delay the order result reaching the UI.
 */
export function recordOrderLatencySample(input: OrderLatencySampleInput): OrderLatencySample {
  sequence += 1;
  const sample: OrderLatencySample = {
    ...input,
    sequence,
    recordedAtEpochMs: input.recordedAtEpochMs ?? Date.now(),
    traceId: traceIdFor(input.clientOrderId),
  };
  samples.push(sample);
  if (samples.length > ORDER_LATENCY_BUFFER_LIMIT) {
    samples = samples.slice(samples.length - ORDER_LATENCY_BUFFER_LIMIT);
  }
  if (listeners.size > 0) {
    setTimeout(() => {
      for (const listener of [...listeners]) {
        try {
          listener(sample);
        } catch {
          // A diagnostics subscriber must never break other subscribers.
        }
      }
    }, 0);
  }
  return sample;
}

/** Snapshot copy, oldest first. */
export function getOrderLatencySamples(): OrderLatencySample[] {
  return samples.slice();
}

export function subscribeOrderLatencySamples(listener: (sample: OrderLatencySample) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset. */
export function resetOrderLatencyTelemetryForTests(): void {
  samples = [];
  sequence = 0;
  listeners.clear();
}
