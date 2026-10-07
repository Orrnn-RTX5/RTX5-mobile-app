import { useCallback, useEffect, useRef, useState } from 'react';

import { getJournalLogs } from '../../../../api/journal';
import { type JournalLogEntry } from './journalModel';

type JournalLoadState = {
  serverLogs: JournalLogEntry[];
  hasLoaded: boolean;
  loadedRequestKey: string | null;
  loadedSessionScope: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  fetchError: string | null;
  errorRequestKey: string | null;
};

const INITIAL_STATE: JournalLoadState = {
  serverLogs: [],
  hasLoaded: false,
  loadedRequestKey: null,
  loadedSessionScope: null,
  isLoading: false,
  isRefreshing: false,
  fetchError: null,
  errorRequestKey: null,
};

export const buildJournalRequestKey = (
  sessionScope: string,
  mode: number,
  type: number,
  filter = '',
) => JSON.stringify([sessionScope, mode, type, filter.trim()]);

export const JOURNAL_AUTO_REFRESH_MS = 15_000;

/**
 * Server journal load lifecycle: loads on focus, filter/session changes,
 * WebTerminal-compatible 15-second refresh, and manual refresh. The latest
 * request wins, stale responses are ignored, and the per-screen cache is
 * always cleared when the authenticated broker/account scope changes.
 */
export function useServerJournal({
  active,
  isAuthenticated,
  sessionScope,
  mode,
  type,
  filter,
}: {
  /** The screen is visible; hidden screens make no requests. */
  active: boolean;
  isAuthenticated: boolean;
  sessionScope: string;
  mode: number;
  type: number;
  filter: string;
}) {
  const requestKey = buildJournalRequestKey(sessionScope, mode, type, filter);
  const [state, setState] = useState<JournalLoadState>(INITIAL_STATE);
  const cacheRef = useRef(new Map<string, JournalLogEntry[]>());
  const cacheScopeRef = useRef<string | null>(null);
  const loadedScopeRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);
  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    let disposed = false;
    let requestInFlight = false;
    if (cacheScopeRef.current !== sessionScope) {
      cacheRef.current.clear();
      cacheScopeRef.current = sessionScope;
    }
    const cached = isAuthenticated ? cacheRef.current.get(requestKey) : undefined;
    const canReuse = isAuthenticated && loadedScopeRef.current === sessionScope;
    let hasSuccessful = cached !== undefined || canReuse;

    setState((previous) => {
      const base = { ...previous, fetchError: null, errorRequestKey: null, isRefreshing: false };
      if (cached) {
        return {
          ...base,
          serverLogs: cached,
          hasLoaded: true,
          loadedRequestKey: requestKey,
          loadedSessionScope: sessionScope,
          isLoading: false,
        };
      }
      if (!canReuse) {
        // Never let another account's rows flash under this scope.
        return {
          ...base,
          serverLogs: [],
          hasLoaded: false,
          loadedRequestKey: null,
          loadedSessionScope: null,
          isLoading: isAuthenticated,
        };
      }
      // Same scope: keep the current rows mounted during the reload.
      return { ...base, isLoading: false };
    });

    const load = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      const sequence = ++requestSequenceRef.current;
      activeRequestRef.current?.abort();
      const controller = new AbortController();
      activeRequestRef.current = controller;
      setState((previous) => ({
        ...previous,
        ...(hasSuccessful ? { isRefreshing: true } : { isLoading: true }),
        fetchError: null,
        errorRequestKey: null,
      }));
      try {
        const data = await getJournalLogs({ mode, type, filter }, { signal: controller.signal });
        if (disposed || controller.signal.aborted || sequence !== requestSequenceRef.current) return;
        hasSuccessful = true;
        cacheRef.current.set(requestKey, data.logs);
        loadedScopeRef.current = sessionScope;
        setState((previous) => ({
          ...previous,
          serverLogs: data.logs,
          hasLoaded: true,
          loadedRequestKey: requestKey,
          loadedSessionScope: sessionScope,
          fetchError: null,
          errorRequestKey: null,
        }));
      } catch (error) {
        if (disposed || controller.signal.aborted || sequence !== requestSequenceRef.current) return;
        const message = error instanceof Error && error.message ? error.message : 'Failed to load journal';
        setState((previous) => ({ ...previous, fetchError: message, errorRequestKey: requestKey }));
      } finally {
        requestInFlight = false;
        if (!disposed && sequence === requestSequenceRef.current) {
          setState((previous) => ({ ...previous, isLoading: false, isRefreshing: false }));
        }
      }
    };

    loadRef.current = () => {
      void load();
    };
    let autoRefreshTimer: ReturnType<typeof setInterval> | undefined;
    if (isAuthenticated) {
      void load();
      autoRefreshTimer = setInterval(() => {
        void load();
      }, JOURNAL_AUTO_REFRESH_MS);
    }
    return () => {
      // Leaving, hiding or re-keying aborts the in-flight request; a late
      // response is ignored by the sequence check.
      disposed = true;
      requestSequenceRef.current += 1;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      if (autoRefreshTimer) clearInterval(autoRefreshTimer);
      loadRef.current = () => {};
    };
  }, [active, filter, isAuthenticated, mode, requestKey, sessionScope, type]);

  const manualRefresh = useCallback(() => {
    loadRef.current();
  }, []);

  const scopeHasLoaded = state.hasLoaded && state.loadedSessionScope === sessionScope;
  return {
    ...state,
    requestKey,
    scopeHasLoaded,
    responseMatchesRequest: state.loadedRequestKey === requestKey,
    scopeFetchError: state.errorRequestKey === requestKey ? state.fetchError : null,
    // Rows of another scope are never exposed, even for one render.
    serverLogs: scopeHasLoaded ? state.serverLogs : EMPTY_LOGS,
    manualRefresh,
  };
}

const EMPTY_LOGS: JournalLogEntry[] = [];
