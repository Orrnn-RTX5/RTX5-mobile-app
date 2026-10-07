import { DEFAULT_CHART_SYMBOLS } from './chartSymbolMetadata';

const symbolKey = (symbol: string): string => symbol.trim().toUpperCase();

/** A loaded broker catalog is authoritative, including an empty catalog. */
export const buildAvailableChartSymbols = (
  chartSymbol: string,
  brokerSymbols?: readonly string[],
): string[] => {
  const symbols = new Map<string, string>();
  for (const symbol of brokerSymbols ?? [chartSymbol, ...DEFAULT_CHART_SYMBOLS]) {
    const trimmed = symbol.trim();
    const key = symbolKey(trimmed);
    if (key && (!symbols.has(key) || trimmed === key)) symbols.set(key, trimmed);
  }
  const selectedKey = symbolKey(chartSymbol);
  const selected = symbols.get(selectedKey);
  if (selected) {
    symbols.delete(selectedKey);
    return [selected, ...symbols.values()];
  }
  return [...symbols.values()];
};

/** Repair a saved selection only after this broker has supplied its catalog. */
export const resolveBrokerChartSymbol = (
  chartSymbol: string,
  brokerSymbols?: readonly string[],
): string | null => {
  if (!brokerSymbols) return null;
  const available = buildAvailableChartSymbols(chartSymbol, brokerSymbols);
  const selectedKey = symbolKey(chartSymbol);
  const selected = available.find((symbol) => symbolKey(symbol) === selectedKey);
  if (selected) return selected === chartSymbol ? null : selected;
  return available.find((symbol) => symbolKey(symbol) === 'XAUUSD')
    ?? available.find((symbol) => symbolKey(symbol) === 'EURUSD')
    ?? available[0]
    ?? null;
};
