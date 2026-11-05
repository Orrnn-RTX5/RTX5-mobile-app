import { useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { scheduleAfterVisualFrame } from '../../utils/afterVisualFrame';
import { scheduleIdleWork } from '../../utils/startupScheduler';
import { isStartupBackgroundWorkAllowed, subscribeStartupBackgroundWork } from '../../utils/startupWorkGate';
import { RetainedRoutePrewarmContext } from './retainedRoutePrewarmContext';

// Ordinary routes remain immediately available. Only root-retained hidden
// bodies use this provider to yield to broker selection and authentication.
export function RetainedRoutePrewarmProvider({ children }: PropsWithChildren) {
  const allowed = useSyncExternalStore(
    subscribeStartupBackgroundWork,
    isStartupBackgroundWorkAllowed,
    isStartupBackgroundWorkAllowed,
  );
  const [firstPaintComplete, setFirstPaintComplete] = useState(false);
  useEffect(() => {
    if (!allowed || firstPaintComplete) return;
    let cancelIdle: (() => void) | undefined;
    const cancelPaint = scheduleAfterVisualFrame(() => {
      cancelIdle = scheduleIdleWork(() => setFirstPaintComplete(true));
    });
    return () => { cancelPaint(); cancelIdle?.(); };
  }, [allowed, firstPaintComplete]);

  return (
    <RetainedRoutePrewarmContext.Provider value={allowed && firstPaintComplete}>
      {children}
    </RetainedRoutePrewarmContext.Provider>
  );
}
