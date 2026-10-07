/** Geometry for the watchlist's symbol column and two bounded price columns. */
export function resolveQuoteCardLayout(availableWidth: number, fontScale = 1) {
  const width = Number.isFinite(availableWidth) ? Math.max(1, availableWidth) : 1;
  const textScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const compact = width / textScale < 360;
  const horizontalPadding = compact ? 12 : 16;
  // The list has 16dp gutters and each card has a 1dp border.
  const contentWidth = Math.max(1, width - 32 - 2 - horizontalPadding * 2);
  const columnGap = 8;
  const priceGap = compact ? 8 : 12;
  const minimumSymbolWidth = 100 * textScale;
  const minimumPriceWidth = 64 * textScale;
  const stacked = contentWidth < minimumSymbolWidth + minimumPriceWidth * 2 + columnGap + priceGap;
  const priceColumnWidth = stacked
    ? Math.max(1, (contentWidth - priceGap) / 2)
    : Math.min(68 * textScale, (contentWidth - minimumSymbolWidth - columnGap - priceGap) / 2);

  return { compact, stacked, horizontalPadding, contentWidth, columnGap, priceGap, priceColumnWidth };
}

export type QuoteCardLayout = ReturnType<typeof resolveQuoteCardLayout>;
