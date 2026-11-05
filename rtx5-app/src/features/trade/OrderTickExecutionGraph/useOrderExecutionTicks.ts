/**
 * Live tick aggregation hook.
 *
 * Subscribes to bid/ask updates for a symbol and maintains a rolling buffer
 * of `TickPoint` history. Every rendered point comes from an observed broker
 * quote; an idle or unavailable feed leaves the trace unchanged.
 */
import { useRef } from 'react';
import {
  appendTick,
  createInitialTickHistory,
  isFiniteTickValue,
} from './tickHelpers';
import { DEFAULT_MAX_TICKS, type LiveOrderTickExecutionGraphProps, type TickPoint } from './types';

export function useOrderExecutionTicks({
  symbol,
  bid,
  ask,
  timestamp,
  enabled = true,
  maxTicks = DEFAULT_MAX_TICKS,
  priceDecimals = 5,
}: LiveOrderTickExecutionGraphProps) {
  const lastRealTickKeyRef = useRef('');
  const previousSymbolRef = useRef(symbol);
  const ticksRef = useRef<TickPoint[]>([]);

  if (previousSymbolRef.current !== symbol) {
    previousSymbolRef.current = symbol;
    ticksRef.current = [];
    lastRealTickKeyRef.current = '';
  }

  if (enabled && isFiniteTickValue(bid) && isFiniteTickValue(ask) && bid > 0 && ask > 0 && ask >= bid) {
    const tickTime = isFiniteTickValue(timestamp) && timestamp > 0 ? timestamp : Date.now();
    const nextTick: TickPoint = {
      time: tickTime,
      bid,
      ask,
    };
    const tickKey = `${nextTick.time}:${nextTick.bid}:${nextTick.ask}`;
    if (tickKey !== lastRealTickKeyRef.current) {
      lastRealTickKeyRef.current = tickKey;
      ticksRef.current = ticksRef.current.length === 0
        ? createInitialTickHistory(nextTick, priceDecimals, maxTicks)
        : appendTick(ticksRef.current, nextTick, maxTicks);
    }
  }

  return ticksRef.current;
}
