/**
 * Shared "close a single position immediately" flow used by the Trade row's
 * quick-close (X) action.
 *
 * Mirrors ClosePositionScreen.handleClosePosition: the row is removed
 * optimistically for instant feedback, the broker confirmation runs in the
 * background, and the position is restored (with an alert) if the close is
 * rejected. Centralised here so the row and the Close Position screen share
 * the exact same close semantics.
 */
import { Alert } from 'react-native';

import { positionsApi } from '../../api/positions';
import {
  classifyTradingError,
  createFrontendTradingError,
} from '../../api/tradingErrors';
import { appQueryClient } from '../../state/providers/AppProviders';
import { usePositionsState } from '../../state/positionsState';
import type { PositionItem } from '../../domain/tradingModels';
import {
  quoteActionBlockMessage,
  recordBlockedPriceAction,
  resolveSessionQuoteActionAvailability,
  type ExecutableQuoteInput,
} from '../../market/quoteIntegrity';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
} from '../../state/activeBrokerSession';
import { invalidateSessionQueryRoots } from '../../query/authenticatedQueryScope';
import { requestOrrnnDemoTradeAuth } from './tradeAuthPrompt';
import { beginProtectedPositionsMutation } from '../../state/positionsMutationBarrier';

const resolveExecutableClosePrice = (
  position: PositionItem,
  quote: ExecutableQuoteInput | null | undefined,
): number | undefined => {
  const quotePrice = position.side === 'buy' ? quote?.bid : quote?.ask;
  if (typeof quotePrice === 'number' && Number.isFinite(quotePrice) && quotePrice > 0) {
    return quotePrice;
  }
  const currentPrice = Number(position.currentPrice);
  if (Number.isFinite(currentPrice) && currentPrice > 0) {
    return currentPrice;
  }
  const openPrice = Number(position.openPrice);
  return Number.isFinite(openPrice) && openPrice > 0 ? openPrice : undefined;
};

/** Chart controls retain the position while the existing API confirms closure. */
export async function closePositionConfirmed(position: PositionItem, options: Readonly<{
  quote: ExecutableQuoteInput | null | undefined;
}>): Promise<void> {
  const availability = resolveSessionQuoteActionAvailability(options.quote, Date.now());
  if (!availability.allowed) throw new Error(quoteActionBlockMessage(availability));
  if (!isValidCloseTicket(position.id)) throw new Error('This position has no valid broker ticket.');
  const capture = captureActiveBrokerSession();
  if (!capture?.credentials.accessToken) throw new Error('Sign in before closing a position.');
  const provenance = getActiveBrokerSessionProvenance(capture.session);
  const fallbackClosePrice = resolveExecutableClosePrice(position, options.quote);
  const release = beginProtectedPositionsMutation();
  try {
    const response = await positionsApi.closePosition(position.id);
    if (!isActiveBrokerSessionProvenanceCurrent(provenance)) return;
    const state = usePositionsState.getState();
    state.recordClosedPosition(position, {
      closePrice: response?.price_close ?? response?.price ?? fallbackClosePrice,
      profit: response?.profit,
      closeTimeSeconds: response?.time,
      accountLogin: provenance.identity.accountLogin,
    });
    state.finishOptimisticClose(position.id);
    void invalidateSessionQueryRoots(appQueryClient, provenance.cacheNamespace, CLOSE_INVALIDATION_KEYS);
    globalThis.setTimeout?.(() => {
      if (!isActiveBrokerSessionProvenanceCurrent(provenance)) return;
      void invalidateSessionQueryRoots(appQueryClient, provenance.cacheNamespace, CLOSE_INVALIDATION_KEYS);
    }, 1200);
  } finally { release(); }
}

function isValidCloseTicket(value: unknown): value is string | number {
  return typeof value === 'number'
    ? Number.isInteger(value) && value > 0
    : typeof value === 'string' && /^\d+$/.test(value.trim());
}

