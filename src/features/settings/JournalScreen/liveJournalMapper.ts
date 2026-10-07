import type { ClosedPosition } from '../../../api/positions';
import type { PositionItem } from '../../../dev/mock/tradingData';
import type {
  MarketType,
  TradeCloseType,
  TradeDirection,
  TradeJournalEntry,
  TradeResult,
  TradingSession,
} from './types';
import { getJournalEntryTime } from './journalRetention';

const UNKNOWN_LIVE_HISTORY_TEXT = 'Imported from account closed-position history.';

type ClosedPositionRecord = ClosedPosition & Record<string, unknown>;

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function pickFiniteNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = toFiniteNumber(source[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function pickTrimmedString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function normalizeTimestampToMs(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  let numeric: number | null = null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    numeric = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsedNumber = Number(trimmed);
    if (Number.isFinite(parsedNumber)) {
      numeric = parsedNumber;
    } else {
      const parsedDate = Date.parse(trimmed.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3').replace(' ', 'T'));
      return Number.isFinite(parsedDate) ? parsedDate : null;
    }
  }

  if (numeric === null || numeric <= 0) {
    return null;
  }

  if (numeric > 4.2e16) return Math.floor(numeric / 1_000_000);
  if (numeric > 4.2e13) return Math.floor(numeric / 1_000);
  if (numeric > 4.2e10) return Math.floor(numeric);
  return Math.floor(numeric * 1000);
}

function pickTimestampMs(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const timeMs = normalizeTimestampToMs(source[key]);
    if (timeMs !== null) {
      return timeMs;
    }
  }

  return null;
}

function resolveClosedPositionNetProfit(position: ClosedPositionRecord): number {
  const netProfit = pickFiniteNumber(position, ['netPnl', 'net_pnl', 'net_profit']);
  if (netProfit !== undefined) {
    return netProfit;
  }

  const profit = pickFiniteNumber(position, ['profit', 'pnl', 'pl', 'close_profit', 'closed_profit']) ?? 0;
  const swap = pickFiniteNumber(position, ['swap', 'swaps']) ?? 0;
  const commission = pickFiniteNumber(position, ['commission', 'commissions']) ?? 0;
  const fee = pickFiniteNumber(position, ['fee', 'fees']) ?? 0;

  return profit + swap + commission + fee;
}

function resolveTradeDirection(position: ClosedPositionRecord): TradeDirection {
  const side = pickTrimmedString(position, ['side', 'type', 'order_type', 'action', 'cmd'])?.toLowerCase() ?? '';
  return side.includes('sell') ? 'Sell' : 'Buy';
}

function resolveTradeResult(netProfit: number): TradeResult {
  if (netProfit > 0) return 'Win';
  if (netProfit < 0) return 'Loss';
  return 'Breakeven';
}

function inferMarketType(symbol: string): MarketType {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^(XAU|XAG|GOLD|SILVER)/.test(normalized)) return 'Gold/Metals';
  if (/^(BTC|ETH|LTC|XRP|SOL|DOGE|ADA|BNB)/.test(normalized)) return 'Crypto';
  if (/(US30|NAS100|NASDAQ|SPX|SP500|GER40|DAX|UK100|JP225|HK50)/.test(normalized)) return 'Indices';
  if (/^[A-Z]{1,5}\d*$/.test(normalized)) return 'Stocks';
  return 'Forex';
}

function inferTradingSession(timestampMs: number): TradingSession {
  if (timestampMs <= 0) {
    return 'Out of Session';
  }

  const hour = new Date(timestampMs).getUTCHours();
  if (hour >= 0 && hour < 7) return 'Asian';
  if (hour >= 7 && hour < 12) return 'London';
  if (hour >= 12 && hour < 16) return 'Overlap';
  if (hour >= 16 && hour < 21) return 'New York';
  return 'Out of Session';
}

function almostEqual(left: number | undefined, right: number | undefined): boolean {
  if (left === undefined || right === undefined) {
    return false;
  }

  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}

function resolveCloseType(
  exitPrice: number | undefined,
  stopLoss: number | undefined,
  takeProfit: number | undefined,
): TradeCloseType {
  if (almostEqual(exitPrice, takeProfit)) return 'TP Hit';
  if (almostEqual(exitPrice, stopLoss)) return 'SL Hit';
  return 'Manual Close';
}

function resolvePriceRMultiple(
  direction: TradeDirection,
  entryPrice: number | undefined,
  exitPrice: number | undefined,
  stopLoss: number | undefined,
): number | undefined {
  if (entryPrice === undefined || exitPrice === undefined || stopLoss === undefined) {
    return undefined;
  }

  const priceRisk = Math.abs(entryPrice - stopLoss);
  if (priceRisk <= 0) {
    return undefined;
  }

  const priceMove = direction === 'Buy'
    ? exitPrice - entryPrice
    : entryPrice - exitPrice;

  return priceMove / priceRisk;
}

function resolveRewardToRiskRatio(
  direction: TradeDirection,
  entryPrice: number | undefined,
  stopLoss: number | undefined,
  takeProfit: number | undefined,
): number | undefined {
  if (entryPrice === undefined || stopLoss === undefined || takeProfit === undefined) {
    return undefined;
  }

  const risk = Math.abs(entryPrice - stopLoss);
  if (risk <= 0) {
    return undefined;
  }

  const reward = direction === 'Buy'
    ? takeProfit - entryPrice
    : entryPrice - takeProfit;

  return reward > 0 ? reward / risk : undefined;
}

