import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type NativeEventSubscription, InteractionManager } from 'react-native';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import {
  buildUiFeedGapSample,
  buildUiThreadStallSample,
  resolveUiPerformanceSeverity,
  trimUiPerformanceSamples,
  type UiPerformanceSample,
  type UiPerformanceSampleKind,
} from './uiPerformanceDiagnostics.helpers';

const DEV_ENABLED = typeof __DEV__ !== 'undefined' && __DEV__;
const SAMPLE_LIMIT = 80;
const STORAGE_KEY = 'rtx5-ui-performance-diagnostics-v1';
const STORAGE_FLUSH_DEBOUNCE_MS = 2_000;
const UI_STALL_WATCHDOG_INTERVAL_MS = 500;
const UI_STALL_RECORD_THRESHOLD_MS = 180;

const getNow = () =>
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();

const runOnNextFrame = (callback: () => void) => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => callback());
    return;
  }

  setTimeout(callback, 16);
};

const createSampleId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type UiPerformanceDiagnosticsState = {
  enabled: boolean;
  hasHydrated: boolean;
  samples: UiPerformanceSample[];
  clearSamples: () => void;
  recordSample: (sample: UiPerformanceSample) => void;
  setEnabled: (enabled: boolean) => void;
  setHasHydrated: (hydrated: boolean) => void;
};

type UiPerformancePersistencePayload = {
  enabled: boolean;
  samples: UiPerformanceSample[];
};

let persistenceHydrationStarted = false;
let persistenceFlushTimer: ReturnType<typeof setTimeout> | null = null;
let persistenceFlushInFlight: Promise<void> | null = null;

export const useUiPerformanceDiagnostics = create<UiPerformanceDiagnosticsState>((set) => ({
  enabled: false,
  hasHydrated: false,
  samples: [],
  clearSamples: () => {
    set({ samples: [] });
    scheduleUiPerformanceSnapshotPersist(true);
  },
  recordSample: (sample) => {
    set((state) => ({
      samples: trimUiPerformanceSamples([sample, ...state.samples], SAMPLE_LIMIT),
    }));
    scheduleUiPerformanceSnapshotPersist(false);
  },
  setEnabled: (enabled) => {
    set({ enabled });
    scheduleUiPerformanceSnapshotPersist(true);
  },
  setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
}));

export const useUiInteractionDiagnostics = useUiPerformanceDiagnostics;
export type UiInteractionSample = UiPerformanceSample;
export type UiPerformanceSeverity = UiPerformanceSample['severity'];

function getUiPerformancePersistencePayload(): UiPerformancePersistencePayload {
  const state = useUiPerformanceDiagnostics.getState();
  return {
    enabled: state.enabled,
    samples: state.samples,
  };
}

async function persistUiPerformanceSnapshotNow() {
  if (!DEV_ENABLED) {
    return;
  }

  const payload = getUiPerformancePersistencePayload();
  persistenceFlushInFlight = AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    .catch((error) => {
      console.log('[UI Perf] Failed to persist diagnostics snapshot', error);
    })
    .finally(() => {
      persistenceFlushInFlight = null;
    });

  await persistenceFlushInFlight;
}

function scheduleUiPerformanceSnapshotPersist(immediate: boolean) {
  if (!DEV_ENABLED) {
    return;
  }

  if (persistenceFlushTimer) {
    clearTimeout(persistenceFlushTimer);
    persistenceFlushTimer = null;
  }

  if (immediate) {
    void persistUiPerformanceSnapshotNow();
    return;
  }

  persistenceFlushTimer = setTimeout(() => {
    persistenceFlushTimer = null;
    void persistUiPerformanceSnapshotNow();
  }, STORAGE_FLUSH_DEBOUNCE_MS);
}

async function hydrateUiPerformanceDiagnosticsFromStorage() {
  if (!DEV_ENABLED || persistenceHydrationStarted) {
    if (!DEV_ENABLED) {
      useUiPerformanceDiagnostics.getState().setHasHydrated(true);
    }
    return;
  }

  persistenceHydrationStarted = true;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as Partial<UiPerformancePersistencePayload> | null;
    if (!parsed || typeof parsed !== 'object') {
      return;
    }

    useUiPerformanceDiagnostics.setState((state) => ({
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : state.enabled,
      samples: Array.isArray(parsed.samples)
        ? trimUiPerformanceSamples(parsed.samples.filter(Boolean) as UiPerformanceSample[], SAMPLE_LIMIT)
        : state.samples,
    }));
  } catch (error) {
    console.log('[UI Perf] Failed to rehydrate persisted diagnostics', error);
  } finally {
    useUiPerformanceDiagnostics.getState().setHasHydrated(true);
  }
}

const shouldCaptureUiDiagnostics = () =>
  DEV_ENABLED && useUiPerformanceDiagnostics.getState().enabled;

function recordUiPerformanceSample(sample: UiPerformanceSample) {
  if (!shouldCaptureUiDiagnostics()) {
    return;
  }

  useUiPerformanceDiagnostics.getState().recordSample(sample);
}

type UiTraceKind = Extract<UiPerformanceSampleKind, 'interaction' | 'navigation'>;

