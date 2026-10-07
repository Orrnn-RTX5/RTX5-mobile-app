import { normalizeQuoteSymbolKey, normalizeSymbol } from '../../domain/symbols';
import { resolveQuoteTickTimestamp } from './quoteTimestamp';

export type QuoteTickEvent = {
  symbol: string;
  rawSymbol?: string;
  bid: number;
  ask: number;
  last?: number;
  high?: number;
  low?: number;
  open?: number;
  dailyOpen?: number;
  previousClose?: number;
  changePct?: number;
  spread?: number;
  volume?: number;
  digits?: number;
  point?: number;
  tickSize?: number;
  sequence?: string | number;
  tickId?: string;
  source?: string;
  authority?: string;
  /** Hub quote state: live | delayed | inactive | no_quote | source_mismatch. */
  marketState?: string;
  transport?: 'websocket' | 'rest_snapshot';
  stale?: boolean;
  tradable?: boolean;
  ageMs?: number;
  ageSec?: number;
  degraded?: boolean;
  degradationReason?: 'missing_ask';
  feedTickAt?: number;
  /** Monotonic process-local timestamp captured beside receivedAt. */
  receiptMonotonicAt?: number;
  receivedAt: number;
  timestamp: number;
};

export type NormalizedQuoteFeedUpdate = {
  symbol: string;
  rawSymbol: string;
  bid: number;
  ask: number;
  last?: number;
  high?: number;
  low?: number;
  open?: number;
  dailyOpen?: number;
  previousClose?: number;
  changePct?: number;
  spread?: number;
  volume?: number;
  digits?: number;
  point?: number;
  tickSize?: number;
  sequence?: string | number;
  tickId?: string;
  source?: string;
  authority?: string;
  /** Hub quote state: live | delayed | inactive | no_quote | source_mismatch. */
  marketState?: string;
  stale?: boolean;
  tradable?: boolean;
  ageMs?: number;
  ageSec?: number;
  degraded?: boolean;
  degradationReason?: 'missing_ask';
  timestamp: number | null;
  timestampSource: 'feed' | 'received_at' | 'missing';
  rawKeys: string[];
};

export type QuoteTickNormalizationResult =
  | { ok: true; update: NormalizedQuoteFeedUpdate }
  | {
      ok: false;
      reason: 'missing_payload' | 'missing_symbol' | 'missing_bid_ask' | 'no_quote';
      rawKeys: string[];
    };

