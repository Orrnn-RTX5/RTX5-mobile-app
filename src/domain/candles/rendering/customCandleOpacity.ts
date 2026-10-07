export const resolveRTX5CustomCandleOpacity = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 1;
