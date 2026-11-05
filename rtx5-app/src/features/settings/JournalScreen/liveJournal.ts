import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useDealsQuery } from '../../../query/deals';
import { useActiveBrokerQuerySession } from '../../../query/authenticatedQueryScope';
import { usePositionHistoryQuery } from '../../../query/positions';
import { useJournalState } from '../../../state/journalState';
import { useResolvedTradingLogin } from '../../../state/tradingLogin';
import {
  deriveClosedPositionsFromDeals,
  mergeClosedPositionSources,
} from '../../history/derivedClosedPositions';
import {
  mapClosedPositionToJournalEntry,
  mergeJournalEntries,
} from './liveJournalMapper';
import {
  filterClosedHistoryByRange,
  filterJournalEntriesByRetention,
  getJournalDayStartMs,
  getJournalNextDayStartMs,
} from './journalRetention';
import type { TradeJournalEntry } from './types';

const JOURNAL_QUERY_ACTIVATION_DELAY_MS = 8000;
const JOURNAL_QUERY_STALE_TIME_MS = 60_000;
const EMPTY_MANUAL_ENTRIES: TradeJournalEntry[] = [];

function useDeferredJournalQueries(active: boolean, cacheKey: number | undefined) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (!active) {
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
    }, JOURNAL_QUERY_ACTIVATION_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timerId);
      if (frameId !== null) {
        globalThis.cancelAnimationFrame?.(frameId);
      }
    };
  }, [active, cacheKey]);

  return active && ready;
}

export function useJournalTrades(active = true) {
  const querySession = useActiveBrokerQuerySession();
  const accountLogin = useResolvedTradingLogin();
  const manualEntries = useJournalState((state) => (
    active ? state.manualEntries : EMPTY_MANUAL_ENTRIES
  ));
  const pruneExpiredEntries = useJournalState((state) => state.pruneExpiredEntries);
  const [retentionNowMs, setRetentionNowMs] = useState(() => Date.now());
  // Drawer visibility must not re-render the full Journal screen. The live
  // queries are already delayed and focus-scoped by the route lifecycle.
  const enabled = active && accountLogin !== undefined;
  const queriesActive = useDeferredJournalQueries(enabled, accountLogin);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let midnightTimer: ReturnType<typeof setTimeout> | null = null;

    const updateRetentionClock = () => {
      const nowMs = Date.now();
      setRetentionNowMs(nowMs);
      pruneExpiredEntries(nowMs);
    };

    const scheduleMidnightCleanup = () => {
      if (midnightTimer) {
        clearTimeout(midnightTimer);
      }

      const nowMs = Date.now();
      const delayMs = Math.max(1000, getJournalNextDayStartMs(nowMs) - nowMs + 50);
      midnightTimer = setTimeout(() => {
        updateRetentionClock();
        scheduleMidnightCleanup();
      }, delayMs);
    };

    updateRetentionClock();
    scheduleMidnightCleanup();
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        updateRetentionClock();
        scheduleMidnightCleanup();
      }
    });
    return () => {
      appStateSubscription.remove();
      if (midnightTimer) {
        clearTimeout(midnightTimer);
      }
    };
  }, [active, pruneExpiredEntries]);

  const journalFrom = Math.floor(getJournalDayStartMs(retentionNowMs) / 1000);
  const journalTo = Math.floor(getJournalNextDayStartMs(retentionNowMs) / 1000);
  const dealsQuery = useDealsQuery(accountLogin, {
    enabled: queriesActive,
    from: journalFrom,
    to: journalTo,
    refetchInterval: false,
    refetchOnMount: false,
    staleTime: JOURNAL_QUERY_STALE_TIME_MS,
    subscribed: active,
  });
  const positionHistoryQuery = usePositionHistoryQuery(accountLogin, {
    enabled: queriesActive,
    pageLimit: 1000,
    maxPages: 1,
    refetchInterval: false,
    refetchOnMount: false,
    staleTime: JOURNAL_QUERY_STALE_TIME_MS,
    subscribed: active,
  });
  const refetchDeals = dealsQuery.refetch;
  const refetchPositionHistory = positionHistoryQuery.refetch;

  const derivedClosedPositions = useMemo(
    () => deriveClosedPositionsFromDeals(dealsQuery.data),
    [dealsQuery.data],
  );
  const rangedHistoryPositions = useMemo(
    () => filterClosedHistoryByRange(
      positionHistoryQuery.data ?? [],
      journalFrom,
      journalTo,
    ),
    [journalFrom, journalTo, positionHistoryQuery.data],
  );
  const mergedClosedPositions = useMemo(
    () => mergeClosedPositionSources(rangedHistoryPositions, derivedClosedPositions),
    [derivedClosedPositions, rangedHistoryPositions],
  );
  const liveEntries = useMemo(
    () => mergedClosedPositions.map(mapClosedPositionToJournalEntry),
    [mergedClosedPositions],
  );
  const retainedAccountEntries = useMemo(
    () => filterJournalEntriesByRetention(liveEntries, retentionNowMs),
    [liveEntries, retentionNowMs],
  );
  const retainedManualEntries = useMemo(
    () => filterJournalEntriesByRetention(manualEntries, retentionNowMs),
    [manualEntries, retentionNowMs],
  );
  const trades = useMemo(
    () => mergeJournalEntries(retainedAccountEntries, retainedManualEntries),
    [retainedAccountEntries, retainedManualEntries],
  );

  const refetch = useCallback(async () => {
    if (!enabled) {
      return false;
    }

    const [historyResult, dealsResult] = await Promise.all([
      refetchPositionHistory({ cancelRefetch: false }),
      refetchDeals({ cancelRefetch: false }),
    ]);
    return historyResult.isSuccess || dealsResult.isSuccess;
  }, [enabled, refetchDeals, refetchPositionHistory]);

  return {
    accountLogin,
    refreshScopeKey: querySession?.cacheNamespace ?? '',
    trades,
    liveEntries,
    manualEntries: retainedManualEntries,
    isError: enabled && retainedAccountEntries.length === 0
      && dealsQuery.isError
      && positionHistoryQuery.isError,
    refetch,
  };
}
