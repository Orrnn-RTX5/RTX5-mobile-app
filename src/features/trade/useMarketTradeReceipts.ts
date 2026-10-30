import { useCallback, useEffect, useState } from 'react';
import { captureActiveBrokerSessionProvenance, subscribeActiveBrokerSession } from '../../state/activeBrokerSession';
import { isMarketOrderFeedbackCurrent } from '../../api/orders/marketOrderFeedback';
import { createChartTradeReceiptStackController } from '../chart/components/chartTradeReceiptStackController';
import type { TradeSide } from '../../domain/tradeSide';
import { createMarketTradeReceiptCallbacks } from './marketTradeReceiptCallbacks';

let nextMarketReceiptId = 1;

export function useMarketTradeReceipts() {
  const [controller] = useState(createChartTradeReceiptStackController);
  useEffect(() => {
    let namespace = captureActiveBrokerSessionProvenance()?.cacheNamespace;
    const unsubscribe = subscribeActiveBrokerSession(() => {
      const nextNamespace = captureActiveBrokerSessionProvenance()?.cacheNamespace;
      if (nextNamespace !== namespace) {
        namespace = nextNamespace;
        controller.clear();
      }
    });
    return () => { unsubscribe(); controller.clear(); };
  }, [controller]);
  const createTradeReceipt = useCallback((
    trade: { side: TradeSide; symbol: string; volume: number },
    namespace: string,
  ) => createMarketTradeReceiptCallbacks(
    controller,
    { ...trade, queueId: nextMarketReceiptId++, status: 'pending' },
    () => isMarketOrderFeedbackCurrent(namespace),
  ), [controller]);
  return { controller, createTradeReceipt };
}
