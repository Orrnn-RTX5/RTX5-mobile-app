import { useCallback, useEffect, useRef } from 'react';
import { Alert, Share } from 'react-native';
import type { PositionItem, QuoteItem } from '../../domain/tradingModels';
import { ordersApi } from '../../api/orders';
import { classifyTradingError } from '../../api/tradingErrors';
import { captureActiveBrokerSession } from '../../state/activeBrokerSession';
import { usePositionsState } from '../../state/positionsState';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState, type ActionSheetConfig } from '../../state/uiState';
import { isActiveSessionInvestorReadOnly, INVESTOR_READ_ONLY_MESSAGE } from '../../state/investorReadOnlySession';
import { closePositionConfirmed } from '../trade/closePositionFlow';
import { showTradePositionAction, hideTradePositionActionHost } from '../trade/tradePositionActionHostController';
import { getActiveSltpUnavailableMessage, isExistingPositionModifyBackendLocked } from '../trade/tradeBackendCapabilities';
import { resolveSessionQuoteActionAvailability, quoteActionBlockMessage } from '../../market/quoteIntegrity';
import { buildChartMarketOrderPayload } from './chartTradeActions';
import { createPositionActionGate, formatPositionLots, positionProfitDisplay, reverseConfirmedPosition,
  validatePositionIntent, validatePositionLevelIntent, positionControlKey, type ChartPositionScope, type ChartPositionAction } from './chartPositionControls';
import { formatLivePositionPnl } from '../trade/livePositionMetrics';
import { getModifyPositionTicketState, subscribeModifyPositionTicket } from '../trade/modifyPositionCoordinator';
import { normalizeChartOverlaySymbol } from './chartOverlays/symbolUtils';

type Inputs = {
  scope: ChartPositionScope;
  active: boolean;
  quote?: Partial<QuoteItem>;
  currency?: string;
  priceDigits: number;
  volumeBounds: { minVolume?: number; maxVolume?: number; stepVolume?: number };
  positions?: readonly PositionItem[];
  inject: (script: string) => void;
  feedback: (title: string, message: string) => void;
};

function volumeError(volume: number, bounds: Inputs['volumeBounds']): string | undefined {
  const { minVolume: min, maxVolume: max, stepVolume: step } = bounds;
  if (!(min && min > 0 && max && max >= min && step && step > 0)) return 'Broker volume limits and step are unavailable.';
  if (volume < min || volume > max || Math.abs(volume / step - Math.round(volume / step)) > 1e-7) {
    return 'The remaining volume does not satisfy the current broker order limits and volume step.';
  }
}