const SYMBOL_KEYS = ['symbol', 'Symbol', 'SYMBOL', 's', 'S', 'instrument', 'instrumentSymbol'];
const CHANNEL_KEYS = ['channel', 'topic', 'stream'];
const BID_KEYS = ['bid', 'Bid', 'BID', 'bidPrice', 'BidPrice', 'bid_price', 'b', 'B'];
const ASK_KEYS = ['ask', 'Ask', 'ASK', 'askPrice', 'AskPrice', 'ask_price', 'a', 'A'];
const LAST_KEYS = ['last', 'Last', 'LAST', 'lastPrice', 'LastPrice', 'last_price', 'price', 'p', 'P', 'close', 'c'];
const OPEN_KEYS = ['open', 'Open', 'OPEN', 'daily_open', 'dailyOpen', 'dayOpen'];
const PREVIOUS_CLOSE_KEYS = ['previous_close', 'previousClose', 'prev_close', 'prevClose'];
const HIGH_KEYS = ['high', 'High', 'HIGH', 'high_bid', 'highBid', 'daily_high', 'dailyHigh', 'dayHigh'];
const LOW_KEYS = ['low', 'Low', 'LOW', 'low_bid', 'lowBid', 'daily_low', 'dailyLow', 'dayLow'];
const CHANGE_KEYS = ['changePct', 'dailyChangePct', 'daily_change_pct', 'change_pct', 'changePercent'];
const SPREAD_KEYS = ['spread', 'Spread', 'SPREAD'];
const VOLUME_KEYS = ['volume', 'Volume', 'VOL', 'tick_volume', 'tickVolume'];
const DIGITS_KEYS = [
  'digits',
  'Digits',
  'DIGITS',
  'precision',
  'pricePrecision',
  'price_precision',
  'symbolDigits',
  'symbol_digits',
  'priceDigits',
  'price_digits',
  'quoteDigits',
  'quote_digits',
  'quotePrecision',
  'quote_precision',
  'decimalPlaces',
  'decimal_places',
];
const POINT_KEYS = ['point', 'Point', 'POINT', 'pricePoint', 'price_point'];
const TICK_SIZE_KEYS = [
  'tickSize',
  'TickSize',
  'TICK_SIZE',
  'tick_size',
  'tick-size',
  'priceTickSize',
  'price_tick_size',
  'minimumPriceIncrement',
  'minimum_price_increment',
];
const SEQUENCE_KEYS = ['sequence', 'seq', 'source_seq', 'sourceSeq', 'sequenceId', 'sourceSequence'];
const MARKET_STATE_KEYS = ['market_state', 'marketState'];
const TICK_ID_KEYS = ['tick_id', 'tickId', 'source_tick_id', 'sourceTickId'];
const SOURCE_KEYS = ['source', 'feed_source', 'feedSource', 'provider'];
const AUTHORITY_KEYS = ['authority', 'feed_authority', 'feedAuthority'];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const getCandidateRecords = (input: Record<string, unknown>): Record<string, unknown>[] => {
  const nestedQuote = asRecord(input.quote);
  const nestedData = asRecord(input.data);
  const nestedPayload = asRecord(input.payload);
  const nestedTick = asRecord(input.tick);
  const nestedPrice = asRecord(input.price);
  const nestedMessage = asRecord(input.message);
  const nestedEvent = asRecord(input.event);
  const nestedDataQuote = nestedData ? asRecord(nestedData.quote) : null;
  const nestedDataTick = nestedData ? asRecord(nestedData.tick) : null;
  const nestedDataPrice = nestedData ? asRecord(nestedData.price) : null;
  const nestedPayloadQuote = nestedPayload ? asRecord(nestedPayload.quote) : null;
  const nestedPayloadTick = nestedPayload ? asRecord(nestedPayload.tick) : null;
  const nestedPayloadPrice = nestedPayload ? asRecord(nestedPayload.price) : null;
  return [
    input,
    nestedQuote,
    nestedData,
    nestedPayload,
    nestedTick,
    nestedPrice,
    nestedMessage,
    nestedEvent,
    nestedDataQuote,
    nestedDataTick,
    nestedDataPrice,
    nestedPayloadQuote,
    nestedPayloadTick,
    nestedPayloadPrice,
  ].filter((record): record is Record<string, unknown> => record !== null);
};

const pickFirstValue = (
  records: Record<string, unknown>[],
  keys: readonly string[],
): unknown => {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
  }

  return undefined;
};

const toFinitePrice = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toFiniteOptionalNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toPositiveOptionalNumber = (value: unknown): number | undefined => {
  const parsed = toFiniteOptionalNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
};

const toNonNegativeOptionalNumber = (value: unknown): number | undefined => {
  const parsed = toFiniteOptionalNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
};

const toCleanString = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const cleaned = String(value).trim();
  return cleaned ? cleaned : undefined;
};

/**
 * /ws/feed sends `sequence` / `source_seq` as decimal strings ("293935").
 * Parse them to numbers so the backward-sequence gate compares numerically;
 * non-numeric identifiers are kept as trimmed strings.
 */
export const parseQuoteSequence = (value: unknown): string | number | undefined => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  return trimmed;
};

/** previous_close: 0 means "unknown" on the current hub (Trivanta). */
const toKnownPreviousClose = (value: unknown): number | undefined => {
  const parsed = toFiniteOptionalNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
};

const toOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return undefined;
};

