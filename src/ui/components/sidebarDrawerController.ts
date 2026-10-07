type SidebarOpenHandler = () => void;
export type SidebarMountedTabPath =
  | '/quotes'
  | '/chart'
  | '/trade'
  | '/history'
  | '/settings'
  | '/journal'
  | '/economic-calendar'
  | '/user-guide'
  | '/help'
  | '/about';
type SidebarTabNavigationHandler = (path: SidebarMountedTabPath) => void;
type SidebarControllerGlobal = typeof globalThis & {
  __rtx5SidebarTabNavigationHandler?: SidebarTabNavigationHandler;
};

const sidebarOpenHandlers: SidebarOpenHandler[] = [];
let sidebarOpenVisualGeneration = 0;
const sidebarControllerGlobal = globalThis as SidebarControllerGlobal;

export function registerSidebarOpenHandler(handler: SidebarOpenHandler) {
  sidebarOpenHandlers.push(handler);

  return () => {
    const index = sidebarOpenHandlers.lastIndexOf(handler);
    if (index >= 0) {
      sidebarOpenHandlers.splice(index, 1);
    }
  };
}

export function openSidebarDrawerImmediately() {
  sidebarOpenVisualGeneration += 1;
  sidebarOpenHandlers[sidebarOpenHandlers.length - 1]?.();
}

/** Discard open-time work when a selection or Back closes the drawer. */
export function invalidateSidebarOpenVisualWork() {
  sidebarOpenVisualGeneration += 1;
}

export function registerSidebarTabNavigationHandler(handler: SidebarTabNavigationHandler) {
  sidebarControllerGlobal.__rtx5SidebarTabNavigationHandler = handler;
  return () => {
    if (sidebarControllerGlobal.__rtx5SidebarTabNavigationHandler === handler) {
      delete sidebarControllerGlobal.__rtx5SidebarTabNavigationHandler;
    }
  };
}

export function navigateMountedSidebarTab(path: string) {
  const handler = sidebarControllerGlobal.__rtx5SidebarTabNavigationHandler;
  if (!handler) {
    return false;
  }
  handler(path as SidebarMountedTabPath);
  return true;
}

export function scheduleAfterSidebarOpenVisual(action: () => void) {
  const generation = sidebarOpenVisualGeneration;
  let completed = false;
  let frameId: number | undefined;
  let paintTimer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if (completed) return;
    completed = true;
    clearTimeout(fallbackTimer);
    if (frameId !== undefined) globalThis.cancelAnimationFrame?.(frameId);
    if (paintTimer !== undefined) clearTimeout(paintTimer);
    if (generation === sidebarOpenVisualGeneration) action();
  };
  // Yield the touch turn and the pre-paint rAF callback. No fixed animation
  // delay: the retained drawer is already visible at its final position.
  const fallbackTimer = setTimeout(run, 80);
  if (typeof globalThis.requestAnimationFrame === 'function') {
    frameId = globalThis.requestAnimationFrame(() => {
      if (!completed) paintTimer = setTimeout(run, 0);
    });
  } else {
    paintTimer = setTimeout(run, 0);
  }
  return () => {
    completed = true;
    clearTimeout(fallbackTimer);
    if (frameId !== undefined) globalThis.cancelAnimationFrame?.(frameId);
    if (paintTimer !== undefined) clearTimeout(paintTimer);
  };
}
