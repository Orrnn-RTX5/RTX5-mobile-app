import { scheduleAfterVisualFrame } from './afterVisualFrame';
import { registerInteractionLifecycleHandler } from './interactionLifecycle';

type BackRouter = {
  canGoBack?: () => boolean;
  back: () => void;
  replace: (href: any) => void;
};

export function safeRouterBack(router: BackRouter, fallbackHref: any = '/') {
  try {
    if (typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
      return;
    }
  } catch (error) {
    // React Navigation can throw "The action 'GO_BACK' was not handled by any navigator."
    // even if canGoBack() returns true in certain deep link or modal states.
    // Fallthrough to router.replace
  }

  router.replace(fallbackHref);
}

let cancelPendingBackNavigation: (() => void) | null = null;
registerInteractionLifecycleHandler(phase => {
  if (phase === 'suspend') {
    cancelPendingBackNavigation?.();
    cancelPendingBackNavigation = null;
  }
});

/**
 * Lets the touch-down frame paint before a potentially expensive Expo Router
 * stack pop. The native screen stays stable for that one frame, then Back runs
 * outside the press event instead of blocking its visual acknowledgement.
 */
export function scheduleBackNavigationAfterVisualFrame(action: () => void): () => void {
  // Multiple taps while the same screen is still visible represent one pop.
  // Keep the latest request and recover if the native frame is interrupted.
  cancelPendingBackNavigation?.();
  const cancelFrame = scheduleAfterVisualFrame(() => {
    cancelPendingBackNavigation = null;
    action();
  });
  const cancel = () => {
    cancelFrame();
    if (cancelPendingBackNavigation === cancel) cancelPendingBackNavigation = null;
  };
  cancelPendingBackNavigation = cancel;
  return cancel;
}