const extractSymbolFromChannel = (value: unknown): string => {
  const channel = toCleanString(value);
  if (!channel) {
    return '';
  }

  const parts = channel.split(/[.:/]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return '';
  }

  const prefix = parts[0].toLowerCase();
  if (!['quote', 'quotes', 'tick', 'ticks', 'price', 'prices'].includes(prefix)) {
    return '';
  }

  return parts.slice(1).join('.');
};

const withSessionRecords = (records: Record<string, unknown>[]): Record<string, unknown>[] => {
  const sessionRecords = records
    .map((record) => asRecord(record.session))
    .filter((record): record is Record<string, unknown> => record !== null);

  return [...records, ...sessionRecords];
};

const resolveTimestamp = (
  records: Record<string, unknown>[],
  fallbackMs: number | null,
): { timestamp: number | null; timestampSource: NormalizedQuoteFeedUpdate['timestampSource'] } => {
  const fromFeed = resolveQuoteTickTimestamp({
    timestamp: pickFirstValue(records, ['timestamp', 'Timestamp', 'TIMESTAMP']),
    timestampMs: pickFirstValue(records, [
      'timestamp_ms',
      'timestampMs',
      'quote_time_ms',
      'quoteTimeMs',
      'TimestampMs',
      'TIMESTAMP_MS',
      'hub_publish_timestamp',
      'hubPublishTimestamp',
      'provider_timestamp',
      'providerTimestamp',
      'hub_ingest_timestamp',
      'hubIngestTimestamp',
    ]),
    // /ws/feed `time` is Unix seconds (scaled later by
    // normalizeQuoteTickTimestampToMs); timestamp_ms above always wins.
    time: pickFirstValue(records, [
      'time',
      'Time',
      'TIME',
      'tick_time',
      'tickTime',
      'source_time',
      'sourceTime',
      'quote_time_unix',
      'quoteTimeUnix',
    ]),
    timeMs: pickFirstValue(records, ['time_ms', 'timeMs', 'tick_time_ms', 'tickTimeMs', 'source_time_ms', 'sourceTimeMs']),
    t: pickFirstValue(records, ['t', 'T', 'ts', 'TS']),
    lastTickAt: pickFirstValue(records, ['lastTickAt', 'last_tick_at', 'last_tick_time']),
    serverTime: pickFirstValue(records, [
      'serverTime',
      'server_time',
      'serverTimestamp',
      'server_timestamp',
      'createdAt',
      'created_at',
      'updatedAt',
      'updated_at',
      'receivedAt',
      'received_at',
    ]),
    serverTimeMs: pickFirstValue(records, [
      'serverTimeMs',
      'server_time_ms',
      'serverTimestampMs',
      'server_timestamp_ms',
      'receivedAtMs',
      'received_at_ms',
    ]),
  });

  if (fromFeed !== null) {
    return { timestamp: fromFeed, timestampSource: 'feed' };
  }

  const fallback = resolveQuoteTickTimestamp({}, fallbackMs);
  return fallback === null
    ? { timestamp: null, timestampSource: 'missing' }
    : { timestamp: fallback, timestampSource: 'received_at' };
};

