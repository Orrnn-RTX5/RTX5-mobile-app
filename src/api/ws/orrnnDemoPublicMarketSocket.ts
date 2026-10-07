import { AppState, Platform } from 'react-native';
import { createFeedWebSocket } from './feedWebSocket';
import { useUserPreferences } from '../../state/userPreferences';
import { getPublicBrokerContext } from '../../state/publicBrokerContext';
import { PublicMarketSocketService } from './publicMarketSocketCore';
export type { OrrnnDemoPublicCandleListener } from './publicMarketSocketCore';
export const orrnnDemoPublicMarketSocket = new PublicMarketSocketService({
  initialActive: AppState.currentState == null || AppState.currentState === 'active',
  isGuest: () => { const preferences = useUserPreferences.getState(); return !preferences.isLoggedIn && getPublicBrokerContext()?.brokerId === preferences.brokerId; },
  subscribeGuest: listener => useUserPreferences.subscribe((state, previous) => { if (state.isLoggedIn !== previous.isLoggedIn || state.brokerId !== previous.brokerId) listener(); }),
  subscribeVisibility: listener => { const subscription = AppState.addEventListener('change', state => listener(state === 'active')); return () => subscription.remove(); },
  openSocket: socketUrl => createFeedWebSocket(socketUrl, Platform.OS),
});

