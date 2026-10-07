# GBPUSD Chart Bug Analysis

## 1. Confidence in diagnosis

Partially correct.

The native direct injection path is the most likely visible cause, but the exact bug is more specific:

- native chart listener does not validate timeframe
- native listener effect does not depend on `chartTimeframe`
- this can allow stale or wrong-timeframe `GBPUSD` candle updates to mutate the current visible candle

## 2. Most likely root cause

Most likely bug path:

1. `candlesWsService.addTickListener(handleRawTick)` is registered in native chart
2. `handleRawTick` checks only `symbol`, not `timeframe`
3. the effect dependency list omits `chartTimeframe`
4. a `GBPUSD` candle update from another timeframe or stale listener state arrives
5. native injects it with `updateTick(...)`
6. the visible candle gets corrupted and renders a huge wick

Exact problem file:

- `rtx5-app/src/features/chart/ChartScreen.native.tsx`

Exact problem area:

- `handleRawTick`
- effect dependency list for the live tick sync effect

## 3. Alternate possible causes

Lower-probability causes:

- merge logic in `rtx5-app/src/api/ws/candlesSocket.ts` keeps extreme `high/low` values without rejecting outlier OHLC updates
- `normalizeCandle()` in `rtx5-app/src/domain/candles.ts` normalizes shape but does not reject implausible price jumps
- malformed websocket payload for in-progress candle contains bad `low` or `high`, and merge logic accepts it

These are secondary. They are not the first patch.

## 4. Immediate patch

Minimum safe patch first:

### Patch 1: add timeframe guard in native listener

In `rtx5-app/src/features/chart/ChartScreen.native.tsx`, inside `handleRawTick`, add:

```ts
if (sym.toUpperCase() !== chartSymbol.toUpperCase()) return;
if (normalizeTimeframe(tf) !== normalizeTimeframe(chartTimeframe)) return;
if (!incomingCandles || incomingCandles.length === 0 || !webViewReady) return;
```

### Patch 2: make the native effect depend on `chartTimeframe`

Change:

```ts
}, [chartSymbol, chartType, webViewReady]);
```

to:

```ts
}, [chartSymbol, chartTimeframe, chartType, webViewReady]);
```

### Patch 3: reject malformed candles before `updateTick(...)`

Before injecting:

```ts
if (
  !tick ||
  !Number.isFinite(tick.time) ||
  !Number.isFinite(tick.open) ||
  !Number.isFinite(tick.high) ||
  !Number.isFinite(tick.low) ||
  !Number.isFinite(tick.close)
) continue;

if (tick.high < Math.max(tick.open, tick.close)) continue;
if (tick.low > Math.min(tick.open, tick.close)) continue;
if (tick.high < tick.low) continue;
```

## 5. Proper long-term fix

Safest architecture:

- one authoritative candle state: `candlesWsService.candleCache`
- every websocket payload goes through:
  - parse
  - symbol/timeframe filtering
  - OHLC validation
  - merge into cache
- UI updates should use:
  - merged array for reloads
  - last merged validated candle for incremental updates

Native should never inject anything that has not already passed merged-cache validation.

## 6. Risks if I patch only merge logic

If only merge logic is patched first:

- native can still inject wrong-timeframe ticks
- stale listeners can still mutate the current visible series after timeframe switch
- the screenshot bug can still happen

So patching only `candlesSocket.ts` first is not the minimum safe fix.

## 7. Final recommendation

Priority order:

1. Fix native listener first
2. Add OHLC validation before native injection
3. Reject bad updates and force resync
4. Then harden merge logic for outlier rejection

## Exact guard to add first

In `rtx5-app/src/features/chart/ChartScreen.native.tsx`:

```ts
if (sym.toUpperCase() !== chartSymbol.toUpperCase()) return;
if (normalizeTimeframe(tf) !== normalizeTimeframe(chartTimeframe)) return;
if (!incomingCandles || incomingCandles.length === 0 || !webViewReady) return;
```

And change the effect dependencies to:

```ts
}, [chartSymbol, chartTimeframe, chartType, webViewReady]);
```

## Validation rules for OHLC updates

Accept only when all are true:

- `time`, `open`, `high`, `low`, `close` are finite numbers
- `high >= max(open, close)`
- `low <= min(open, close)`
- `high >= low`
- candle time matches current symbol timeframe bucket
- candle symbol matches active chart symbol

## When to reject an update and force resync

Reject and resync when:

- timeframe does not match active chart timeframe
- symbol does not match active chart symbol
- any OHLC field is non-finite
- `high < max(open, close)`
- `low > min(open, close)`
- `high < low`
- incoming candle time is older than the last accepted candle for the active series
- incoming update implies an extreme outlier move inconsistent with the current merged series

Resync action:

- do not inject that tick into the chart
- immediately refresh chart data from merged cache
- if cache integrity is uncertain, reload from history + websocket state
