import type { Deal } from '../../../api/deals';
import type { ClosedPosition } from '../../../api/positions';
import {
  getTimeframeSeconds,
  normalizeTimeframe,
  normalizeTimestampToSeconds,
} from '../../../domain/candles/core/timeframeUtils';
import { normalizeChartOverlaySymbol } from './symbolUtils';
import type { ChartOverlayCandle, ChartOverlayMarker, ChartOverlayTradeHistorySegment } from './types';

type TradeAction = 'buy' | 'sell';
type DealEntry = 'in' | 'out';

type NormalizedDealExecution = {
  identity: string;
  sourceTicket: string | null;
  positionTicket: string | null;
  symbol: string;
  action: TradeAction;
  entry: DealEntry;
  volume: number;
  price: number;
  time: number;
};

type OpeningLot = {
  execution: NormalizedDealExecution;
  remainingVolume: number;
};

type MatchedExecution = {
  opening: NormalizedDealExecution;
  closing: NormalizedDealExecution;
};

type CandleTimeline = {
  times: number[];
  expectedDurationSeconds: number;
  isMonthly: boolean;
};

export type BuildChartTradeHistoryOverlayInput = {
  chartSymbol: string;
  chartTimeframe: string;
  candles: ChartOverlayCandle[];
  openPositions?: readonly ChartTradeHistoryOpenPosition[] | null;
  deals?: readonly Deal[] | null;
  closedPositions?: readonly ClosedPosition[] | null;
  buyColor: string;
  sellColor: string;
};

/**
 * Small structural contract used for the currently-open-position fallback.
 * Runtime chart positions use the camelCase fields; raw broker rows may use
 * the snake_case aliases.
 */
export type ChartTradeHistoryOpenPosition = {
  id?: string | number;
  ticket?: string | number;
  symbol: string;
  side: string;
  openPrice?: number;
  price_open?: number;
  openTime?: string | number | Date;
  time_create?: string | number | Date;
  volume?: number;
};

export type ChartTradeHistoryOverlay = {
  markers: ChartOverlayMarker[];
  tradeHistorySegments: ChartOverlayTradeHistorySegment[];
};

const VOLUME_EPSILON = 1e-9;
// MT5's history connector is slightly stronger than a one-pixel guide.
const TRADE_HISTORY_CONNECTOR_LINE_WIDTH = 1.5;

const toFinitePositiveNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const toPositiveIdentifier = (value: unknown): string | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return String(Math.trunc(numeric));
};

const normalizeAction = (value: unknown): TradeAction | null => {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'buy' || normalized === 'deal_buy') return 'buy';
  if (normalized === 'sell' || normalized === 'deal_sell') return 'sell';
  return null;
};

const normalizeEntry = (value: unknown): DealEntry | null => {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'in' || normalized === 'entry_in' || normalized === 'deal_entry_in') {
    return 'in';
  }
  if (
    normalized === 'out'
    || normalized === 'out_by'
    || normalized === 'entry_out'
    || normalized === 'entry_out_by'
    || normalized === 'deal_entry_out'
    || normalized === 'deal_entry_out_by'
  ) {
    return 'out';
  }
  return null;
};

const oppositeAction = (action: TradeAction): TradeAction =>
  action === 'buy' ? 'sell' : 'buy';

const numberIdentity = (value: number): string => {
  // Converting through Number gives equivalent numeric payloads (for example,
  // 1.1000 and 1.1) the same deterministic execution identity.
  return String(value);
};

const buildDealIdentity = (
  sourceTicket: string | null,
  positionTicket: string | null,
  symbol: string,
  action: TradeAction,
  entry: DealEntry,
  time: number,
  price: number,
  volume: number,
): string => {
  if (sourceTicket) return `deal-${sourceTicket}`;
  return [
    'deal-no-ticket',
    positionTicket ?? 'no-position',
    symbol,
    action,
    entry,
    time,
    numberIdentity(price),
    numberIdentity(volume),
  ].join('-');
};

const compareNormalizedExecutions = (
  left: NormalizedDealExecution,
  right: NormalizedDealExecution,
): number => {
  if (left.time !== right.time) return left.time - right.time;
  const leftTicket = Number(left.sourceTicket ?? Number.MAX_SAFE_INTEGER);
  const rightTicket = Number(right.sourceTicket ?? Number.MAX_SAFE_INTEGER);
  if (leftTicket !== rightTicket) return leftTicket - rightTicket;
  if (left.entry !== right.entry) return left.entry === 'in' ? -1 : 1;
  return left.identity.localeCompare(right.identity);
};

