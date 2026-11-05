const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const SYMBOL_LIST_KEYS = [
  'instruments',
  'symbols',
  'data',
  'items',
  'results',
  'result',
  'records',
] as const;

const SYMBOL_FIELD_KEYS = [
  'symbol',
  'Symbol',
  'SYMBOL',
  'instrument',
  'instrumentSymbol',
  'code',
  'ticker',
] as const;

const collectSymbolLists = (value: unknown, lists: unknown[][], visited: Set<unknown>): void => {
  if (!value || visited.has(value)) {
    return;
  }

  if (Array.isArray(value)) {
    visited.add(value);
    lists.push(value);

    for (const item of value) {
      const itemRecord = asRecord(item);
      if (!itemRecord) {
        continue;
      }
      for (const key of SYMBOL_LIST_KEYS) {
        collectSymbolLists(itemRecord[key], lists, visited);
      }
    }
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  visited.add(value);
  for (const key of SYMBOL_LIST_KEYS) {
    collectSymbolLists(record[key], lists, visited);
  }
};

const pickSymbol = (item: unknown): string | null => {
  if (typeof item === 'string') {
    return item;
  }

  const itemRecord = asRecord(item);
  if (!itemRecord) {
    return null;
  }

  if (itemRecord.enabled === false || itemRecord.enabled === 0 || itemRecord.enabled === 'false') {
    return null;
  }

  for (const key of SYMBOL_FIELD_KEYS) {
    const value = itemRecord[key];
    if (typeof value === 'string') {
      return value;
    }
  }

  return null;
};

export function extractMarketSymbols(payload: unknown): string[] {
  const lists: unknown[][] = [];
  collectSymbolLists(payload, lists, new Set());
  const seen = new Set<string>();
  const symbols: string[] = [];

  for (const list of lists) {
    for (const item of list) {
      const rawSymbol = pickSymbol(item);
      const symbol = rawSymbol?.trim();

      if (!symbol || seen.has(symbol)) {
        continue;
      }

      seen.add(symbol);
      symbols.push(symbol);
    }
  }

  return symbols;
}
