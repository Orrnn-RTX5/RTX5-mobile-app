export type ChartProtectionDraftExecutionEvent = Readonly<{
  draftId: string;
  executionConfirmed: boolean;
  ticket?: string;
}>;

export type ChartProtectionPositionSnapshot = Readonly<{
  symbol?: unknown;
  side?: unknown;
  volume?: unknown;
  openPrice?: unknown;
  sl?: unknown;
  tp?: unknown;
  openTime?: unknown;
}>;

export function buildChartProtectionPositionSignature(
  position: ChartProtectionPositionSnapshot,
): string {
  return JSON.stringify([
    String(position.symbol ?? ''),
    String(position.side ?? ''),
    Number(position.volume ?? 0),
    Number(position.openPrice ?? 0),
    Number(position.sl ?? 0),
    Number(position.tp ?? 0),
    String(position.openTime ?? ''),
  ]);
}

export function hasChartProtectionDraftReconciled({
  baselineSignature,
  currentPosition,
  terminalTicketObserved,
}: Readonly<{
  baselineSignature?: string;
  currentPosition?: ChartProtectionPositionSnapshot | null;
  terminalTicketObserved: boolean;
}>): boolean {
  if (terminalTicketObserved) {
    return true;
  }
  if (!currentPosition) {
    return false;
  }
  return (
    baselineSignature === undefined ||
    buildChartProtectionPositionSignature(currentPosition) !== baselineSignature
  );
}

type ChartProtectionDraftExecutionListener = (
  event: ChartProtectionDraftExecutionEvent,
) => void;
type ChartProtectionDraftSubmissionListener = (draftId: string) => void;

const executionListeners = new Set<ChartProtectionDraftExecutionListener>();
const submissionListeners = new Set<ChartProtectionDraftSubmissionListener>();
const activeSubmissionDraftIds = new Set<string>();
let draftSequence = 0;

export function createChartProtectionDraftId(scopeKey: string): string {
  draftSequence = (draftSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${scopeKey}:${Date.now().toString(36)}:${draftSequence.toString(36)}`;
}

export function tryBeginChartProtectionDraftSubmission(draftId: string): boolean {
  const normalizedDraftId = draftId.trim();
  if (!normalizedDraftId || activeSubmissionDraftIds.has(normalizedDraftId)) {
    return false;
  }
  activeSubmissionDraftIds.add(normalizedDraftId);
  return true;
}

export function releaseChartProtectionDraftSubmission(draftId: string): void {
  const normalizedDraftId = draftId.trim();
  if (normalizedDraftId) {
    activeSubmissionDraftIds.delete(normalizedDraftId);
  }
}

export function publishChartProtectionDraftExecution(
  event: ChartProtectionDraftExecutionEvent,
): void {
  const draftId = event.draftId.trim();
  if (!draftId) {
    return;
  }
  const ticket = event.ticket?.trim();
  const normalizedEvent: ChartProtectionDraftExecutionEvent = Object.freeze({
    draftId,
    executionConfirmed: event.executionConfirmed === true,
    ...(ticket ? { ticket } : {}),
  });
  executionListeners.forEach((listener) => listener(normalizedEvent));
}

export function subscribeChartProtectionDraftExecution(
  listener: ChartProtectionDraftExecutionListener,
): () => void {
  executionListeners.add(listener);
  return () => {
    executionListeners.delete(listener);
  };
}

export function publishChartProtectionDraftSubmission(draftId: string): void {
  const normalizedDraftId = draftId.trim();
  if (!normalizedDraftId) {
    return;
  }
  submissionListeners.forEach((listener) => listener(normalizedDraftId));
}

export function subscribeChartProtectionDraftSubmission(
  listener: ChartProtectionDraftSubmissionListener,
): () => void {
  submissionListeners.add(listener);
  return () => {
    submissionListeners.delete(listener);
  };
}