const normalizeDealExecutions = (
  deals: readonly Deal[],
  normalizedChartSymbol: string,
): NormalizedDealExecution[] => {
  const uniqueExecutions = new Map<string, NormalizedDealExecution>();

  deals.forEach((deal) => {
    const record = deal as unknown as Record<string, unknown>;
    const symbol = normalizeChartOverlaySymbol(String(record.symbol ?? ''));
    const action = normalizeAction(record.action);
    const entry = normalizeEntry(record.entry);
    const volume = toFinitePositiveNumber(record.volume);
    const price = toFinitePositiveNumber(record.price);
    const time = normalizeTimestampToSeconds(record.time);
    if (
      symbol !== normalizedChartSymbol
      || !action
      || !entry
      || volume === null
      || price === null
      || time === null
    ) {
      return;
    }

    const sourceTicket = toPositiveIdentifier(record.ticket);
    const positionTicket = toPositiveIdentifier(record.position_ticket);
    const identity = buildDealIdentity(
      sourceTicket,
      positionTicket,
      symbol,
      action,
      entry,
      time,
      price,
      volume,
    );

    // Broker pagination can repeat the boundary deal. Keeping a single stable
    // execution prevents duplicate arrows and duplicate connector segments.
    if (!uniqueExecutions.has(identity)) {
      uniqueExecutions.set(identity, {
        identity,
        sourceTicket,
        positionTicket,
        symbol,
        action,
        entry,
        volume,
        price,
        time,
      });
    }
  });

  return [...uniqueExecutions.values()].sort(compareNormalizedExecutions);
};

const normalizeOpenPositionExecutions = (
  openPositions: readonly ChartTradeHistoryOpenPosition[],
  normalizedChartSymbol: string,
): NormalizedDealExecution[] => openPositions
  .map((position): NormalizedDealExecution | null => {
    const record = position as ChartTradeHistoryOpenPosition;
    const symbol = normalizeChartOverlaySymbol(String(record.symbol ?? ''));
    const side = normalizeAction(record.side);
    const openPrice = toFinitePositiveNumber(record.openPrice ?? record.price_open);
    const openTime = normalizeTimestampToSeconds(record.openTime ?? record.time_create);
    if (
      symbol !== normalizedChartSymbol
      || !side
      || openPrice === null
      || openTime === null
    ) {
      return null;
    }

    const positionTicket = toPositiveIdentifier(record.id ?? record.ticket);
    return {
      identity: [
        'position-open',
        positionTicket ?? 'no-position',
        symbol,
        side,
        openTime,
        numberIdentity(openPrice),
      ].join('-'),
      sourceTicket: null,
      positionTicket,
      symbol,
      action: side,
      entry: 'in',
      volume: toFinitePositiveNumber(record.volume) ?? 0,
      price: openPrice,
      time: openTime,
    };
  })
  .filter((execution): execution is NormalizedDealExecution => execution !== null)
  .sort(compareNormalizedExecutions);

const isEligibleOpening = (
  lot: OpeningLot,
  closing: NormalizedDealExecution,
  requireExactPosition: boolean,
): boolean => {
  if (lot.remainingVolume <= VOLUME_EPSILON) return false;
  if (lot.execution.symbol !== closing.symbol) return false;
  if (lot.execution.action !== oppositeAction(closing.action)) return false;
  if (requireExactPosition) {
    return Boolean(
      closing.positionTicket
      && lot.execution.positionTicket === closing.positionTicket,
    );
  }
  // A ticketed close must never consume a different ticketed position. It may
  // still use a no-ticket entry when the broker omitted the entry's link.
  return !closing.positionTicket || !lot.execution.positionTicket;
};

