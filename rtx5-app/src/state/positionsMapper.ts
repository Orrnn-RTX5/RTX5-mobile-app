import type { PositionItem } from '../domain/tradingModels';
import { normalizeSymbol } from '../domain/symbols';
import { readBackendNumber } from '../utils/accountCurrency';

export const UNKNOWN_POSITION_SYMBOL = 'UNKNOWN';

function toFiniteNumber(value: unknown): number | undefined {
  return readBackendNumber(value);
}

export function normalizeStateVersion(value: unknown): string | undefined {
  if (typeof value === 'bigint') {
    return value >= 0n ? value.toString(10) : undefined;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return undefined;
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return undefined;
    return trimmed.replace(/^0+(?=\d)/, '');
  }
  return undefined;
}

export function compareStateVersions(a: unknown, b: unknown): number {
  const normA = normalizeStateVersion(a);
  const normB = normalizeStateVersion(b);
  if (normA === undefined || normB === undefined) return 0;
  if (normA === normB) return 0;
  if (normA.length !== normB.length) {
    return normA.length < normB.length ? -1 : 1;
  }
  return normA < normB ? -1 : 1;
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

  if (typeof rawTime === 'number' && Number.isFinite(rawTime) && rawTime > 0) {
    const ms = rawTime > 4.2e10 ? Math.floor(rawTime) : Math.floor(rawTime * 1000);
    const parsed = new Date(ms);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
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

  const incomingStateVersion = normalizeStateVersion(
    source.state_version_text ?? source.state_version ?? source.stateVersion,
  );
  if (
    existing?.stateVersion !== undefined &&
    incomingStateVersion !== undefined &&
    compareStateVersions(incomingStateVersion, existing.stateVersion) < 0
  ) {
    return existing;
  }

  const incomingPriceTimeMsc = toFiniteNumber(source.price_time_msc ?? source.priceTimeMsc);
  const updateKind = toCleanString(source.update_kind ?? source.updateKind)?.toLowerCase();

  if (updateKind === 'pnl' && existing) {
    if (
      incomingPriceTimeMsc !== undefined &&
      existing.priceTimeMsc !== undefined &&
      incomingPriceTimeMsc < existing.priceTimeMsc
    ) {
      return existing;
    }

    const nextCurrentPrice =
      toFiniteNumber(
        source.price_current ?? source.currentPrice ?? source.current_price ?? source.price,
      ) ?? existing.currentPrice;
    const explicitPatchProfit = toFiniteNumber(
      source.profit ??
        source.unrealizedPnL ??
        source.unrealized_pl ??
        source.pnl ??
        source.pl ??
        source.floating,
    );
    const nextPnl =
      explicitPatchProfit !== undefined
        ? explicitPatchProfit + (existing.swap ?? 0) + (existing.commission ?? 0)
        : existing.pnl;
    const nextMargin = toFiniteNumber(
      source.used_margin ?? source.margin_used ?? source.margin,
    );

    return {
      ...existing,
      currentPrice: nextCurrentPrice,
      pnl: nextPnl,
      pnlReported: explicitPatchProfit !== undefined ? true : existing.pnlReported,
      pnl_available: true,
      hasBackendProfit: true,
      hasBackendCurrentPrice: true,
      ...(nextMargin !== undefined && nextMargin >= 0
        ? { margin: nextMargin, hasBackendMargin: true }
        : {}),
      ...(incomingPriceTimeMsc !== undefined ? { priceTimeMsc: incomingPriceTimeMsc } : {}),
      ...(incomingStateVersion !== undefined
        ? { stateVersion: incomingStateVersion }
        : existing.stateVersion !== undefined
          ? { stateVersion: existing.stateVersion }
          : {}),
      updateKind: 'pnl',
    };
  }

  const swap = toFiniteNumber(source.swap ?? source.storage) ?? existing?.swap ?? 0;
  const commission = toFiniteNumber(source.commission) ?? existing?.commission ?? 0;
  const existingBaseProfit = existing
    ? existing.pnl - (existing.swap ?? 0) - (existing.commission ?? 0)
    : 0;
  const explicitProfit = toFiniteNumber(
    source.profit ?? source.unrealizedPnL ?? source.unrealized_pl,
  );
  const netProfitAlias = toFiniteNumber(source.pnl ?? source.pl ?? source.floating);
  const isAlreadyMappedItem =
    source.openPrice !== undefined &&
    source.currentPrice !== undefined &&
    source.profit === undefined &&
    source.unrealizedPnL === undefined &&
    source.unrealized_pl === undefined;
  const baseProfit =
    explicitProfit ??
    (netProfitAlias !== undefined
      ? (isAlreadyMappedItem ? netProfitAlias - swap - commission : netProfitAlias)
      : existingBaseProfit);

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

  const margin = toFiniteNumber(source.used_margin ?? source.margin_used ?? source.margin) ?? existing?.margin;
  const contractSize = toFiniteNumber(source.contractSize ?? source.contract_size) ?? existing?.contractSize;
  const stateVersion = incomingStateVersion ?? existing?.stateVersion;
  const priceTimeMsc = incomingPriceTimeMsc ?? existing?.priceTimeMsc;

  return {
    id,
    symbol,
    side,
    volume: toFiniteNumber(source.volume ?? source.volume_lots ?? source.quantity) ?? existing?.volume ?? 0,
    openPrice,
    currentPrice,
    pnl: baseProfit + swap + commission,
    pnlReported:
      source.pnlReported === false || source.pnl_available === false || source.hasBackendProfit === false
        ? false
        : toFiniteNumber(
              source.profit ??
                source.unrealizedPnL ??
                source.unrealized_pl ??
                source.pnl ??
                source.pl ??
                source.floating,
            ) !== undefined
          ? true
          : existing?.pnlReported ?? false,
    swap,
    commission,
    ...(margin !== undefined && margin >= 0 ? { margin } : {}),
    ...(contractSize !== undefined && contractSize > 0 ? { contractSize } : {}),
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
    ...(stateVersion !== undefined ? { stateVersion } : {}),
    ...(priceTimeMsc !== undefined ? { priceTimeMsc } : {}),
    ...(updateKind !== undefined ? { updateKind } : {}),
    ...(typeof source.pnl_available === 'boolean' ? { pnl_available: source.pnl_available } : {}),
    ...(typeof source.hasBackendProfit === 'boolean' ? { hasBackendProfit: source.hasBackendProfit } : {}),
    ...(typeof source.hasBackendMargin === 'boolean' ? { hasBackendMargin: source.hasBackendMargin } : {}),
    ...(typeof source.hasBackendCurrentPrice === 'boolean'
      ? { hasBackendCurrentPrice: source.hasBackendCurrentPrice }
      : {}),
    clientCreatedAt: existing?.clientCreatedAt,
    clientModifiedAt: existing?.clientModifiedAt,
  };
}
