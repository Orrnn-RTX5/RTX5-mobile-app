import { useSyncExternalStore } from 'react';
import { interactionLifecycle } from '../utils/interactionLifecycle';

/** Share the root AppState binding instead of adding one native listener per screen. */
export function useAppForeground() {
  return useSyncExternalStore(
    interactionLifecycle.register,
    interactionLifecycle.isForeground,
    interactionLifecycle.isForeground,
  );
}