const consumeOpeningLots = (
  openings: OpeningLot[],
  closing: NormalizedDealExecution,
  remainingCloseVolume: number,
  requireExactPosition: boolean,
  matches: MatchedExecution[],
): number => {
  let remaining = remainingCloseVolume;
  for (const lot of openings) {
    if (remaining <= VOLUME_EPSILON) break;
    if (!isEligibleOpening(lot, closing, requireExactPosition)) continue;

    const matchedVolume = Math.min(remaining, lot.remainingVolume);
    if (matchedVolume <= VOLUME_EPSILON) continue;
    matches.push({ opening: lot.execution, closing });
    lot.remainingVolume -= matchedVolume;
    remaining -= matchedVolume;
  }
  return remaining;
};

const pairAtomicDeals = (executions: NormalizedDealExecution[]): MatchedExecution[] => {
  const openings: OpeningLot[] = [];
  const matches: MatchedExecution[] = [];

  executions.forEach((execution) => {
    if (execution.entry === 'in') {
      openings.push({ execution, remainingVolume: execution.volume });
      return;
    }

    let remaining = execution.volume;
    if (execution.positionTicket) {
      remaining = consumeOpeningLots(openings, execution, remaining, true, matches);
    }
    if (remaining > VOLUME_EPSILON) {
      consumeOpeningLots(openings, execution, remaining, false, matches);
    }
  });

  return matches;
};

const buildCandleTimeline = (
  candles: readonly ChartOverlayCandle[],
  timeframe: string,
): CandleTimeline => {
  const times = [...new Set(candles
    .map((candle) => normalizeTimestampToSeconds(candle.time))
    .filter((time): time is number => time !== null))]
    .sort((left, right) => left - right);

  return {
    times,
    expectedDurationSeconds: getTimeframeSeconds(timeframe),
    isMonthly: normalizeTimeframe(timeframe) === 'MN',
  };
};

const resolveExpectedCandleEnd = (
  candleTime: number,
  timeline: CandleTimeline,
): number => {
  if (!timeline.isMonthly) {
    return candleTime + timeline.expectedDurationSeconds;
  }

  // A month is 28..31 days, so a flat 30-day tail boundary can both hide a
  // January-31 execution and incorrectly pull a March execution into February.
  // Infer the broker's small UTC/session offset from the nearest month start,
  // then carry that same offset to the next real calendar-month boundary.
  const candleDate = new Date(candleTime * 1_000);
  const year = candleDate.getUTCFullYear();
  const month = candleDate.getUTCMonth();
  const candidateMonthStarts = [
    Date.UTC(year, month - 1, 1) / 1_000,
    Date.UTC(year, month, 1) / 1_000,
    Date.UTC(year, month + 1, 1) / 1_000,
  ];
  let nearestMonthStart = candidateMonthStarts[0];
  for (let index = 1; index < candidateMonthStarts.length; index += 1) {
    if (
      Math.abs(candidateMonthStarts[index] - candleTime)
      < Math.abs(nearestMonthStart - candleTime)
    ) {
      nearestMonthStart = candidateMonthStarts[index];
    }
  }

  const nearestDate = new Date(nearestMonthStart * 1_000);
  const nextMonthStart = Date.UTC(
    nearestDate.getUTCFullYear(),
    nearestDate.getUTCMonth() + 1,
    1,
  ) / 1_000;
  return nextMonthStart + (candleTime - nearestMonthStart);
};

