/**
 * Trade handling for ChartTradeButtons: retains the Order Ticket tap lock and
 * dispatches accepted one-click market orders immediately and concurrently.
 */
import React from 'react';
import { router } from 'expo-router';
import { classifyTradingError } from '../../../../api/tradingErrors';
import { usePlaceOrderExecutor } from '../../../../query/orders';
import { resolveTradingLogin } from '../../../../state/tradingLogin';
import { useUserPreferences } from '../../../../state/userPreferences';
import { runCriticalTradeAction } from '../../../../utils/actionLatency';
import { getApiLatencyNow } from '../../../../utils/apiLatency';
import type { TradeSide } from '../../../../domain/tradeSide';
import {
  quoteActionBlockMessage,
  recordBlockedPriceAction,
  type QuoteActionAvailability,
} from '../../../../market/quoteIntegrity';
import { buildChartMarketOrderPayload, getChartTradeAction } from '../../chartTradeActions';
import { validateChartTradeProtectionLevels } from '../../chartTradeOrderUtils';
import {
  CHART_TRADE_TAP_RELEASE_DELAY_MS,
  acquireChartTradeButtonSharedLock,
  getChartTradeButtonSharedLockSide,
  releaseChartTradeButtonSharedLock,
} from './sharedLock';
import { dispatchChartTradeImmediately } from './chartTradeDispatch';
import { resolveChartTradeActionDisabled } from './tradeAvailability';
import {
  hideOrderTicketLaunch,
  scheduleOrderTicketLaunchNavigation,
  showOrderTicketLaunch,
} from '../../../trade/orderTicketLaunchController';
import { redactDiagnosticValue } from '../../../../utils/securityRedaction';
import { resolveBrokerExecutionEvidence } from '../../../../api/orders/executionEvidence';
import { normalizeSymbol } from '../../../../domain/symbols';
import {
  publishChartProtectionDraftSubmission,
  releaseChartProtectionDraftSubmission,
} from '../../chartProtectionDraftLifecycle';
import {
  getActiveSltpUnavailableMessage,
  isNewMarketOrderProtectionBackendLocked,
  SLTP_COMING_SOON_TITLE,
} from '../../../trade/tradeBackendCapabilities';
import type { ChartTradeQueueEvent } from '../ChartTradeReceiptStack';
import { requestOrrnnDemoTradeAuth } from '../../../trade/tradeAuthPrompt';
import { markTradeIntent } from '../../../../utils/tradeIntent';

const CHART_TRADE_DIAGNOSTICS_ENABLED =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CHART_TRADE === 'true';
let nextChartTradeReceiptId = 1;

const logChartTradeDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (CHART_TRADE_DIAGNOSTICS_ENABLED) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const warnChartTradeDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (CHART_TRADE_DIAGNOSTICS_ENABLED) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

type TradeFeedback = {
  visible: boolean;
  type: 'success' | 'error';
  title?: string;
  message?: string;
  side?: TradeSide;
  symbol?: string;
  ticket?: string;
  price?: number;
  volume?: number;
  executedAt?: string;
  executionConfirmed?: boolean;
  protectionDraftId?: string;
  /** Immutable chart-window owner captured when the action was submitted. */
  chartWindowPaneId?: string;
};

type AcceptedChartTrade = {
  id: number;
  side: TradeSide;
  symbol: string;
  tradingLogin: string | number;
  volume: number;
  comment: string;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  protectionDraftId?: string;
  chartWindowPaneId?: string;
  acceptedAtMs: number;
};

export type TradeHandlerOptions = {
  symbol: string;
  variant?: 'compact' | 'mt5-market';
  comment?: string;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  protectionDraftId?: string;
  pointSize?: number;
  lotSize: number;
  quoteActionAllowed: boolean;
  /** Imperative per-symbol read used at tap time, never a render snapshot. */
  getCurrentQuoteActionAvailability: () => QuoteActionAvailability;
  /** Optional visible-pane gate, rechecked synchronously on every trade tap. */
  isSymbolExecutionOwner?: () => boolean;
  /** Stable owner used to keep asynchronous trade feedback in its source pane. */
  chartWindowPaneId?: string;
  onTradeResult?: (feedback: TradeFeedback) => void;
  onTradeQueueEvent?: (event: ChartTradeQueueEvent) => void;
};

