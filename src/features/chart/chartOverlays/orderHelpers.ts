/**
 * Helpers for normalising order types/statuses and formatting overlay labels.
 */
import type { LoginOrder } from '../../../api/orders';
import { inferContractSize, resolvePointSize } from './symbolUtils';
import { TERMINAL_ORDER_STATUSES } from './types';

export const toUpper = (value: string): string => value.trim().toUpperCase();

export const formatPositionVolumeLabel = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2) : '0.00';

export const formatSignedUsdOverlayLabel = (value: number): string => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const normalizedValue = Object.is(safeValue, -0) ? 0 : safeValue;
  const sign = normalizedValue > 0 ? '+' : normalizedValue < 0 ? '-' : '';

  return `${sign}${Math.abs(normalizedValue).toFixed(2)} USD`;
};

export const formatOpenPositionOverlayLabel = (
  side: 'buy' | 'sell',
  volume: number,
  pnl: number,
): string =>
  `${side === 'sell' ? 'SELL' : 'BUY'} ${formatPositionVolumeLabel(volume)}, ${formatSignedUsdOverlayLabel(pnl)}`;

type OpenPositionLivePnlInput = {
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  bid?: number | null;
  ask?: number | null;
  swap?: number | null;
  commission?: number | null;
};

const toFiniteOrZero = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export const calculateOpenPositionLivePnl = ({
  symbol,
  side,
  volume,
  openPrice,
  bid,
  ask,
  swap,
  commission,
}: OpenPositionLivePnlInput): number | null => {
  const safeOpenPrice = Number(openPrice);
  const safeVolume = Number(volume);
  const closePrice = Number(side === 'sell' ? ask ?? bid : bid ?? ask);

  if (
    !Number.isFinite(safeOpenPrice) ||
    safeOpenPrice <= 0 ||
    !Number.isFinite(safeVolume) ||
    safeVolume <= 0 ||
    !Number.isFinite(closePrice) ||
    closePrice <= 0
  ) {
    return null;
  }

  const contractSize = inferContractSize(symbol);
  const directionMultiplier = side === 'sell' ? -1 : 1;
  const grossPnl = (closePrice - safeOpenPrice) * directionMultiplier * contractSize * safeVolume;

  return grossPnl + toFiniteOrZero(swap) + toFiniteOrZero(commission);
};

type PositionTargetPnlInput = {
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  entryPrice: number;
  targetPrice: number;
};

export const calculatePositionTargetPnl = ({
  symbol,
  side,
  volume,
  entryPrice,
  targetPrice,
}: PositionTargetPnlInput): number | null => {
  const safeEntryPrice = Number(entryPrice);
  const safeTargetPrice = Number(targetPrice);
  const safeVolume = Number(volume);

  if (
    !Number.isFinite(safeEntryPrice) ||
    safeEntryPrice <= 0 ||
    !Number.isFinite(safeTargetPrice) ||
    safeTargetPrice <= 0 ||
    !Number.isFinite(safeVolume) ||
    safeVolume <= 0
  ) {
    return null;
  }

  const directionMultiplier = side === 'sell' ? -1 : 1;
  return (
    (safeTargetPrice - safeEntryPrice) *
    directionMultiplier *
    inferContractSize(symbol) *
    safeVolume
  );
};

export const formatTpSlOverlayValueLabel = (
  symbol: string,
  side: 'buy' | 'sell',
  entryPrice: number,
  targetPrice: number,
  volume: number,
): string => {
  const projectedPnl = calculatePositionTargetPnl({
    symbol,
    side,
    volume,
    entryPrice,
    targetPrice,
  });
  if (projectedPnl === null) {
    return '';
  }

  const pointSize = resolvePointSize(symbol);
  const pointDistance = Math.max(
    1,
    Math.round(Math.abs(targetPrice - entryPrice) / pointSize),
  );
  const normalizedPnl = Object.is(projectedPnl, -0) ? 0 : projectedPnl;
  const sign = normalizedPnl > 0 ? '+' : normalizedPnl < 0 ? '-' : '';
  const signedUsd = `${sign}${sign ? ' ' : ''}${Math.abs(normalizedPnl).toFixed(2)} USD`;

  return `${signedUsd}, ${pointDistance} points`;
};

export const formatTpSlOverlayLabel = (
  kind: 'tp' | 'sl',
  symbol: string,
  side: 'buy' | 'sell',
  entryPrice: number,
  targetPrice: number,
  volume: number,
): string => {
  const valueLabel = formatTpSlOverlayValueLabel(
    symbol,
    side,
    entryPrice,
    targetPrice,
    volume,
  );
  if (!valueLabel) {
    return kind.toUpperCase();
  }

  return `${kind.toUpperCase()}, ${valueLabel}`;
};

export const normalizeOrderType = (value: string | undefined): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

export const normalizeOrderStatus = (value: string | undefined): string =>
  toUpper(
    String(value ?? '')
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' '),
  );

export const isPendingOrderType = (value: string): boolean =>
  value.includes('limit') || value.includes('stop');

export const isActivePendingOrder = (order: LoginOrder): boolean => {
  const normalizedType = normalizeOrderType(order.type);
  if (!isPendingOrderType(normalizedType)) return false;

  const normalizedStatus = normalizeOrderStatus(order.status);
  return !TERMINAL_ORDER_STATUSES.has(normalizedStatus);
};

export const buildPendingOrderLabel = (order: LoginOrder): string => {
  const normalizedType = normalizeOrderType(order.type);
  const upperType = toUpper(normalizedType);
  const side = toUpper(order.side);
  const typeLabel =
    upperType.includes('BUY') || upperType.includes('SELL')
      ? upperType
      : `${side} ${upperType || 'ORDER'}`;

  return `${typeLabel} ${formatPositionVolumeLabel(Number(order.volume))}`.trim();
};
