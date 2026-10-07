import type { PositionItem } from '../../dev/mock/tradingData';
import type { ChartOverlayCandle } from './chartOverlays';

/**
 * Live position pushes replace currentPrice/P&L on every tick. Those fields do
 * not change chart-line geometry, so they must not wake the full Chart screen.
 */
export const buildChartPositionStructuralSignature = (
  positions: readonly PositionItem[],
): string => JSON.stringify(
  positions.map((position) => [
    position.id,
    position.symbol,
    position.side,
    position.volume,
    position.openPrice,
    position.swap,
    position.commission ?? null,
    position.openTime,
    position.sl ?? null,
    position.tp ?? null,
    position.clientCreatedAt ?? null,
    position.clientModifiedAt ?? null,
  ]),
);

/**
 * Closed-trade marker placement uses candle times only. Hashing that structure
 * lets the host retain one marker-input array while the forming candle's OHLC
 * body changes tick by tick.
 */
export const buildChartMarkerCandleTimeSignature = (
  candles: readonly ChartOverlayCandle[],
): string => {
  let hash = 2_166_136_261;
  for (const candle of candles) {
    const time = Number(candle.time);
    const low = Number.isFinite(time) ? time >>> 0 : 0;
    const high = Number.isFinite(time) ? Math.floor(time / 0x1_0000_0000) >>> 0 : 0;
    hash = Math.imul(hash ^ low, 16_777_619) >>> 0;
    hash = Math.imul(hash ^ high, 16_777_619) >>> 0;
  }

  return `${candles.length}:${candles[0]?.time ?? ''}:${candles[candles.length - 1]?.time ?? ''}:${hash}`;
};
