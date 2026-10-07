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

const resolveDigits = (digits: unknown): number | undefined => {
  const parsed = toFiniteNumber(digits);
  if (parsed === undefined) {
    return undefined;
  }

  return Math.max(0, Math.min(8, Math.floor(parsed)));
};

export const resolveQuoteDisplayDigits = (
  symbol: string,
  bid: unknown,
  digits?: unknown,
  point?: unknown,
): number => {
  const explicitDigits = resolveDigits(digits);
  if (explicitDigits !== undefined) return explicitDigits;

  const pointValue = toFiniteNumber(point);
  if (pointValue !== undefined && pointValue > 0) {
    const pointDigits = -Math.log10(pointValue);
    if (Number.isInteger(pointDigits) && pointDigits >= 0 && pointDigits <= 8) {
      return pointDigits;
    }
  }

  const normalizedSymbol = symbol.trim().toUpperCase().replace(/\//g, '');
  if (/^[A-Z]{3}JPY(?:$|[._A-Z0-9])/.test(normalizedSymbol)) return 3;
  if (/^(?:XAU|XAG|BTC|ETH)/.test(normalizedSymbol)) return 2;
  const bidValue = toFiniteNumber(bid);
  return bidValue !== undefined && bidValue >= 100 ? 2 : 5;
};

export const calculateQuoteSpreadPoints = (
  bid: unknown,
  ask: unknown,
  digits: unknown,
): number | undefined => {
  const safeBid = toFiniteNumber(bid);
  const safeAsk = toFiniteNumber(ask);
  const safeDigits = resolveDigits(digits);

  if (safeBid === undefined || safeAsk === undefined || safeDigits === undefined || safeAsk < safeBid) {
    return undefined;
  }

  // Market Watch style spread: ask minus bid converted to display points.
  // Round both prices first so the spread matches what the user sees on screen.
  const scale = 10 ** safeDigits;
  const bidPoints = Math.round(safeBid * scale);
  const askPoints = Math.round(safeAsk * scale);
  return Math.max(0, askPoints - bidPoints);
};
