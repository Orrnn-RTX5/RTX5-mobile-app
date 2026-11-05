import { useEffect, useState } from 'react';

export function useDeferredActiveFlag(active: boolean, delayMs = 180) {
  const [ready, setReady] = useState(active);

  useEffect(() => {
    if (!active) {
      setReady(false);
      return undefined;
    }

    let cancelled = false;
    let frameId: number | null = null;
    const timerId = setTimeout(() => {
      if (typeof globalThis.requestAnimationFrame === 'function') {
        frameId = globalThis.requestAnimationFrame(() => {
          if (!cancelled) {
            setReady(true);
          }
        });
        return;
      }

      setReady(true);
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timerId);
      if (frameId !== null) {
        globalThis.cancelAnimationFrame?.(frameId);
      }
    };
  }, [active, delayMs]);

  return active && ready;
}
