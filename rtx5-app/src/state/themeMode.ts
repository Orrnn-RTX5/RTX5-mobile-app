import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { create } from 'zustand';
import type { ThemeMode } from './userPreferences/types';
import { scheduleAfterVisualFrame } from '../utils/afterVisualFrame';

type ThemeModeState = {
  themeMode: ThemeMode;
  retainedThemeMode: ThemeMode;
  setImmediateThemeMode: (mode: ThemeMode) => void;
  setRetainedThemeMode: (mode: ThemeMode) => void;
};

type ImmediateThemeVisualApplier = (mode: ThemeMode) => void;
type ThemeModePostPaintTask = () => void;

export type ThemeModeRenderPriority = 'immediate' | 'retained';

/**
 * Retained screen trees use the settled theme clock so they cannot block the
 * drawer's first light/dark paint. Hidden pre-mounted trees stay subscribed to
 * that clock so native navigation can never reveal a stale palette.
 */
export const ThemeModeRenderPriorityContext =
  createContext<ThemeModeRenderPriority>('immediate');

const immediateThemeVisualAppliers = new Set<ImmediateThemeVisualApplier>();
const themeModePostPaintTasks = new Set<ThemeModePostPaintTask>();
let pendingRetainedThemeMode: ThemeMode | null = null;
let themeModePostPaintScheduled = false;
let themeModePostPaintFlushing = false;

export const useThemeModeState = create<ThemeModeState>()((set) => ({
  themeMode: 'dark',
  retainedThemeMode: 'dark',
  setImmediateThemeMode: (mode) =>
    set((state) => (state.themeMode === mode ? state : { themeMode: mode })),
  setRetainedThemeMode: (mode) =>
    set((state) => (
      state.retainedThemeMode === mode
        ? state
        : { retainedThemeMode: mode }
    )),
}));

export function registerImmediateThemeVisualApplier(applier: ImmediateThemeVisualApplier) {
  immediateThemeVisualAppliers.add(applier);
  return () => {
    immediateThemeVisualAppliers.delete(applier);
  };
}

export function applyImmediateThemeVisuals(mode: ThemeMode) {
  immediateThemeVisualAppliers.forEach((applier) => {
    try {
      applier(mode);
    } catch (error) {
      console.error('[ThemeMode] Failed to apply an immediate theme visual', error);
    }
  });
}

function flushThemeModePostPaintWork() {
  themeModePostPaintScheduled = false;
  themeModePostPaintFlushing = true;
  const postPaintTasks = Array.from(themeModePostPaintTasks);
  themeModePostPaintTasks.clear();

  postPaintTasks.forEach((task) => {
    try {
      task();
    } catch (error) {
      console.error('[ThemeMode] Failed to run post-paint theme work', error);
    }
  });

  // Tasks may request a newer mode (including a rapid reversal). Resolve the
  // retained clock only after those tasks so an older captured mode can never
  // overwrite the latest immediate choice.
  const retainedMode = pendingRetainedThemeMode;
  pendingRetainedThemeMode = null;
  if (retainedMode !== null) {
    // Native retained surfaces repaint before React reconciles their trees.
    applyImmediateThemeVisuals(retainedMode);
    useThemeModeState.getState().setRetainedThemeMode(retainedMode);
  }
  themeModePostPaintFlushing = false;

  if (pendingRetainedThemeMode !== null || themeModePostPaintTasks.size > 0) {
    scheduleThemeModePostPaintFlush();
  }
}

function scheduleThemeModePostPaintFlush() {
  if (themeModePostPaintScheduled || themeModePostPaintFlushing) {
    return;
  }
  themeModePostPaintScheduled = true;

  scheduleAfterVisualFrame(flushThemeModePostPaintWork);
}

/**
 * Queues preference mirroring and other non-visual work behind the drawer's
 * first themed frame. Calls made during a rapid light/dark sequence coalesce.
 */
export function scheduleAfterImmediateThemePaint(task: ThemeModePostPaintTask) {
  themeModePostPaintTasks.add(task);
  scheduleThemeModePostPaintFlush();
}

export function setImmediateThemeMode(
  mode: ThemeMode,
  options?: { deferRetained?: boolean },
) {
  const state = useThemeModeState.getState();
  if (state.themeMode !== mode) {
    state.setImmediateThemeMode(mode);
  }

  if (options?.deferRetained === false) {
    pendingRetainedThemeMode = null;
    applyImmediateThemeVisuals(mode);
    useThemeModeState.getState().setRetainedThemeMode(mode);
    return;
  }

  // The drawer, status bar and navigation chrome use `themeMode` now. Large
  // retained scenes and the chart WebView settle just after that frame.
  pendingRetainedThemeMode =
    state.retainedThemeMode === mode ? null : mode;
  if (pendingRetainedThemeMode !== null) {
    scheduleThemeModePostPaintFlush();
  }
}

/**
 * When false, the hook uses the post-paint retained clock. This keeps hidden
 * visual shells current while their expensive work remains focus-gated.
 */
export type UseThemeModeOptions = {
  active?: boolean;
};

/**
 * App-wide immediate theme by default. A retained-priority provider moves an
 * entire pre-mounted scene tree to the post-paint theme clock.
 *
 * Hidden retained hosts may pass `{ active: false }` to use the retained clock
 * even outside a retained-priority provider. A visual palette is never frozen:
 * native route handoffs can expose a pre-mounted tree before focus props update.
 */
export function useThemeMode(options?: UseThemeModeOptions): ThemeMode {
  const renderPriority = useContext(ThemeModeRenderPriorityContext);
  const useRetainedThemeClock =
    renderPriority === 'retained' || options?.active === false;

  return useThemeModeState(
    useCallback(
      (state) => useRetainedThemeClock
        ? state.retainedThemeMode
        : state.themeMode,
      [useRetainedThemeClock],
    ),
  );
}

export function useIsDarkTheme(options?: UseThemeModeOptions): boolean {
  return useThemeMode(options) === 'dark';
}

export function useDeferredThemeMode(delayMs = 750): ThemeMode {
  const [themeMode, setThemeMode] = useState(() => useThemeModeState.getState().themeMode);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearPendingTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const unsubscribe = useThemeModeState.subscribe((state, previousState) => {
      if (state.themeMode === previousState.themeMode) {
        return;
      }

      clearPendingTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setThemeMode(state.themeMode);
      }, delayMs);
    });

    return () => {
      clearPendingTimer();
      unsubscribe();
    };
  }, [delayMs]);

  return themeMode;
}
