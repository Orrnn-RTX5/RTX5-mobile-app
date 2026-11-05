import { useRef } from 'react';

/**
 * Latches a boolean: once `value` has been true, keeps returning true for the
 * rest of the component's lifetime. Used to keep expensive surfaces (e.g. the
 * chart WebView) mounted after their first deferred activation instead of
 * tearing them down and rebuilding them on every tab refocus.
 */
export function useLatchedFlag(value: boolean): boolean {
  const latchedRef = useRef(value);
  if (value) {
    latchedRef.current = true;
  }
  return latchedRef.current;
}
