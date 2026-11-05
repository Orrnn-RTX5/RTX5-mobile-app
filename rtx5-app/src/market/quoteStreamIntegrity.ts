import type { ActiveBrokerSessionIdentity } from '../state/activeBrokerSession';
import type { NormalizedQuoteFeedUpdate } from '../api/ws/quoteTickNormalizer';
import { normalizeQuoteTickTimestampToMs } from '../api/ws/quoteTimestamp';

export type QuoteOrderCursor = Readonly<{
  timestampMs: number;
  sequence?: number;
  tickId?: string;
  bid: number;
  ask: number;
}>;

export type QuoteStreamAcceptance =
  | { accepted: true; cursor: QuoteOrderCursor }
  | {
      accepted: false;
      reason:
        | 'wrong_broker'
        | 'wrong_account'
        | 'wrong_epoch'
        | 'backward_time'
        | 'lower_sequence'
        | 'duplicate';
    };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const collectRecords = (value: unknown): Record<string, unknown>[] => {
  const root = asRecord(value);
  if (!root) return [];
  const first = [root.data, root.payload, root.quote, root.tick, root.session]
    .map(asRecord)
    .filter((record): record is Record<string, unknown> => Boolean(record));
  const nestedSessions = first
    .map((record) => asRecord(record.session))
    .filter((record): record is Record<string, unknown> => Boolean(record));
  return [root, ...first, ...nestedSessions];
};

const collectIdentityValues = (
  records: readonly Record<string, unknown>[],
  keys: readonly string[],
): string[] => {
  const values = new Set<string>();
  for (const record of records) {
    for (const key of keys) {
      const raw = record[key];
      if (typeof raw === 'string' || typeof raw === 'number') {
        const value = String(raw).trim();
        if (value) values.add(value);
      }
    }
  }
  return [...values];
};

const parseSequence = (value: string | number | undefined): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

export const evaluateQuoteStreamTick = (
  raw: unknown,
  update: NormalizedQuoteFeedUpdate,
  identity: ActiveBrokerSessionIdentity,
  previous?: QuoteOrderCursor,
  receivedAt: number = Date.now(),
): QuoteStreamAcceptance => {
  const records = collectRecords(raw);
  const brokers = collectIdentityValues(records, ['broker_id', 'brokerId']);
  if (brokers.some((value) => value.toLowerCase() !== identity.brokerId.toLowerCase())) {
    return { accepted: false, reason: 'wrong_broker' };
  }
  const accounts = collectIdentityValues(records, ['account_login', 'accountLogin']);
  if (accounts.some((value) => value !== identity.accountLogin)) {
    return { accepted: false, reason: 'wrong_account' };
  }
  const epochs = collectIdentityValues(records, ['session_epoch', 'sessionEpoch']);
  if (epochs.some((value) => Number(value) !== identity.sessionEpoch)) {
    return { accepted: false, reason: 'wrong_epoch' };
  }

  const timestampMs = normalizeQuoteTickTimestampToMs(update.timestamp) ?? receivedAt;
  const sequence = parseSequence(update.sequence);
  const tickId = update.tickId?.trim() || undefined;
  if (previous) {
    if (timestampMs < previous.timestampMs) {
      return { accepted: false, reason: 'backward_time' };
    }
    if (
      sequence !== undefined &&
      previous.sequence !== undefined &&
      sequence < previous.sequence
    ) {
      return { accepted: false, reason: 'lower_sequence' };
    }
    if (
      (tickId && tickId === previous.tickId) ||
      (
        timestampMs === previous.timestampMs &&
        sequence === previous.sequence &&
        update.bid === previous.bid &&
        update.ask === previous.ask
      )
    ) {
      return { accepted: false, reason: 'duplicate' };
    }
  }

  return {
    accepted: true,
    cursor: Object.freeze({
      timestampMs,
      ...(sequence === undefined ? {} : { sequence }),
      ...(tickId ? { tickId } : {}),
      bid: update.bid,
      ask: update.ask,
    }),
  };
};

