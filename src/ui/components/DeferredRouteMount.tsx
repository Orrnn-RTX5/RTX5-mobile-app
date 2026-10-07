import { type ComponentType, type ReactNode, useContext, useEffect, useState } from 'react';
import { RetainedRoutePrewarmContext } from './retainedRoutePrewarmContext';
import { scheduleAfterVisualFrames } from '../../utils/afterVisualFrame';

type DeferredRouteMountProps = {
  children: ReactNode;
};

type DeferredRouteModuleProps = {
  load: () => Promise<ComponentType>;
  cacheKey?: string;
  fallback?: ReactNode;
  mountDelayMs?: number;
};

const ROUTE_MODULE_LOAD_DELAY_MS = 0;
const ROUTE_HEAVY_CONTENT_DELAY_MS = 1200;

type CachedRouteModule = {
  component?: ComponentType;
  promise?: Promise<ComponentType>;
};

const routeModuleCache = new Map<string, CachedRouteModule>();

export function preloadDeferredRouteModule(
  cacheKey: string,
  load: () => Promise<ComponentType>,
): Promise<ComponentType> {
  const cached = routeModuleCache.get(cacheKey);
  if (cached?.component) {
    return Promise.resolve(cached.component);
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const promise = load()
    .then((Component) => {
      routeModuleCache.set(cacheKey, { component: Component });
      return Component;
    })
    .catch((error) => {
      if (routeModuleCache.get(cacheKey)?.promise === promise) {
        routeModuleCache.delete(cacheKey);
      }
      throw error;
    });
  routeModuleCache.set(cacheKey, { promise });
  return promise;
}

function scheduleDeferredFrameWork(frameCount: number, action: () => void) {
  return scheduleAfterVisualFrames(action, frameCount);
}

export function useDeferredRouteContentReady(
  delayMs = ROUTE_HEAVY_CONTENT_DELAY_MS,
  active = true,
) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Readiness stays latched after the first activation. Retained hosts may
    // still focus-gate their native body while hidden, then reuse this ready
    // value on the next reveal without showing a loading shell.
    if (!active || ready) {
      return undefined;
    }

    let cancelled = false;
    let cancelFrameWork: (() => void) | null = null;

    const markReady = () => {
      if (cancelled) {
        return;
      }
      // delayMs <= 0: mount body on the next microtask so the first focused
      // paint already has content (no multi-frame blank "loading" body).
      // Positive delays still wait two frames after the timer for boot prewarm.
      if (delayMs <= 0) {
        const immediate = setTimeout(() => {
          if (!cancelled) {
            setReady(true);
          }
        }, 0);
        cancelFrameWork = () => clearTimeout(immediate);
        return;
      }
      cancelFrameWork = scheduleDeferredFrameWork(2, () => {
        if (!cancelled) {
          setReady(true);
        }
      });
    };

    const delayTimer = delayMs > 0 ? setTimeout(markReady, delayMs) : null;
    if (delayTimer === null) {
      markReady();
    }

    return () => {
      cancelled = true;
      if (delayTimer) {
        clearTimeout(delayTimer);
      }
      cancelFrameWork?.();
    };
  }, [active, delayMs, ready]);

  return ready;
}

export function DeferredRouteMount({ children }: DeferredRouteMountProps) {
  return children;
}

export function useRetainedRouteContentReady(focused: boolean, prewarmDelayMs = 0) {
  const prewarmAllowed = useContext(RetainedRoutePrewarmContext);
  // A real navigation request always wins over speculative startup work.
  // Once built, the existing hook keeps the complete body retained.
  return useDeferredRouteContentReady(focused ? 0 : prewarmDelayMs, focused || prewarmAllowed);
}

/**
 * Route-level deferral for heavy screens. Renders nothing (the navigator's
 * `contentStyle` background shows through) for the first ~2 frames, then mounts
 * the screen. This lets a Settings row tap swap to the destination instantly
 * instead of freezing while the heavy screen mounts on the navigation commit —
 * the heavy mount now runs AFTER the new screen is already on-screen.
 *
 * Use for thin route wrappers whose screen does NOT already defer its own body
 * (e.g. EconomicCalendarScreen uses useDeferredRouteContentReady internally and
 * should NOT be double-wrapped).
 */
export function DeferredRouteScreen({
  Screen,
  fallback = null,
  delayMs = 0,
}: {
  Screen: ComponentType;
  fallback?: ReactNode;
  delayMs?: number;
}) {
  const ready = useDeferredRouteContentReady(delayMs);
  if (!ready) {
    return <>{fallback}</>;
  }
  return <Screen />;
}

function useOptionalDeferredRouteMountReady(delayMs: number | undefined) {
  const [ready, setReady] = useState(delayMs === undefined);

  useEffect(() => {
    if (delayMs === undefined) {
      setReady(true);
      return;
    }

    let cancelled = false;
    let cancelFrameWork: (() => void) | null = null;

    setReady(false);

    const markReady = () => {
      cancelFrameWork = scheduleDeferredFrameWork(2, () => {
        if (!cancelled) {
          setReady(true);
        }
      });
    };

    const delayTimer = delayMs > 0 ? setTimeout(markReady, delayMs) : null;
    if (delayTimer === null) {
      markReady();
    }

    return () => {
      cancelled = true;
      if (delayTimer) {
        clearTimeout(delayTimer);
      }
      cancelFrameWork?.();
    };
  }, [delayMs]);

  return ready;
}

export function DeferredRouteModule({ load, cacheKey, fallback = null, mountDelayMs }: DeferredRouteModuleProps) {
  const [RouteComponent, setRouteComponent] = useState<ComponentType | null>(() => (
    cacheKey ? routeModuleCache.get(cacheKey)?.component ?? null : null
  ));
  const mountReady = useOptionalDeferredRouteMountReady(mountDelayMs);

  useEffect(() => {
    if (RouteComponent) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      const routeModule = cacheKey
        ? preloadDeferredRouteModule(cacheKey, load)
        : load();
      void routeModule
        .then((Component) => {
          if (!cancelled) {
            setRouteComponent(() => Component);
          }
        })
        .catch(() => undefined);
    }, ROUTE_MODULE_LOAD_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [RouteComponent, cacheKey, load]);

  if (!RouteComponent || !mountReady) {
    return <>{fallback}</>;
  }

  return <RouteComponent />;
}