// Caches that must refresh once a position actually closes so the History tab
// and account figures reflect the new state.
const CLOSE_INVALIDATION_KEYS = [
  'positionHistory',
  'accountDeals',
  'deals',
  'positions',
  'ordersByLogin',
  'accountSummary',
  'transactions',
];

/**
 * Closes a single open position right away without opening the Close Position
 * screen. Fire-and-forget: returns synchronously after the optimistic removal;
 * server confirmation and any rollback happen in the background.
 */
export function closePositionImmediately(
  position: PositionItem,
  options: Readonly<{
    quote: ExecutableQuoteInput | null | undefined;
    resolvedLogin?: string | null;
  }>,
): void {
  if (requestOrrnnDemoTradeAuth({
    kind: 'position-action',
    symbol: position.symbol,
    action: 'close',
  })) {
    return;
  }
  const quoteAvailability = resolveSessionQuoteActionAvailability(options.quote, Date.now());
  if (!quoteAvailability.allowed) {
    recordBlockedPriceAction('close_position_flow', quoteAvailability);
    const feedback = createFrontendTradingError(
      'Market Data Unavailable',
      quoteActionBlockMessage(quoteAvailability),
    );
    Alert.alert(feedback.title, feedback.message);
    return;
  }

  const ticketId = position.id;
  if (!isValidCloseTicket(ticketId)) {
    const feedback = createFrontendTradingError(
      'Position Error',
      'The position ticket is still loading. Try again in a moment.',
    );
    Alert.alert(feedback.title, feedback.message);
    return;
  }

  const sessionCapture = captureActiveBrokerSession();
  if (!sessionCapture?.credentials.accessToken) {
    const feedback = createFrontendTradingError(
      'Authentication Error',
      'The app does not have a valid local trading session. Log in again before closing a position.',
    );
    Alert.alert(feedback.title, feedback.message);
    return;
  }
  const actionProvenance = getActiveBrokerSessionProvenance(sessionCapture.session);

  // Remove the row instantly; restore it if the broker rejects the close.
  const closeSnapshot = { ...position };
  const fallbackClosePrice = resolveExecutableClosePrice(position, options.quote);
  const initialState = usePositionsState.getState();
  initialState.recordClosedPosition(closeSnapshot, {
    closePrice: fallbackClosePrice,
    accountLogin: options.resolvedLogin ?? actionProvenance.identity.accountLogin,
  });
  initialState.beginOptimisticClose(ticketId);

  void positionsApi
    .closePosition(ticketId)
    .then((response) => {
      if (!isActiveBrokerSessionProvenanceCurrent(actionProvenance)) return;
      const state = usePositionsState.getState();
      state.recordClosedPosition(closeSnapshot, {
        closePrice: response?.price_close ?? response?.price ?? fallbackClosePrice,
        profit: response?.profit,
        closeTimeSeconds: response?.time,
        accountLogin: options.resolvedLogin ?? actionProvenance.identity.accountLogin,
      });
      state.finishOptimisticClose(ticketId);

      void invalidateSessionQueryRoots(
        appQueryClient,
        actionProvenance.cacheNamespace,
        CLOSE_INVALIDATION_KEYS,
      );
      setTimeout(() => {
        if (!isActiveBrokerSessionProvenanceCurrent(actionProvenance)) return;
        void invalidateSessionQueryRoots(
          appQueryClient,
          actionProvenance.cacheNamespace,
          CLOSE_INVALIDATION_KEYS,
        );
      }, 1200);

      if (options.resolvedLogin) {
        void state.refreshPositions(options.resolvedLogin);
      }
    })
    .catch((error: unknown) => {
      if (!isActiveBrokerSessionProvenanceCurrent(actionProvenance)) return;
      const feedback = classifyTradingError(error, { action: 'close-position' });
      usePositionsState.getState().rollbackOptimisticClose(closeSnapshot);
      Alert.alert(feedback.title, feedback.message);
    });
}