const alignExecutionToLoadedCandle = (
  executionTime: number,
  timeline: CandleTimeline,
): number | null => {
  if (!timeline.times.length || !Number.isFinite(executionTime)) return null;

  // Broker sessions are allowed to shift a candle away from the canonical UTC
  // boundary. Find the latest real loaded candle at or before the execution,
  // then verify that the execution is still inside that candle's actual
  // interval. This works for M1 through monthly data without ever snapping an
  // event onto a future candle or across a closed-market history gap.
  let low = 0;
  let high = timeline.times.length - 1;
  let candidateIndex = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (timeline.times[middle] <= executionTime) {
      candidateIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (candidateIndex < 0) return null;

  const candleTime = timeline.times[candidateIndex];
  const nextCandleTime = timeline.times[candidateIndex + 1];
  const expectedEnd = resolveExpectedCandleEnd(candleTime, timeline);
  const nextGap = nextCandleTime === undefined ? null : nextCandleTime - candleTime;
  const hasPlausibleNextBoundary = nextGap !== null
    && nextGap > 0
    && nextGap <= timeline.expectedDurationSeconds * 1.5;
  const candleEnd = hasPlausibleNextBoundary ? nextCandleTime : expectedEnd;
  return executionTime < candleEnd ? candleTime : null;
};

const buildExecutionMarker = (
  execution: NormalizedDealExecution,
  role: 'open' | 'close',
  alignedTime: number,
  buyColor: string,
  sellColor: string,
): ChartOverlayMarker => {
  const isBuy = execution.action === 'buy';
  return {
    id: `trade-history-${role}-${execution.identity}`,
    time: alignedTime,
    price: execution.price,
    position: isBuy ? 'atPriceBottom' : 'atPriceTop',
    shape: isBuy ? 'arrowUp' : 'arrowDown',
    color: isBuy ? buyColor : sellColor,
    size: 2,
  };
};

const fallbackTradeSignature = (
  side: TradeAction,
  openTime: number,
  openPrice: number,
  closeTime: number,
  closePrice: number,
): string => [
  side,
  openTime,
  numberIdentity(openPrice),
  closeTime,
  numberIdentity(closePrice),
].join('|');

const fallbackOpeningSignature = (
  positionTicket: string | null,
  side: TradeAction,
  openTime: number,
  openPrice: number,
): string => [positionTicket ?? 'no-position', side, openTime, numberIdentity(openPrice)].join('|');

const fallbackOpeningLocationSignature = (
  side: TradeAction,
  openTime: number,
  openPrice: number,
): string => [side, openTime, numberIdentity(openPrice)].join('|');

const positionCloseSignature = (
  positionTicket: string,
  side: TradeAction,
  closeTime: number,
  closePrice: number,
): string => [positionTicket, side, closeTime, numberIdentity(closePrice)].join('|');

const sortOverlayResult = (result: ChartTradeHistoryOverlay): ChartTradeHistoryOverlay => ({
  markers: result.markers.sort((left, right) => {
    if (left.time !== right.time) return left.time - right.time;
    const leftPrice = left.price ?? 0;
    const rightPrice = right.price ?? 0;
    if (leftPrice !== rightPrice) return leftPrice - rightPrice;
    return left.id.localeCompare(right.id);
  }),
  tradeHistorySegments: result.tradeHistorySegments.sort((left, right) => {
    if (left.fromTime !== right.fromTime) return left.fromTime - right.fromTime;
    if (left.toTime !== right.toTime) return left.toTime - right.toTime;
    return left.id.localeCompare(right.id);
  }),
});

/**
 * Builds MT5-style execution arrows and dotted entry-to-exit paths.
 *
 * Atomic deals are the source of truth when a completed pair is available.
 * Closed-position rows fill only positions for which the deal feed did not
 * provide a usable pair. Events outside the currently loaded candle range are
 * omitted rather than snapped onto the first or last visible candle.
 */
export const buildChartTradeHistoryOverlay = ({
  chartSymbol,
  chartTimeframe,
  candles,
  openPositions = [],
  deals = [],
  closedPositions = [],
  buyColor,
  sellColor,
}: BuildChartTradeHistoryOverlayInput): ChartTradeHistoryOverlay => {
  if (!candles.length) return { markers: [], tradeHistorySegments: [] };

  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
  if (!normalizedChartSymbol) return { markers: [], tradeHistorySegments: [] };

  const timeline = buildCandleTimeline(candles, chartTimeframe);
  if (timeline.times.length === 0) return { markers: [], tradeHistorySegments: [] };

  const result: ChartTradeHistoryOverlay = { markers: [], tradeHistorySegments: [] };
  const markerIds = new Set<string>();
  const segmentIds = new Set<string>();
  const pairedPositionCloseSignatures = new Set<string>();
  const pairedOpeningSignatures = new Set<string>();
  const pairedOpeningLocationSignatures = new Set<string>();
  const atomicOpeningPositionTickets = new Set<string>();
  const pairedFallbackSignatures = new Set<string>();
  const normalizedDeals = normalizeDealExecutions(deals ?? [], normalizedChartSymbol);

  normalizedDeals.forEach((execution) => {
    if (execution.entry !== 'in') return;
    if (execution.positionTicket) {
      atomicOpeningPositionTickets.add(execution.positionTicket);
    }
    pairedOpeningSignatures.add(fallbackOpeningSignature(
      execution.positionTicket,
      execution.action,
      execution.time,
      execution.price,
    ));
    pairedOpeningLocationSignatures.add(fallbackOpeningLocationSignature(
      execution.action,
      execution.time,
      execution.price,
    ));
  });

  // Keep the live-position opening as a temporary execution source. This is
  // what preserves the entry arrow during the close handoff when the position
  // disappears before the broker's history endpoint publishes both deals.
  const retainedOpeningExecutions = normalizeOpenPositionExecutions(
    openPositions ?? [],
    normalizedChartSymbol,
  ).filter((execution) => (
    execution.positionTicket
      ? !atomicOpeningPositionTickets.has(execution.positionTicket)
      : !pairedOpeningLocationSignatures.has(fallbackOpeningLocationSignature(
        execution.action,
        execution.time,
        execution.price,
      ))
  ));
  retainedOpeningExecutions.forEach((execution) => {
    pairedOpeningSignatures.add(fallbackOpeningSignature(
      execution.positionTicket,
      execution.action,
      execution.time,
      execution.price,
    ));
    pairedOpeningLocationSignatures.add(fallbackOpeningLocationSignature(
      execution.action,
      execution.time,
      execution.price,
    ));
  });
  const atomicMatches = pairAtomicDeals(
    [...normalizedDeals, ...retainedOpeningExecutions].sort(compareNormalizedExecutions),
  );

  // An execution arrow does not depend on the trade being closed. MT5 paints
  // the entry arrow as soon as an entry_in deal exists, then adds the exit
  // arrow and connector later. Pairing below is therefore only responsible
  // for finite entry-to-exit connector geometry.
  normalizedDeals.forEach((execution) => {
    const alignedTime = alignExecutionToLoadedCandle(execution.time, timeline);
    if (alignedTime === null) return;
    const marker = buildExecutionMarker(
      execution,
      execution.entry === 'in' ? 'open' : 'close',
      alignedTime,
      buyColor,
      sellColor,
    );
    if (!markerIds.has(marker.id)) {
      markerIds.add(marker.id);
      result.markers.push(marker);
    }
  });

  retainedOpeningExecutions.forEach((execution) => {
    const alignedTime = alignExecutionToLoadedCandle(execution.time, timeline);
    if (alignedTime === null) return;
    const marker = buildExecutionMarker(
      execution,
      'open',
      alignedTime,
      buyColor,
      sellColor,
    );
    if (!markerIds.has(marker.id)) {
      markerIds.add(marker.id);
      result.markers.push(marker);
    }
  });

  atomicMatches.forEach(({ opening, closing }) => {
    const openingTime = alignExecutionToLoadedCandle(opening.time, timeline);
    const closingTime = alignExecutionToLoadedCandle(closing.time, timeline);
    const positionTicket = opening.positionTicket ?? closing.positionTicket;
    if (positionTicket) {
      pairedPositionCloseSignatures.add(positionCloseSignature(
        positionTicket,
        opening.action,
        closing.time,
        closing.price,
      ));
    }
    pairedOpeningSignatures.add(fallbackOpeningSignature(
      positionTicket,
      opening.action,
      opening.time,
      opening.price,
    ));
    pairedOpeningLocationSignatures.add(fallbackOpeningLocationSignature(
      opening.action,
      opening.time,
      opening.price,
    ));
    pairedFallbackSignatures.add(fallbackTradeSignature(
      opening.action,
      opening.time,
      opening.price,
      closing.time,
      closing.price,
    ));

    if (openingTime === null || closingTime === null) return;

    const segmentId = `trade-history-segment-${opening.identity}-${closing.identity}`;
    if (segmentIds.has(segmentId)) return;
    segmentIds.add(segmentId);
    result.tradeHistorySegments.push({
      id: segmentId,
      fromTime: openingTime,
      fromPrice: opening.price,
      toTime: closingTime,
      toPrice: closing.price,
      color: opening.action === 'buy' ? buyColor : sellColor,
      lineWidth: TRADE_HISTORY_CONNECTOR_LINE_WIDTH,
    });
  });

  const fallbackRows = new Set<string>();
  (closedPositions ?? []).forEach((position) => {
    const record = position as unknown as Record<string, unknown>;
    const symbol = normalizeChartOverlaySymbol(String(record.symbol ?? ''));
    const side = normalizeAction(record.side);
    const openPrice = toFinitePositiveNumber(record.price_open);
    const closePrice = toFinitePositiveNumber(record.price_close ?? record.price_current);
    const openTime = normalizeTimestampToSeconds(record.time_create);
    // Some broker history adapters expose the terminal close moment only as
    // time_update. Prefer the dedicated close field, then use that documented
    // ClosedPosition fallback so a valid completed trade is not discarded.
    const closeTime = normalizeTimestampToSeconds(record.time_close)
      ?? normalizeTimestampToSeconds(record.time_update);
    if (
      symbol !== normalizedChartSymbol
      || !side
      || openPrice === null
      || closePrice === null
      || openTime === null
      || closeTime === null
      || closeTime < openTime
    ) {
      return;
    }

    const positionTicket = toPositiveIdentifier(record.ticket);
    const signature = fallbackTradeSignature(side, openTime, openPrice, closeTime, closePrice);
    if (
      (positionTicket && pairedPositionCloseSignatures.has(positionCloseSignature(
        positionTicket,
        side,
        closeTime,
        closePrice,
      )))
      || pairedFallbackSignatures.has(signature)
    ) {
      return;
    }

    const volume = toFinitePositiveNumber(record.volume) ?? 0;
    const openingIdentity = [
      'closed-open',
      positionTicket ?? 'no-position',
      symbol,
      side,
      openTime,
      numberIdentity(openPrice),
    ].join('-');
    const closingIdentity = [
      'closed-close',
      positionTicket ?? 'no-position',
      symbol,
      closeTime,
      numberIdentity(closePrice),
      numberIdentity(volume),
    ].join('-');
    const rowIdentity = `${openingIdentity}|${closingIdentity}`;
    if (fallbackRows.has(rowIdentity)) return;
    fallbackRows.add(rowIdentity);

    const alignedOpenTime = alignExecutionToLoadedCandle(openTime, timeline);
    const alignedCloseTime = alignExecutionToLoadedCandle(closeTime, timeline);
    const openingExecution: NormalizedDealExecution = {
      identity: openingIdentity,
      sourceTicket: null,
      positionTicket,
      symbol,
      action: side,
      entry: 'in',
      volume,
      price: openPrice,
      time: openTime,
    };
    const closingExecution: NormalizedDealExecution = {
      identity: closingIdentity,
      sourceTicket: null,
      positionTicket,
      symbol,
      action: oppositeAction(side),
      entry: 'out',
      volume,
      price: closePrice,
      time: closeTime,
    };

    // A ticketed fallback must only reuse the opening arrow for that exact
    // position. Two independent trades can legitimately open at the same
    // second and price. Location-only reuse is reserved for rows whose broker
    // omitted the position ticket, where no stronger identity exists.
    const openingAlreadyRepresented = positionTicket
      ? pairedOpeningSignatures.has(fallbackOpeningSignature(
        positionTicket,
        side,
        openTime,
        openPrice,
      ))
      : pairedOpeningLocationSignatures.has(fallbackOpeningLocationSignature(
        side,
        openTime,
        openPrice,
      ));
    if (alignedOpenTime !== null && !openingAlreadyRepresented) {
      const marker = buildExecutionMarker(
        openingExecution,
        'open',
        alignedOpenTime,
        buyColor,
        sellColor,
      );
      if (!markerIds.has(marker.id)) {
        markerIds.add(marker.id);
        result.markers.push(marker);
      }
    }
    if (alignedCloseTime !== null) {
      const marker = buildExecutionMarker(
        closingExecution,
        'close',
        alignedCloseTime,
        buyColor,
        sellColor,
      );
      if (!markerIds.has(marker.id)) {
        markerIds.add(marker.id);
        result.markers.push(marker);
      }
    }
    if (alignedOpenTime === null || alignedCloseTime === null) return;

    const segmentId = `trade-history-segment-${openingIdentity}-${closingIdentity}`;
    if (segmentIds.has(segmentId)) return;
    segmentIds.add(segmentId);
    result.tradeHistorySegments.push({
      id: segmentId,
      fromTime: alignedOpenTime,
      fromPrice: openPrice,
      toTime: alignedCloseTime,
      toPrice: closePrice,
      color: side === 'buy' ? buyColor : sellColor,
      lineWidth: TRADE_HISTORY_CONNECTOR_LINE_WIDTH,
    });
  });

  return sortOverlayResult(result);
};