/** Native services own every authenticated operation; the WebView sends intents only. */
export function useChartPositionControls(inputs: Inputs) {
  const latest = useRef(inputs);
  latest.current = inputs;
  const gate = useRef(createPositionActionGate()).current;
  const modifyHostRevision = useRef<number | null>(null);
  const scopeKey = JSON.stringify(inputs.scope);
  const ticketSignature = JSON.stringify((inputs.positions ?? []).map(row => [row.id, row.symbol]));
  useEffect(() => () => {
    useUIState.getState().hideChartActionSheet();
    if (modifyHostRevision.current !== null) hideTradePositionActionHost(modifyHostRevision.current);
    modifyHostRevision.current = null;
  }, [scopeKey]);
  useEffect(() => {
    if (!inputs.active) return;
    const subscriptions = (inputs.positions ?? []).filter(row => normalizeChartOverlaySymbol(row.symbol) === normalizeChartOverlaySymbol(inputs.scope.symbol))
      .map(position => {
        const publish = () => {
          const owner = latest.current;
          if (JSON.stringify(owner.scope) !== scopeKey || !owner.active
            || captureActiveBrokerSession()?.session.cacheNamespace !== owner.scope.sessionScope) return;
          const state = getModifyPositionTicketState(position.id);
          const pending = state.mutationInFlight || state.phase === 'pending' || state.phase === 'reconciling';
          const error = state.lastResult?.error;
          const message = error ? classifyTradingError(error, { action: 'modify-position' }).message
            : ['unknown','changed_elsewhere','position_unavailable','rate_limited'].includes(state.phase)
              ? 'SL/TP was not confirmed. The latest broker levels were retained.' : undefined;
          owner.inject(`if(typeof updatePositionControlState==='function')updatePositionControlState(${JSON.stringify({
            ...owner.scope, positionId:position.id, symbol:position.symbol,
            positionKey:positionControlKey(owner.scope.sessionScope, position.id, position.symbol),
            source:'modification', state:pending ? 'pending' : state.phase === 'saved' || state.phase === 'idle' ? 'success' : 'error', message,
          })});true;`);
        };
        const unsubscribe = subscribeModifyPositionTicket(position.id, publish);
        const publishTradeState = () => {
          const owner = latest.current;
          if (!owner.active || JSON.stringify(owner.scope) !== scopeKey
            || captureActiveBrokerSession()?.session.cacheNamespace !== owner.scope.sessionScope) return;
          const key = positionControlKey(owner.scope.sessionScope, position.id, position.symbol);
          owner.inject(`if(typeof updatePositionControlState==='function')updatePositionControlState(${JSON.stringify({
            ...owner.scope, positionId:position.id, symbol:position.symbol, positionKey:key,
            source:'position-mutation', state:gate.isBusy(key) ? 'pending' : 'success',
          })});true;`);
        };
        const unsubscribeGate = gate.subscribe(positionControlKey(inputs.scope.sessionScope, position.id, position.symbol), publishTradeState);
        publish();
        publishTradeState();
        return () => { unsubscribe(); unsubscribeGate(); };
      });
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [scopeKey, ticketSignature, inputs.active]);

  const handle = useCallback((raw: Record<string, unknown>) => {
    const owner = { ...latest.current, scope: { ...latest.current.scope } };
    if (!owner.active || captureActiveBrokerSession()?.session.cacheNamespace !== owner.scope.sessionScope) return;
    const intent = validatePositionIntent(raw, owner.scope, usePositionsState.getState().positions);
    if (!intent) return;
    if (!gate.claim(intent)) {
      owner.inject(`if(typeof updatePositionControlState==='function')updatePositionControlState(${JSON.stringify({ ...intent,
        state:'error', message:'This position already has a pending action, or this request has already been handled.',
      })});true;`);
      return;
    }
    let selectedId = intent.positionId;
    let selectedSymbol = intent.symbol;
    const current = () => latest.current.active
      && JSON.stringify(latest.current.scope) === JSON.stringify(owner.scope)
      && captureActiveBrokerSession()?.session.cacheNamespace === owner.scope.sessionScope;
    const resolve = (): PositionItem => {
      if (!current()) throw new Error('The chart or account changed.');
      const position = usePositionsState.getState().positions.find(row => row.id === selectedId && row.symbol === selectedSymbol);
      if (!position || position.volume <= 0) throw new Error('This position is no longer open.');
      return position;
    };
    const status = (state: 'pending' | 'success' | 'error', message?: string) => {
      if (!current()) return;
      owner.inject(`if(typeof updatePositionControlState==='function')updatePositionControlState(${JSON.stringify({ ...intent, state, message })});true;`);
    };
    const report = (error: unknown) => {
      if (!current()) return;
      const replacementFailure = error && typeof error === 'object' && 'replacementFailure' in error
        ? (error as { replacementFailure: unknown }).replacementFailure : undefined;
      const result = replacementFailure !== undefined ? {
        title:'Replacement Order Failed',
        message:`Position closed, but the replacement order failed: ${classifyTradingError(replacementFailure, { action:'place-order' }).message}`,
      } : error instanceof Error ? { title: 'Position Action', message: error.message }
        : classifyTradingError(error, { action: 'place-order' });
      status('error', result.message);
      latest.current.feedback(result.title, result.message);
    };
    const quote = () => {
      const value = latest.current.quote;
      const availability = resolveSessionQuoteActionAvailability(value);
      if (!availability.allowed) throw new Error(quoteActionBlockMessage(availability));
      return value;
    };
    const assertTrading = () => {
      if (!current()) throw new Error('The chart or account changed.');
      if (isActiveSessionInvestorReadOnly()) throw new Error(INVESTOR_READ_ONLY_MESSAGE);
      if (getModifyPositionTicketState(selectedId).mutationInFlight) throw new Error('Wait for this position’s pending SL/TP modification.');
      quote();
    };
    const modifyReason = () => isExistingPositionModifyBackendLocked()
      ? getActiveSltpUnavailableMessage() : !Number.isSafeInteger(Number(selectedId))
        ? 'The current modification API requires a safe integer ticket; this broker ticket cannot be converted safely.'
        : undefined;
    const order = async (position: PositionItem, side: 'buy' | 'sell') => {
      if (!current()) return;
      assertTrading();
      const error = volumeError(position.volume, latest.current.volumeBounds);
      if (error) throw new Error(error);
      const capture = captureActiveBrokerSession();
      if (!capture || capture.session.cacheNamespace !== intent.sessionScope) throw new Error('The account changed.');
      await ordersApi.placeMarketOrder(buildChartMarketOrderPayload({
        accountLogin: capture.session.accountLogin, symbol: position.symbol, side, volume: position.volume,
      }));
    };
    const execute = (action: ChartPositionAction) => {
      const work = async () => {
        if (['close', 'add', 'reverse'].includes(action)
          && (action === 'reverse' || !useUserPreferences.getState().oneClickAccepted)) {
          const selected = resolve();
          const message = action === 'reverse'
            ? 'Close this exact position, wait for broker confirmation, then place the opposite trade using its remaining volume. The replacement can fail after the close succeeds.'
            : `${action === 'close' ? 'Close' : 'Add'} ${selected.side.toUpperCase()} ${formatPositionLots(selected.volume, latest.current.volumeBounds.stepVolume)} ${selected.symbol}?`;
          const approved = await new Promise<boolean>(answer => Alert.alert(action === 'reverse' ? 'Reverse position' : 'Confirm position action', message, [
            { text: 'Cancel', style: 'cancel', onPress: () => answer(false) },
            { text: 'Confirm', onPress: () => answer(true) },
          ], { cancelable: true, onDismiss: () => answer(false) }));
          if (!approved || !current()) return;
        }
        const position = resolve();
        if (action === 'share') {
          const profit = positionProfitDisplay(position, latest.current.quote);
          const data = `${position.symbol} ${position.side.toUpperCase()} ${formatPositionLots(position.volume, latest.current.volumeBounds.stepVolume)} lots\nEntry ${position.openPrice.toFixed(latest.current.priceDigits)}\nFloating P/L ${profit.estimated ? '≈' : ''}${profit.value === null ? 'Unavailable' : formatLivePositionPnl(profit.value)} ${latest.current.currency || '(currency unavailable)'}`;
          // Explicit preview contains display data only, never session/account identifiers.
          await new Promise<void>((resolvePreview) => Alert.alert('Share position preview', data, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolvePreview() },
            { text: 'Share', onPress: () => { if (current()) void Share.share({ message: data }).then(() => resolvePreview(), error => { report(error); resolvePreview(); }); else resolvePreview(); } },
          ], { cancelable: true, onDismiss: resolvePreview }));
          return;
        }
        assertTrading();
        if (action === 'tp' || action === 'sl') {
          const reason = modifyReason();
          if (reason) throw new Error(reason);
          modifyHostRevision.current = showTradePositionAction('modify', position.id, action);
          return;
        }
        if (action === 'close') await closePositionConfirmed(position, { quote: quote() });
        if (action === 'add') await order(position, position.side);
        if (action === 'reverse') {
          // Validate replacement volume before risking the confirmed close.
          const error = volumeError(position.volume, latest.current.volumeBounds);
          if (error) throw new Error(error);
          await reverseConfirmedPosition({
            close: () => closePositionConfirmed(position, { quote: quote() }),
            isCurrent: current,
            openOpposite: () => order(position, position.side === 'buy' ? 'sell' : 'buy'),
          });
        }
      };
      status('pending');
      void gate.run(positionControlKey(intent.sessionScope, selectedId, selectedSymbol), work).then(() => status('success'), report);
    };
    const confirm = (action: ChartPositionAction) => {
      try {
        resolve();
        execute(action);
      } catch (error) { report(error); }
    };
    if (intent.action !== 'details') { confirm(intent.action); return; }
    const openDetails = () => { try {
      const position = resolve();
      const availability = resolveSessionQuoteActionAvailability(owner.quote);
      const tradingReason = isActiveSessionInvestorReadOnly() ? INVESTOR_READ_ONLY_MESSAGE
        : !availability.allowed ? quoteActionBlockMessage(availability) : undefined;
      const modifyDisabled = tradingReason || modifyReason();
      const addDisabled = tradingReason || volumeError(position.volume, owner.volumeBounds);
      const profit = positionProfitDisplay(position, owner.quote);
      const estimateDetails = profit.estimated && profit.value !== null
        ? ` · Estimated P/L ${formatLivePositionPnl(profit.value)} ${owner.currency || '(currency unavailable)'}` : '';
      const row = (action: ChartPositionAction, label: string, disabledReason?: string, subtitle?: string): ActionSheetConfig['actions'][number] => ({
        label, disabled: Boolean(disabledReason), subtitle: disabledReason || subtitle,
        danger: action === 'close', onPress: () => confirm(action),
      });
      useUIState.getState().showChartActionSheet({
        title: `Position actions · ${position.symbol} · ${position.side.toUpperCase()} ${formatPositionLots(position.volume, owner.volumeBounds.stepVolume)} · ${position.id}${estimateDetails}`,
        detent: 'adaptive', runActionAfterClose: true,
        actions: [row('tp', 'Take profit', modifyDisabled, position.tp ? position.tp.toFixed(owner.priceDigits) : 'Add take profit'),
          row('sl', 'Stop loss', modifyDisabled, position.sl ? position.sl.toFixed(owner.priceDigits) : 'Add stop loss'),
          row('close', 'Close position', tradingReason), row('share', 'Share position'),
          row('add', 'Add same volume', addDisabled, 'Submit one additional market order'),
          row('reverse', 'Reverse position', addDisabled, 'Confirmed close, then opposite market order')],
      });
      status('success');
    } catch (error) { report(error); } };
    if (intent.groupPositionIds && intent.groupPositionIds.length > 1) {
      const positions = usePositionsState.getState().positions;
      const group = intent.groupPositionIds.map(id => positions.find(position => position.id === id));
      if (group.some(position => !position || !validatePositionIntent({ ...intent, positionId: position.id,
        symbol: position.symbol, positionKey: positionControlKey(intent.sessionScope, position.id, position.symbol) }, owner.scope, positions))) {
        report(new Error('The position group changed. Open it again.')); return;
      }
      useUIState.getState().showChartActionSheet({
        title: `${owner.scope.symbol} · Open positions`, detent: 'adaptive', searchable: true, runActionAfterClose: true,
        actions: group.map(position => {
          const row = position!; const profit = positionProfitDisplay(row, latest.current.quote);
          return { label: `${row.side.toUpperCase()} ${formatPositionLots(row.volume, owner.volumeBounds.stepVolume)} · ${profit.estimated ? '≈' : ''}${profit.value === null ? '—' : formatLivePositionPnl(profit.value)} ${owner.currency || ''}`,
            subtitle: `Position ${row.id} · Entry ${row.openPrice.toFixed(owner.priceDigits)}`,
            onPress: () => { selectedId = row.id; selectedSymbol = row.symbol; openDetails(); } };
        }),
      });
      status('success');
    } else openDetails();
  }, [gate]);

  const validateDrag = useCallback((raw: Record<string, unknown>) => {
    const state = latest.current;
    if (!state.active || captureActiveBrokerSession()?.session.cacheNamespace !== state.scope.sessionScope) return false;
    const intent = validatePositionLevelIntent(raw, state.scope, usePositionsState.getState().positions);
    if (!intent || isExistingPositionModifyBackendLocked()
      || getModifyPositionTicketState(intent.positionId).mutationInFlight || gate.isBusy(intent.positionKey)
      || isActiveSessionInvestorReadOnly() || !Number.isSafeInteger(Number(intent.positionId))) return false;
    return intent.phase === 'end' ? gate.claim({ ...intent, type:'CHART_POSITION_ACTION', action:intent.levelRole }) : true;
  }, [gate]);
  return { handle, validateDrag };
}
