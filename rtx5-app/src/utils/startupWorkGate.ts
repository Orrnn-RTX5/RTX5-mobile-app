import { AppState, type AppStateStatus } from 'react-native';
import { getAuthFlowState, subscribeAuthFlow } from '../features/trade/authFlowState';
import { getPublicBrokerContext, subscribePublicBrokerContext } from '../state/publicBrokerContext';
import { allowsStartupBackgroundWork } from './startupWorkQueue';

const listeners = new Set<() => void>();
let observedAppState: AppStateStatus | null = AppState.currentState;
let disconnect: (() => void) | null = null;
let lastAllowed = false;

export const isStartupBackgroundWorkAllowed = (): boolean => allowsStartupBackgroundWork(
  listeners.size > 0 ? observedAppState : AppState.currentState,
  getAuthFlowState().screen,
  getPublicBrokerContext() !== null,
);

/** All prewarm consumers share one lifecycle/auth/context listener set. */
export function subscribeStartupBackgroundWork(listener: () => void): () => void {
  if (listeners.size === 0) {
    observedAppState = AppState.currentState;
    lastAllowed = isStartupBackgroundWorkAllowed();
    const notify = () => {
      const allowed = isStartupBackgroundWorkAllowed();
      if (allowed === lastAllowed) return;
      lastAllowed = allowed;
      listeners.forEach(callback => callback());
    };
    const appSubscription = AppState.addEventListener('change', state => {
      observedAppState = state;
      notify();
    });
    const unsubscribeAuth = subscribeAuthFlow(notify);
    const unsubscribeContext = subscribePublicBrokerContext(notify);
    disconnect = () => {
      appSubscription.remove();
      unsubscribeAuth();
      unsubscribeContext();
    };
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      disconnect?.();
      disconnect = null;
    }
  };
}
