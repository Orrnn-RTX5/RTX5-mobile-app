import { memo } from 'react';
import { SettingsScreen } from '../../src/features/settings/SettingsScreen';

// Memo barrier: navigator re-renders (route pushes, tab-bar option churn) must
// not cascade into the screen body — SettingsScreen takes no props, so it only
// re-renders from its own subscriptions.
const MemoSettingsScreen = memo(SettingsScreen);

export default function SettingsRoute() {
  return <MemoSettingsScreen />;
}
