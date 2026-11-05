import { memo } from 'react';
import { TradeScreen } from '../../src/features/trade/TradeScreen';

// Memo barrier: navigator re-renders (route pushes, tab-bar option churn) must
// not cascade into the screen body — TradeScreen takes no props, so it only
// re-renders from its own subscriptions.
const MemoTradeScreen = memo(TradeScreen);

export default function TradeRoute() {
  return <MemoTradeScreen />;
}
