/**
 * Live tick aggregation hook.
 *
 * Subscribes to bid/ask updates for a symbol and maintains a rolling buffer
 * of `TickPoint` history. Every rendered point comes from an observed broker
 * quote; an idle or unavailable feed leaves the trace unchanged.
 */
import { useEffect, useRef, useState } from 'react';
import {
  appendTick,
  createInitialTickHistory,
  isFiniteTickValue,
  roundToDecimals,
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
  const [ticks, setTicks] = useState<TickPoint[]>([]);
  const lastRealTickKeyRef = useRef('');

  useEffect(() => {
    setTicks([]);
    lastRealTickKeyRef.current = '';
  }, [symbol]);

  useEffect(() => {
    if (!enabled || !isFiniteTickValue(bid) || !isFiniteTickValue(ask) || bid <= 0 || ask <= 0 || ask < bid) {
      return;
    }

    const tickTime = isFiniteTickValue(timestamp) && timestamp > 0 ? timestamp : Date.now();
    const nextTick: TickPoint = {
      time: tickTime,
      bid: roundToDecimals(bid, priceDecimals),
      ask: roundToDecimals(ask, priceDecimals),
    };
    const tickKey = `${nextTick.time}:${nextTick.bid}:${nextTick.ask}`;
    if (tickKey === lastRealTickKeyRef.current) {
      return;
    }

    lastRealTickKeyRef.current = tickKey;
    setTicks((currentTicks) => {
      if (currentTicks.length === 0) {
        return createInitialTickHistory(nextTick, priceDecimals, maxTicks);
      }
      return appendTick(currentTicks, nextTick, maxTicks);
    });
  }, [ask, bid, enabled, maxTicks, priceDecimals, timestamp]);

  return ticks;
}