type UiTraceOptions = {
  context?: string;
  kind?: UiTraceKind;
};

function finalizeUiTrace(
  label: string,
  startedAtMs: number,
  handlerFinishedAtMs: number,
  options: UiTraceOptions = {},
) {
  const kind = options.kind ?? 'interaction';

  runOnNextFrame(() => {
    const nextFrameMs = getNow() - startedAtMs;
    InteractionManager.runAfterInteractions(() => {
      const settledMs = getNow() - startedAtMs;
      const handlerMs = handlerFinishedAtMs - startedAtMs;

      recordUiPerformanceSample({
        id: createSampleId(),
        kind,
        label,
        startedAtMs,
        handlerMs,
        nextFrameMs,
        settledMs,
        context: options.context,
        recordedAtIso: new Date().toISOString(),
        severity: resolveUiPerformanceSeverity({
          kind,
          handlerMs,
          nextFrameMs,
          settledMs,
        }),
      });
    });
  });
}

export function traceUiInteraction(
  label: string,
  action: () => void,
  options: UiTraceOptions = {},
) {
  if (!shouldCaptureUiDiagnostics()) {
    action();
    return;
  }

  const startedAtMs = getNow();
  let handlerFinishedAtMs = startedAtMs;

  try {
    action();
  } finally {
    handlerFinishedAtMs = getNow();
    finalizeUiTrace(label, startedAtMs, handlerFinishedAtMs, options);
  }
}

export function recordUiFeedGap(label: string, gapMs: number, context?: string) {
  if (!shouldCaptureUiDiagnostics()) {
    return;
  }

  recordUiPerformanceSample(
    buildUiFeedGapSample({
      id: createSampleId(),
      label,
      gapMs,
      context,
      startedAtMs: getNow() - gapMs,
      recordedAtIso: new Date().toISOString(),
    }),
  );
}

let uiStallWatchdogConsumers = 0;
let uiStallWatchdogTimer: ReturnType<typeof setInterval> | null = null;
let uiStallAppStateSubscription: NativeEventSubscription | null = null;
let uiStallLastTickAtMs = 0;
let uiStallAppState = AppState.currentState;
let uiPerformancePersistenceAppStateSubscription: NativeEventSubscription | null = null;

function startUiStallWatchdog() {
  if (!DEV_ENABLED) {
    return;
  }

  uiStallWatchdogConsumers += 1;
  if (uiStallWatchdogTimer) {
    return;
  }

  uiStallLastTickAtMs = getNow();
  uiStallAppState = AppState.currentState;
  uiStallAppStateSubscription = AppState.addEventListener('change', (nextState) => {
    uiStallAppState = nextState;
    uiStallLastTickAtMs = getNow();
  });

  uiStallWatchdogTimer = setInterval(() => {
    const now = getNow();
    const driftMs = now - uiStallLastTickAtMs - UI_STALL_WATCHDOG_INTERVAL_MS;
    uiStallLastTickAtMs = now;

    if (uiStallAppState !== 'active') {
      return;
    }

    if (driftMs < UI_STALL_RECORD_THRESHOLD_MS) {
      return;
    }

    recordUiPerformanceSample(
      buildUiThreadStallSample({
        id: createSampleId(),
        startedAtMs: now - driftMs,
        blockedMs: driftMs,
        context: `watchdog drift over ${UI_STALL_WATCHDOG_INTERVAL_MS}ms cadence`,
        recordedAtIso: new Date().toISOString(),
      }),
    );
  }, UI_STALL_WATCHDOG_INTERVAL_MS);
}

function stopUiStallWatchdog() {
  if (!DEV_ENABLED) {
    return;
  }

  uiStallWatchdogConsumers = Math.max(0, uiStallWatchdogConsumers - 1);
  if (uiStallWatchdogConsumers > 0) {
    return;
  }

  if (uiStallWatchdogTimer) {
    clearInterval(uiStallWatchdogTimer);
    uiStallWatchdogTimer = null;
  }

  uiStallAppStateSubscription?.remove();
  uiStallAppStateSubscription = null;
}

export function useUiPerformanceDiagnosticsRuntime(pathname: string) {
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!DEV_ENABLED) {
      return;
    }

    void hydrateUiPerformanceDiagnosticsFromStorage();
    startUiStallWatchdog();

    if (!uiPerformancePersistenceAppStateSubscription) {
      uiPerformancePersistenceAppStateSubscription = AppState.addEventListener('change', (nextState) => {
        if (nextState !== 'active') {
          scheduleUiPerformanceSnapshotPersist(true);
        }
      });
    }

    return () => stopUiStallWatchdog();
  }, []);

  useEffect(() => {
    const previousPath = previousPathRef.current;

    if (!previousPath) {
      previousPathRef.current = pathname;
      return;
    }

    if (previousPath === pathname) {
      return;
    }

    const startedAtMs = getNow();
    finalizeUiTrace(`route ${previousPath} -> ${pathname}`, startedAtMs, startedAtMs, {
      kind: 'navigation',
      context: pathname,
    });

    previousPathRef.current = pathname;
  }, [pathname]);
}