function buildLiveJournalId(position: ClosedPositionRecord, timestampMs: number): string {
  const ticket = pickTrimmedString(position, ['ticket', 'position_ticket', 'positionTicket', 'order_ticket', 'orderTicket', 'id'])
    ?? 'unknown';
  const symbol = pickTrimmedString(position, ['symbol', 'Symbol', 'instrument', 'name']) ?? 'symbol';
  const volume = pickFiniteNumber(position, ['volume', 'lots', 'lot', 'volume_closed', 'volumeClosed']) ?? 0;
  const closePrice =
    pickFiniteNumber(position, ['price_close', 'priceClose', 'close_price', 'closePrice', 'close']) ??
    pickFiniteNumber(position, ['price_current', 'priceCurrent', 'current_price', 'currentPrice', 'price']) ??
    0;
  const timestampSeconds = timestampMs > 0 ? Math.floor(timestampMs / 1000) : 'unknown-time';

  return `live-${ticket}-${symbol}-${timestampSeconds}-${volume}-${closePrice}`;
}

export function mapClosedPositionToJournalEntry(position: ClosedPosition): TradeJournalEntry {
  const source = position as ClosedPositionRecord;
  const closeTimeMs =
    pickTimestampMs(source, ['time_close', 'timeClose', 'close_time', 'closeTime', 'time_done', 'timeDone', 'closed_at', 'time']) ??
    pickTimestampMs(source, ['time_update', 'timeUpdate', 'updated_at']) ??
    pickTimestampMs(source, ['time_create', 'timeCreate', 'open_time', 'openTime', 'time_open', 'timeOpen', 'created_at']) ??
    0;
  const openTimeMs =
    pickTimestampMs(source, ['time_create', 'timeCreate', 'open_time', 'openTime', 'time_open', 'timeOpen', 'created_at']) ??
    closeTimeMs;
  const dateIso = new Date(closeTimeMs).toISOString();
  const symbol = pickTrimmedString(source, ['symbol', 'Symbol', 'instrument', 'name']) ?? '';
  const direction = resolveTradeDirection(source);
  const entryPrice = pickFiniteNumber(source, ['price_open', 'priceOpen', 'open_price', 'openPrice', 'open']);
  const exitPrice =
    pickFiniteNumber(source, ['price_close', 'priceClose', 'close_price', 'closePrice', 'close']) ??
    pickFiniteNumber(source, ['price_current', 'priceCurrent', 'current_price', 'currentPrice', 'price']);
  const stopLoss = pickFiniteNumber(source, ['price_sl', 'priceSl', 'stop_loss', 'stopLoss', 'sl']);
  const takeProfit = pickFiniteNumber(source, ['price_tp', 'priceTp', 'take_profit', 'takeProfit', 'tp']);
  const lotSize = pickFiniteNumber(source, ['volume', 'lots', 'lot', 'volume_closed', 'volumeClosed']);
  const netProfit = resolveClosedPositionNetProfit(source);
  const finalRMultiple = resolvePriceRMultiple(direction, entryPrice, exitPrice, stopLoss);
  const rewardToRiskRatio = resolveRewardToRiskRatio(direction, entryPrice, stopLoss, takeProfit);
  const comment = pickTrimmedString(source, ['comment', 'reason', 'description']);
  const riskAmount = finalRMultiple !== undefined && finalRMultiple !== 0
    ? Math.abs(netProfit / finalRMultiple)
    : undefined;

  return {
    id: buildLiveJournalId(source, closeTimeMs),
    createdAt: new Date(openTimeMs).toISOString(),
    date: dateIso,
    session: inferTradingSession(closeTimeMs),
    market: inferMarketType(symbol),
    symbol,
    tradeType: direction,
    strategy: 'Custom',
    entryPrice,
    stopLoss,
    takeProfit,
    exitPrice,
    lotSize,
    riskAmount,
    rewardToRiskRatio,
    pnlMoney: netProfit,
    finalRMultiple,
    result: resolveTradeResult(netProfit),
    entryReason: comment ?? UNKNOWN_LIVE_HISTORY_TEXT,
    closeType: resolveCloseType(exitPrice, stopLoss, takeProfit),
    followedPlan: 'Partial',
    disciplineScore: 0,
    brokeRule: false,
    didRight: '',
    didWrong: '',
    improveNextTime: '',
    mainLesson: comment ?? '',
  };
}

export function mapOpenPositionToJournalEntry(position: PositionItem, snapshotAt = Date.now()): TradeJournalEntry {
  const openedAtMs = normalizeTimestampToMs(position.openTime) ?? snapshotAt;
  const openedAtIso = new Date(openedAtMs).toISOString();
  const direction: TradeDirection = position.side === 'sell' ? 'Sell' : 'Buy';
  const stopLoss = position.sl && position.sl > 0 ? position.sl : undefined;
  const takeProfit = position.tp && position.tp > 0 ? position.tp : undefined;

  return {
    id: `open-${position.id}-${position.symbol}-${openedAtMs}`,
    createdAt: openedAtIso,
    date: new Date(snapshotAt).toISOString(),
    session: inferTradingSession(openedAtMs),
    market: inferMarketType(position.symbol),
    symbol: position.symbol,
    tradeType: direction,
    strategy: 'Custom',
    entryPrice: position.openPrice,
    stopLoss,
    takeProfit,
    exitPrice: position.currentPrice,
    lotSize: position.volume,
    pnlMoney: position.pnl,
    result: 'Open',
    followedPlan: 'Partial',
    disciplineScore: 0,
    brokeRule: false,
  };
}

export function mergeJournalEntries(
  liveEntries: TradeJournalEntry[],
  manualEntries: TradeJournalEntry[],
): TradeJournalEntry[] {
  return [...manualEntries, ...liveEntries].sort((left, right) => {
    const byDate = getJournalEntryTime(right) - getJournalEntryTime(left);
    if (byDate !== 0) return byDate;
    return left.id.localeCompare(right.id);
  });
}
