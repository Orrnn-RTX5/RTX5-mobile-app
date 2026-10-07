import type { PositionItem } from '../dev/mock/tradingData';
import { normalizeSymbol } from '../domain/symbols';

export const UNKNOWN_POSITION_SYMBOL = 'UNKNOWN';

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

function toCleanString(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  if (
    normalized === 'undefined' ||
    normalized === 'null' ||
    normalized === 'nan' ||
    normalized === 'unknown' ||
    normalized === 'unknow' ||
    normalized === 'n/a' ||
    normalized === 'na' ||
    normalized === '--' ||
    normalized === '---'
  ) {
    return undefined;
  }

  return trimmed;
}

function resolveProtectionLevel(
  source: Record<string, unknown>,
  keys: readonly string[],
  existingValue: number | undefined,
  preserveMissing: boolean,
): number {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }

    const value = source[key];
    // Canonical REST snapshots may use null for an unset SL/TP. Treat an
    // explicit null/blank as a cleared level, while omitted fields in sparse
    // websocket updates continue to preserve the current value.
    if (value === null || value === '') {
      return 0;
    }

    const parsed = toFiniteNumber(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return preserveMissing ? (existingValue ?? 0) : 0;
}

type MapPositionOptions = Readonly<{
  preserveMissingProtection?: boolean;
}>;

export function isRenderablePositionSymbol(symbol: unknown): boolean {
  return toCleanString(symbol) !== undefined;
}

function resolvePositionSymbol(source: Record<string, unknown>, existing?: PositionItem): string {
  const rawSymbol =
    toCleanString(source.symbol) ??
    toCleanString(source.Symbol) ??
    toCleanString(source.instrument) ??
    toCleanString(source.symbol_name) ??
    toCleanString(existing?.symbol);

  if (!rawSymbol) {
    return UNKNOWN_POSITION_SYMBOL;
  }

  return normalizeSymbol(rawSymbol) || rawSymbol;
}

function resolveOpenTime(dto: Record<string, unknown>, existing?: PositionItem): string {
  const rawTime = dto.time_create ?? dto.openTime;

  if (typeof rawTime === 'number' && Number.isFinite(rawTime)) {
    return new Date(rawTime * 1000).toISOString();
  }

  if (typeof rawTime === 'string' && rawTime.trim() !== '') {
    const parsed = new Date(rawTime);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return existing?.openTime ?? new Date().toISOString();
}

function buildStableFallbackId(dto: Record<string, unknown>, existing?: PositionItem): string {
  if (existing?.id) {
    return existing.id;
  }

  const symbol = resolvePositionSymbol(dto, existing);
  return `pos_${symbol}_${dto.side || 'na'}_${dto.time_create || dto.openTime || 0}_${dto.volume || 0}_${dto.price_open || dto.openPrice || 0}`;
}

export function mapPositionToItem(
  dto: unknown,
  existing?: PositionItem,
  options: MapPositionOptions = { preserveMissingProtection: true },
): PositionItem {
  const source =
    dto && typeof dto === 'object'
      ? (dto as Record<string, unknown>)
      : {};

  const swap = toFiniteNumber(source.swap) ?? existing?.swap ?? 0;
  const commission = toFiniteNumber(source.commission) ?? existing?.commission ?? 0;
  const existingBaseProfit = existing
    ? existing.pnl - (existing.swap ?? 0) - (existing.commission ?? 0)
    : 0;
  const baseProfit =
    toFiniteNumber(source.profit ?? source.pnl ?? source.pl ?? source.floating) ??
    existingBaseProfit;

  const openPrice =
    toFiniteNumber(source.price_open ?? source.openPrice ?? source.open_price) ??
    existing?.openPrice ??
    0;

  const currentPrice =
    toFiniteNumber(source.price_current ?? source.currentPrice ?? source.current_price ?? source.price) ??
    existing?.currentPrice ??
    openPrice;

  const id = String(
    source.ticket ??
    source.position_ticket ??
    source.order_ticket ??
    source.id ??
    buildStableFallbackId(source, existing),
  );
  const rawSide = String(source.side ?? source.type ?? existing?.side ?? '').toLowerCase();
  const side = rawSide === 'sell' ? 'sell' : rawSide === 'buy' ? 'buy' : (existing?.side ?? 'buy');
  const symbol = resolvePositionSymbol(source, existing);

  return {
    id,
    symbol,
    side,
    volume: toFiniteNumber(source.volume) ?? existing?.volume ?? 0,
    openPrice,
    currentPrice,
    pnl: baseProfit + swap + commission,
    swap,
    commission,
    openTime: resolveOpenTime(source, existing),
    sl: resolveProtectionLevel(
      source,
      ['price_sl', 'sl'],
      existing?.sl,
      options.preserveMissingProtection !== false,
    ),
    tp: resolveProtectionLevel(
      source,
      ['price_tp', 'tp'],
      existing?.tp,
      options.preserveMissingProtection !== false,
    ),
    clientCreatedAt: existing?.clientCreatedAt,
    clientModifiedAt: existing?.clientModifiedAt,
  };
}
