import { memo } from 'react';
import { HistoryScreen } from '../../src/features/history/HistoryScreen';

// Memo barrier: navigator re-renders (route pushes, tab-bar option churn) must
// not cascade into the screen body — HistoryScreen takes no props, so it only
// re-renders from its own subscriptions.
const MemoHistoryScreen = memo(HistoryScreen);

export default function HistoryRoute() {
  return <MemoHistoryScreen />;
}
