import { useEffect, useRef } from 'react';

import { getActiveBrokerSession } from '../../../state/activeBrokerSession';
import { buildJournalSessionScopeKey } from '../../../state/journalSessionScope';
import { useLiveAccountState } from '../../../state/liveAccountState';
import { showSidebarDestination } from '../../../ui/components/sidebarDestinationHostController';

type EquityBaseline = {
  sessionScope: string;
  equity: number;
};

export function shouldOpenJournalForEquityTransition(
  previousEquity: number | undefined,
  nextEquity: number,
): boolean {
  return previousEquity !== undefined && previousEquity > 0 && nextEquity <= 0;
}

const accountLoginsMatch = (left: string | number, right: string | number): boolean => {
  const leftText = String(left).trim();
  const rightText = String(right).trim();
  if (leftText === rightText) return true;
  const leftNumber = Number(leftText);
  const rightNumber = Number(rightText);
  return leftText !== ''
    && rightText !== ''
    && Number.isFinite(leftNumber)
    && Number.isFinite(rightNumber)
    && leftNumber === rightNumber;
};

/**
 * Reveals the retained Journal when fresh equity for the active account moves
 * from a valid positive value to zero or below. Missing/stale metrics and old
 * account snapshots never establish a baseline or trigger navigation.
 */
export function BlownAccountJournalNavigator() {
  const baselineRef = useRef<EquityBaseline | null>(null);

  useEffect(() => useLiveAccountState.subscribe((metrics) => {
    const session = getActiveBrokerSession();
    if (!session) {
      baselineRef.current = null;
      return;
    }

    const sessionScope = buildJournalSessionScopeKey(session);
    if (baselineRef.current?.sessionScope !== sessionScope) {
      baselineRef.current = null;
    }

    const hasFreshEquity = metrics.metricFlags.equity
      && !metrics.staleMetricFlags.equity
      && Number.isFinite(metrics.equity)
      && accountLoginsMatch(metrics.login, session.accountLogin);
    if (!hasFreshEquity) return;

    const previousEquity = baselineRef.current?.equity;
    baselineRef.current = { sessionScope, equity: metrics.equity };
    if (shouldOpenJournalForEquityTransition(previousEquity, metrics.equity)) {
      showSidebarDestination('journal', 'programmatic');
    }
  }), []);

  return null;
}
