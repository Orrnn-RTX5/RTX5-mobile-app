type QuotePriceSnapshot = {
  bid?: unknown;
  ask?: unknown;
  bidHigh?: unknown;
  bidLow?: unknown;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

export const hasQuotePriceChange = (
  existing: QuotePriceSnapshot | undefined,
  next: QuotePriceSnapshot,
): boolean => {
  const nextBid = toFiniteNumber(next.bid);
  const nextAsk = toFiniteNumber(next.ask);

  if (!existing) {
    return nextBid !== undefined || nextAsk !== undefined;
  }

  const existingBid = toFiniteNumber(existing.bid);
  const existingAsk = toFiniteNumber(existing.ask);

  if (nextBid !== undefined && nextBid !== existingBid) {
    return true;
  }

  if (nextAsk !== undefined && nextAsk !== existingAsk) {
    return true;
  }

  const nextBidHigh = toFiniteNumber(next.bidHigh);
  const nextBidLow = toFiniteNumber(next.bidLow);

  if (existingBid !== undefined && nextBidHigh !== undefined && nextBidHigh !== existingBid) {
    return true;
  }

  if (existingBid !== undefined && nextBidLow !== undefined && nextBidLow !== existingBid) {
    return true;
  }

  return false;
};