export const normalizeQuoteTickPayload = (
  payload: unknown,
  fallbackTimestampMs: number | null = null,
): QuoteTickNormalizationResult => {
  const input = asRecord(payload);
  if (!input) {
    return { ok: false, reason: 'missing_payload', rawKeys: [] };
  }

  const records = getCandidateRecords(input);
  const rawKeys = Object.keys(input);
  const explicitSymbol = pickFirstValue(records, SYMBOL_KEYS);
  const channelSymbol = extractSymbolFromChannel(pickFirstValue(records, CHANNEL_KEYS));
  const rawSymbol = normalizeQuoteSymbolKey(String(explicitSymbol ?? channelSymbol ?? ''));
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    return { ok: false, reason: 'missing_symbol', rawKeys };
  }

  // Snapshot entries for unknown/unquoted symbols carry has_quote:false and no
  // bid/ask. They are expected, so report them apart from malformed ticks.
  if (input.has_quote === false || input.hasQuote === false) {
    return { ok: false, reason: 'no_quote', rawKeys };
  }

  const bid = toFinitePrice(pickFirstValue(records, BID_KEYS));
  const rawAsk = pickFirstValue(records, ASK_KEYS);
  const ask = toFinitePrice(rawAsk);
  if (bid === null || ask === null || ask < bid) {
    return { ok: false, reason: 'missing_bid_ask', rawKeys };
  }

  const last = toFinitePrice(pickFirstValue(records, LAST_KEYS)) ?? undefined;
  const metricRecords = withSessionRecords(records);
  const dailyOpen = toFiniteOptionalNumber(pickFirstValue(metricRecords, OPEN_KEYS));
  const previousClose = toKnownPreviousClose(pickFirstValue(metricRecords, PREVIOUS_CLOSE_KEYS));
  // /ws/feed has no top-level high/low: daily extremes come from
  // session.high_bid / session.low_bid, reached through metricRecords.
  const high = toPositiveOptionalNumber(pickFirstValue(metricRecords, HIGH_KEYS));
  const low = toPositiveOptionalNumber(pickFirstValue(metricRecords, LOW_KEYS));
  const changePct = toFiniteOptionalNumber(pickFirstValue(metricRecords, CHANGE_KEYS));
  const spread = toFiniteOptionalNumber(pickFirstValue(metricRecords, SPREAD_KEYS));
  // Backend volume/tick_volume may be absent, but it should never be negative.
  const volume = toNonNegativeOptionalNumber(pickFirstValue(metricRecords, VOLUME_KEYS));
  const digits = toFiniteOptionalNumber(pickFirstValue(metricRecords, DIGITS_KEYS));
  const point = toPositiveOptionalNumber(pickFirstValue(metricRecords, POINT_KEYS));
  const tickSize = toPositiveOptionalNumber(pickFirstValue(metricRecords, TICK_SIZE_KEYS));
  const sequence = parseQuoteSequence(pickFirstValue(metricRecords, SEQUENCE_KEYS));
  const marketState = toCleanString(pickFirstValue(metricRecords, MARKET_STATE_KEYS));
  const tickId = toCleanString(pickFirstValue(metricRecords, TICK_ID_KEYS));
  const source = toCleanString(pickFirstValue(metricRecords, SOURCE_KEYS));
  const authority = toCleanString(pickFirstValue(metricRecords, AUTHORITY_KEYS));
  const stale = toOptionalBoolean(pickFirstValue(metricRecords, ['stale', 'is_stale', 'isStale']));
  const degraded = toOptionalBoolean(
    pickFirstValue(metricRecords, ['degraded', 'is_degraded', 'isDegraded']),
  );
  const tradable = toOptionalBoolean(pickFirstValue(metricRecords, ['tradable', 'trade_allowed', 'tradeAllowed']));
  const ageMs = toNonNegativeOptionalNumber(pickFirstValue(metricRecords, ['age_ms', 'ageMs']));
  const ageSec = toNonNegativeOptionalNumber(pickFirstValue(metricRecords, ['age_sec', 'ageSec']));
  const resolvedTimestamp = resolveTimestamp(records, fallbackTimestampMs);
  return {
    ok: true,
    update: {
      symbol,
      rawSymbol,
      bid,
      ask,
      last,
      open: dailyOpen,
      dailyOpen,
      previousClose,
      high,
      low,
      changePct,
      spread,
      volume,
      digits,
      point,
      tickSize,
      sequence,
      tickId,
      source,
      authority,
      ...(marketState === undefined ? {} : { marketState }),
      stale,
      degraded,
      tradable,
      ageMs,
      ageSec,
      timestamp: resolvedTimestamp.timestamp,
      timestampSource: resolvedTimestamp.timestampSource,
      rawKeys,
    },
  };
};
