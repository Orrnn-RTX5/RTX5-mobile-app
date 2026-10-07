import { useSyncExternalStore } from 'react';
import { getAuthFlowState, subscribeAuthFlow } from './authFlowState';

/** Native authentication covers retained tabs without changing navigation focus. */
export function getAuthMarketDemandAllowed(): boolean {
  const { screen } = getAuthFlowState();
  return screen === 'guest' || screen === 'ready';
}

export function useAuthMarketDemandAllowed(): boolean {
  // The boolean snapshot avoids reconciling retained tabs on every form/attempt update.
  return useSyncExternalStore(
    subscribeAuthFlow,
    getAuthMarketDemandAllowed,
    getAuthMarketDemandAllowed,
  );
}