export function useTradeHandler({
  symbol,
  variant = 'compact',
  comment,
  stopLossPrice,
  takeProfitPrice,
  protectionDraftId,
  pointSize = 0.00001,
  lotSize,
  quoteActionAllowed,
  getCurrentQuoteActionAvailability,
  isSymbolExecutionOwner,
  chartWindowPaneId,
  onTradeResult,
  onTradeQueueEvent,
}: TradeHandlerOptions) {
  const oneClickAccepted = useUserPreferences((s) => s.oneClickAccepted);
  const currentChartSymbol = useUserPreferences((s) => s.chartSymbol);
  const isPublicDemoTradePrompt = useUserPreferences(
    (state) => !state.isLoggedIn,
  );
  const placeOrder = usePlaceOrderExecutor();
  const [activeSide, setActiveSide] = React.useState<TradeSide | null>(null);
  const activeSideResetTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tradeTapLockRef = React.useRef(false);
  const tradeTapLockSideRef = React.useRef<TradeSide | null>(null);
  const mountedRef = React.useRef(true);
  const onTradeResultRef = React.useRef(onTradeResult);
  onTradeResultRef.current = onTradeResult;
  const onTradeQueueEventRef = React.useRef(onTradeQueueEvent);
  onTradeQueueEventRef.current = onTradeQueueEvent;
  const chartWindowPaneIdRef = React.useRef(chartWindowPaneId);
  chartWindowPaneIdRef.current = chartWindowPaneId;
  const currentQuoteActionAvailabilityRef = React.useRef(getCurrentQuoteActionAvailability);
  currentQuoteActionAvailabilityRef.current = getCurrentQuoteActionAvailability;
  const resolveCurrentQuoteActionAvailability = React.useCallback((): QuoteActionAvailability => {
    try {
      return currentQuoteActionAvailabilityRef.current();
    } catch {
      return { allowed: false, reason: 'missing_quote' };
    }
  }, []);
  const symbolExecutionOwnerRef = React.useRef(isSymbolExecutionOwner);
  symbolExecutionOwnerRef.current = isSymbolExecutionOwner;
  const resolveSymbolExecutionOwnership = React.useCallback(() => {
    const customOwnershipCheck = symbolExecutionOwnerRef.current;
    if (customOwnershipCheck) {
      try {
        return customOwnershipCheck() === true;
      } catch {
        // A custom chart-window ownership check must fail closed.
        return false;
      }
    }
    return normalizeSymbol(useUserPreferences.getState().chartSymbol) === normalizeSymbol(symbol);
  }, [symbol]);
  const isCurrentChartSymbol = isSymbolExecutionOwner
    ? resolveSymbolExecutionOwnership()
    : normalizeSymbol(currentChartSymbol) === normalizeSymbol(symbol);
  const emitTradeResult = React.useCallback((
    feedback: TradeFeedback,
    ownerPaneId = chartWindowPaneIdRef.current,
  ) => {
    if (!mountedRef.current) return;
    try {
      onTradeResultRef.current?.(
        ownerPaneId
          ? { ...feedback, chartWindowPaneId: ownerPaneId }
          : feedback,
      );
    } catch (error) {
      warnChartTradeDiagnostic('[Trade] result presentation failed', error);
    }
  }, []);
  const emitTradeQueueEvent = React.useCallback((
    acceptedTrade: AcceptedChartTrade,
    status: ChartTradeQueueEvent['status'],
    feedback?: TradeFeedback,
  ) => {
    if (!mountedRef.current) return;
    const ownedFeedback = feedback && acceptedTrade.chartWindowPaneId
      ? { ...feedback, chartWindowPaneId: acceptedTrade.chartWindowPaneId }
      : feedback;
    try {
      onTradeQueueEventRef.current?.({
        queueId: acceptedTrade.id,
        status,
        side: acceptedTrade.side,
        symbol: acceptedTrade.symbol,
        volume: acceptedTrade.volume,
        ...(acceptedTrade.chartWindowPaneId
          ? { chartWindowPaneId: acceptedTrade.chartWindowPaneId }
          : {}),
        ...(ownedFeedback ? { feedback: ownedFeedback } : {}),
      });
    } catch (error) {
      warnChartTradeDiagnostic('[Trade] receipt presentation failed', error);
    }
  }, []);
  const reportAcceptedTradeResult = (
    acceptedTrade: AcceptedChartTrade,
    status: Extract<ChartTradeQueueEvent['status'], 'confirmed' | 'failed' | 'unconfirmed'>,
    feedback: TradeFeedback,
  ) => {
    if (onTradeQueueEventRef.current) {
      emitTradeQueueEvent(acceptedTrade, status, feedback);
      return;
    }
    // Backward-compatible fallback for any chart button host that has not yet
    // mounted the independent MT5-style receipt stack.
    emitTradeResult(feedback, acceptedTrade.chartWindowPaneId);
  };

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (activeSideResetTimeoutRef.current) {
        clearTimeout(activeSideResetTimeoutRef.current);
        activeSideResetTimeoutRef.current = null;
      }
      tradeTapLockRef.current = false;
      if (tradeTapLockSideRef.current) {
        releaseChartTradeButtonSharedLock(tradeTapLockSideRef.current);
        tradeTapLockSideRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (activeSideResetTimeoutRef.current) {
      clearTimeout(activeSideResetTimeoutRef.current);
      activeSideResetTimeoutRef.current = null;
    }
    setActiveSide(null);
    tradeTapLockRef.current = false;
    if (tradeTapLockSideRef.current) {
      releaseChartTradeButtonSharedLock(tradeTapLockSideRef.current);
      tradeTapLockSideRef.current = null;
    }
  }, [symbol]);

  const clearActiveTradeSide = (side: TradeSide, delayMs = 0) => {
    if (activeSideResetTimeoutRef.current) {
      clearTimeout(activeSideResetTimeoutRef.current);
      activeSideResetTimeoutRef.current = null;
    }

    const clearSide = () => {
      setActiveSide((currentSide) => (currentSide === side ? null : currentSide));
      activeSideResetTimeoutRef.current = null;
    };

    if (delayMs > 0) {
      activeSideResetTimeoutRef.current = setTimeout(clearSide, delayMs);
      return;
    }

    clearSide();
  };

  const markActiveTradeSide = (side: TradeSide) => {
    if (activeSideResetTimeoutRef.current) {
      clearTimeout(activeSideResetTimeoutRef.current);
      activeSideResetTimeoutRef.current = null;
    }
    setActiveSide(side);
  };

  const releaseTradeTapLock = (delayMs = 0) => {
    const lockedSide = tradeTapLockSideRef.current;
    tradeTapLockRef.current = false;
    tradeTapLockSideRef.current = null;
    if (lockedSide) {
      releaseChartTradeButtonSharedLock(lockedSide, delayMs);
      clearActiveTradeSide(lockedSide, delayMs);
    }
  };

  const dispatchAcceptedChartTrade = (acceptedTrade: AcceptedChartTrade) => {
    const action = getChartTradeAction(acceptedTrade.side);
    // Every accepted tap reaches this function independently in the same turn.
    const payload = buildChartMarketOrderPayload({
      accountLogin: acceptedTrade.tradingLogin,
      symbol: acceptedTrade.symbol,
      side: action.side,
      volume: acceptedTrade.volume,
      comment: acceptedTrade.comment,
      stopLossPrice: acceptedTrade.stopLossPrice,
      takeProfitPrice: acceptedTrade.takeProfitPrice,
    });
    const requestStartedAtMs = getApiLatencyNow();
    const dispatchDelayMs = Math.max(
      0,
      Math.round(requestStartedAtMs - acceptedTrade.acceptedAtMs),
    );

    logChartTradeDiagnostic('[TRADE-DISPATCH]', {
      queueId: acceptedTrade.id,
      side: action.side,
      symbol: acceptedTrade.symbol,
      volume: acceptedTrade.volume,
      dispatchDelayMs,
      mode: 'immediate-concurrent',
      timestamp: new Date().toISOString(),
    });
    logChartTradeDiagnostic('[TRADE-PAYLOAD]', {
      queueId: acceptedTrade.id,
      symbol: payload.symbol,
      side: payload.side,
      action: payload.side,
      orderType: action.orderType,
      command: payload.side,
      tradeType: action.orderType,
      volume: acceptedTrade.volume,
      priceSource: action.priceSource,
      rawPayload: payload,
    });

    if (acceptedTrade.protectionDraftId) {
      publishChartProtectionDraftSubmission(acceptedTrade.protectionDraftId);
    }
    let settled = false;
    const claimSettlement = () => {
      if (settled) return false;
      settled = true;
      return true;
    };
    placeOrder(payload, {
      onSuccess: (data: any) => {
        if (!claimSettlement()) return;
        if (!mountedRef.current) {
          if (acceptedTrade.protectionDraftId) {
            releaseChartProtectionDraftSubmission(acceptedTrade.protectionDraftId);
          }
          return;
        }
        const backendMs = Math.max(0, Math.round(getApiLatencyNow() - requestStartedAtMs));
        logChartTradeDiagnostic('[TRADE-RESPONSE]', {
          queueId: acceptedTrade.id,
          requestSide: action.side,
          result: data?.status ?? 'success',
          backendSide: data?.side ?? null,
          dispatchDelayMs,
          backendMs,
          rawResponse: data,
        });
        const responseStatus = String(data?.status ?? '').trim().toLowerCase();
        if (['rejected', 'failed', 'error'].includes(responseStatus)) {
          const feedback = classifyTradingError(
            {
              status: 400,
              data: {
                message: data?.comment || `Server returned status: ${data?.status}`,
              },
            },
            { action: 'place-order' },
          );
          const rejectedFeedback: TradeFeedback = {
            visible: true,
            type: 'error',
            title: feedback.title,
            message: feedback.message,
            side: action.side,
          };
          try {
            reportAcceptedTradeResult(acceptedTrade, 'failed', rejectedFeedback);
          } finally {
            if (acceptedTrade.protectionDraftId) {
              releaseChartProtectionDraftSubmission(acceptedTrade.protectionDraftId);
            }
          }
          return;
        }
        const executionEvidence = resolveBrokerExecutionEvidence(data);
        const executionFeedback: TradeFeedback = executionEvidence.confirmed
          ? {
            visible: true,
            type: 'success',
            executionConfirmed: true,
            title: 'Order Executed',
            side: action.side,
            symbol: acceptedTrade.symbol,
            ticket: String(executionEvidence.ticket),
            price: executionEvidence.executionPrice,
            volume: acceptedTrade.volume,
            executedAt: new Date().toLocaleTimeString(),
            ...(acceptedTrade.protectionDraftId
              ? { protectionDraftId: acceptedTrade.protectionDraftId }
              : {}),
          }
          : {
            visible: true,
            type: 'success',
            executionConfirmed: false,
            title: 'Order Submitted — Confirmation Pending',
            message: 'The broker accepted the request but did not return both a ticket and execution price. Verify it in Positions or Orders before acting on it.',
            side: action.side,
            symbol: acceptedTrade.symbol,
            ...(executionEvidence.ticket !== undefined
              ? { ticket: String(executionEvidence.ticket) }
              : {}),
            ...(executionEvidence.executionPrice !== undefined
              ? { price: executionEvidence.executionPrice }
              : {}),
            volume: acceptedTrade.volume,
            ...(acceptedTrade.protectionDraftId
              ? { protectionDraftId: acceptedTrade.protectionDraftId }
              : {}),
          };
        reportAcceptedTradeResult(
          acceptedTrade,
          executionEvidence.confirmed ? 'confirmed' : 'unconfirmed',
          executionFeedback,
        );
      },
      onError: (err: any) => {
        if (!claimSettlement()) return;
        const backendMs = Math.max(0, Math.round(getApiLatencyNow() - requestStartedAtMs));
        const feedback = classifyTradingError(err, { action: 'place-order' });
        warnChartTradeDiagnostic('[TRADE-RESPONSE]', {
          queueId: acceptedTrade.id,
          requestSide: action.side,
          result: 'error',
          backendSide: err?.response?.data?.side ?? err?.data?.side ?? null,
          dispatchDelayMs,
          backendMs,
          rawResponse: err?.response?.data ?? err?.data ?? err,
        });
        warnChartTradeDiagnostic('[Trade] error', feedback.kind, feedback.title, '|', feedback.detail ?? feedback.message);
        const rejectedFeedback: TradeFeedback = {
          visible: true,
          type: 'error',
          title: feedback.title,
          message: feedback.message,
          side: action.side,
        };
        try {
          reportAcceptedTradeResult(acceptedTrade, 'failed', rejectedFeedback);
        } finally {
          if (acceptedTrade.protectionDraftId) {
            releaseChartProtectionDraftSubmission(acceptedTrade.protectionDraftId);
          }
        }
      },
      onSettled: () => {
        // Broker-session changes intentionally suppress stale response data.
        // Remove only this receipt and release only its exact draft in that case.
        if (!claimSettlement()) return;
        try {
          emitTradeQueueEvent(acceptedTrade, 'cancelled');
        } finally {
          if (acceptedTrade.protectionDraftId) {
            releaseChartProtectionDraftSubmission(acceptedTrade.protectionDraftId);
          }
        }
      },
    });
  };

  const executeTrade = (side: TradeSide) => {
    const action = getChartTradeAction(side);
    const stateChartSymbol = useUserPreferences.getState().chartSymbol;
    if (!resolveSymbolExecutionOwnership()) {
      logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
        side,
        buttonPressed: action.buttonPressed,
        symbol,
        currentChartSymbol: stateChartSymbol,
        displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
        sidePassedToHandler: action.side,
        ignored: true,
        reason: isSymbolExecutionOwner ? 'stale-chart-window' : 'stale-symbol',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (requestOrrnnDemoTradeAuth({
      kind: oneClickAccepted || variant === 'mt5-market' ? 'market-order' : 'order-ticket',
      symbol,
      side,
      origin: 'chart',
    })) {
      return;
    }
    // Normalize once — hot path used to normalize both sides twice.
    if (!isSymbolExecutionOwner && normalizeSymbol(stateChartSymbol) !== normalizeSymbol(symbol)) {
      logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
        side,
        buttonPressed: action.buttonPressed,
        symbol,
        currentChartSymbol: stateChartSymbol,
        displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
        sidePassedToHandler: action.side,
        ignored: true,
        reason: 'stale-symbol',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ── One-click OFF: open New Order as a sidebar-class retained handoff ──
    // Shell first (UI thread), then lock + route — no heavy validation.
    // The SL/TP trade sheet (mt5-market variant) IS the explicit order form:
    // its Buy/Sell always place the market order directly, exactly like MT5's
    // New Order screen, regardless of the one-click preference.
    // Read the exact pane symbol from the imperative quote cache at touch time.
    // Split panes render independently, so a render-captured quote must not
    // block a newly fresh pane or authorize one whose final tick went stale.
    const currentQuoteAvailability = resolveCurrentQuoteActionAvailability();
    if (!currentQuoteAvailability.allowed) {
      recordBlockedPriceAction('chart_trade', currentQuoteAvailability);
      emitTradeResult({
        visible: true,
        type: 'error',
        title: 'Market Data Unavailable',
        message: quoteActionBlockMessage(currentQuoteAvailability),
        side: action.side,
      });
      return;
    }

    if (!oneClickAccepted && variant !== 'mt5-market') {
      if (tradeTapLockRef.current) {
        logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
          side,
          buttonPressed: action.buttonPressed,
          symbol,
          displayedLabel: action.displayLabel,
          sidePassedToHandler: action.side,
          ignored: true,
          lockSide: getChartTradeButtonSharedLockSide(),
          reason: 'tap-lock',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      if (!acquireChartTradeButtonSharedLock(action.side)) {
        logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
          side,
          buttonPressed: action.buttonPressed,
          symbol,
          displayedLabel: action.displayLabel,
          sidePassedToHandler: action.side,
          ignored: true,
          lockSide: getChartTradeButtonSharedLockSide(),
          reason: 'shared-tap-lock',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Paint retained New Order shell in this touch turn before any setState.
      const launchRevision = showOrderTicketLaunch(symbol, 'chart');

      tradeTapLockRef.current = true;
      tradeTapLockSideRef.current = action.side;

      const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
      const normalizedStopLossPrice = Number(stopLossPrice);
      const normalizedTakeProfitPrice = Number(takeProfitPrice);
      const hasStopLossPrice = Number.isFinite(normalizedStopLossPrice) && normalizedStopLossPrice > 0;
      const hasTakeProfitPrice = Number.isFinite(normalizedTakeProfitPrice) && normalizedTakeProfitPrice > 0;

      // Busy chrome after shell is visible so it does not compete with first paint.
      markActiveTradeSide(action.side);

      logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
        side,
        buttonPressed: action.buttonPressed,
        symbol,
        displayedLabel: action.displayLabel,
        sidePassedToHandler: action.side,
        timestamp: new Date().toISOString(),
      });

      const releaseOpenPathLock = () => {
        releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
      };

      // Real ticket mounts after one paint frame (see scheduler).
      scheduleOrderTicketLaunchNavigation(
        launchRevision,
        () => {
          try {
            router.push({
              pathname: '/trade/order-ticket',
              params: {
                symbol,
                origin: 'chart',
                side: action.side,
                ...(hasStopLossPrice ? { sl: String(normalizedStopLossPrice) } : {}),
                ...(hasTakeProfitPrice ? { tp: String(normalizedTakeProfitPrice) } : {}),
                ...(protectionDraftId ? { protectionDraftId } : {}),
                ...(trimmedComment ? { comment: trimmedComment } : {}),
              },
            });
          } catch (navErr: any) {
            hideOrderTicketLaunch(launchRevision);
            warnChartTradeDiagnostic('[Trade] navigation failed', navErr);
            emitTradeResult({
              visible: true, type: 'error',
              title: 'Navigation Error',
              message: navErr?.message || 'Could not open the order ticket screen.',
              side: action.side,
            });
          } finally {
            releaseOpenPathLock();
          }
        },
        () => {
          hideOrderTicketLaunch(launchRevision);
          releaseOpenPathLock();
        },
      );
      return;
    }

    // ── One-click ON: place market order (validation required) ───────────
    const volume = Number(lotSize);
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    const normalizedStopLossPrice = Number(stopLossPrice);
    const normalizedTakeProfitPrice = Number(takeProfitPrice);
    const hasStopLossPrice = Number.isFinite(normalizedStopLossPrice) && normalizedStopLossPrice > 0;
    const hasTakeProfitPrice = Number.isFinite(normalizedTakeProfitPrice) && normalizedTakeProfitPrice > 0;
    const authState = useUserPreferences.getState();
    const authToken = authState.accountDetails?.credentials?.accessToken;
    const tradingLogin = resolveTradingLogin();

    logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
      side,
      buttonPressed: action.buttonPressed,
      symbol,
      displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
      sidePassedToHandler: action.side,
      timestamp: new Date().toISOString(),
    });

    if (!authToken) {
      emitTradeResult({
        visible: true, type: 'error',
        title: 'Sign In Required',
        message: 'Please sign in to your trading account before placing orders.',
        side: action.side,
      });
      return;
    }

    if (!tradingLogin) {
      emitTradeResult({
        visible: true, type: 'error',
        title: 'No Trading Account',
        message: 'No active trading account is selected. Open the account menu and choose one, then try again.',
        side: action.side,
      });
      return;
    }

    if (!Number.isFinite(volume) || volume <= 0) {
      emitTradeResult({
        visible: true, type: 'error',
        title: 'Invalid Lot Size',
        message: `Volume must be greater than 0. Current: ${lotSize}`,
        side: action.side,
      });
      return;
    }

    if (
      (hasStopLossPrice || hasTakeProfitPrice) &&
      isNewMarketOrderProtectionBackendLocked()
    ) {
      emitTradeResult({
        visible: true,
        type: 'error',
        title: SLTP_COMING_SOON_TITLE,
        message: getActiveSltpUnavailableMessage(),
        side: action.side,
      });
      return;
    }

    // Skip SL/TP math when neither protection is set (common one-click path).
    if (hasStopLossPrice || hasTakeProfitPrice) {
      const protectionValidation = validateChartTradeProtectionLevels({
        side: action.side,
        entryPrice: action.side === 'buy'
          ? currentQuoteAvailability.ask
          : currentQuoteAvailability.bid,
        slEnabled: hasStopLossPrice,
        slPrice: hasStopLossPrice ? normalizedStopLossPrice : 0,
        tpEnabled: hasTakeProfitPrice,
        tpPrice: hasTakeProfitPrice ? normalizedTakeProfitPrice : 0,
        pointSize,
      });

      if (!protectionValidation.valid) {
        emitTradeResult({
          visible: true,
          type: 'error',
          title: 'Invalid SL/TP',
          message: protectionValidation.message,
          side: action.side,
        });
        return;
      }
    }

    logChartTradeDiagnostic('[Trade] one-click path, login=', tradingLogin);
    const acceptedTrade: AcceptedChartTrade = {
      id: nextChartTradeReceiptId,
      side: action.side,
      symbol,
      tradingLogin,
      volume,
      comment: trimmedComment,
      ...(hasStopLossPrice ? { stopLossPrice: normalizedStopLossPrice } : {}),
      ...(hasTakeProfitPrice ? { takeProfitPrice: normalizedTakeProfitPrice } : {}),
      ...(protectionDraftId ? { protectionDraftId } : {}),
      ...(chartWindowPaneId ? { chartWindowPaneId } : {}),
      acceptedAtMs: getApiLatencyNow(),
    };
    nextChartTradeReceiptId += 1;
    try {
      dispatchChartTradeImmediately({
        trade: acceptedTrade,
        emitPending: (trade) => {
          emitTradeQueueEvent(trade, 'pending');
          logChartTradeDiagnostic('[TRADE-ACCEPTED]', {
            queueId: trade.id,
            side: trade.side,
            symbol: trade.symbol,
            volume: trade.volume,
            mode: 'immediate-concurrent',
            timestamp: new Date().toISOString(),
          });
        },
        dispatch: dispatchAcceptedChartTrade,
      });
    } catch (error) {
      const feedback = classifyTradingError(error, { action: 'place-order' });
      const dispatchFailure: TradeFeedback = {
        visible: true,
        type: 'error',
        title: feedback.title,
        message: feedback.message,
        side: action.side,
      };
      try {
        reportAcceptedTradeResult(acceptedTrade, 'failed', dispatchFailure);
      } finally {
        if (acceptedTrade.protectionDraftId) {
          releaseChartProtectionDraftSubmission(acceptedTrade.protectionDraftId);
        }
      }
    }
  };

  const handleTrade = (side: TradeSide) => {
    // Tap time for the Journal's order latency telemetry.
    markTradeIntent();
    return runCriticalTradeAction(`chart.${variant}.trade.${side}`, () => executeTrade(side));
  };

  const isChartTradeActionBusy = (side: TradeSide) => activeSide === side && tradeTapLockRef.current;
  const chartTradeActionDisabled = resolveChartTradeActionDisabled({
    isCurrentChartSymbol,
    oneClickAccepted,
    quoteActionAllowed,
  });
  // This side-specific signal is reserved for in-flight feedback. Quote
  // readiness disables and dims both controls through chartTradeActionDisabled.
  const isChartTradeActionVisuallyLocked = (side: TradeSide) => isChartTradeActionBusy(side);

  return {
    handleTrade,
    isChartTradeActionBusy,
    isChartTradeActionVisuallyLocked,
    chartTradeActionDisabled,
    isPublicDemoTradePrompt,
    isCurrentChartSymbol,
  };
}

export type { TradeFeedback };
