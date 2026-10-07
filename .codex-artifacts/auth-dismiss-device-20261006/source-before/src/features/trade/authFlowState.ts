import { getPublicBrokerContext, subscribePublicBrokerContext, type PublicBrokerContext } from '../../state/publicBrokerContext';
import { clearPendingTradeAuthIntent, consumePendingTradeAuthIntent, savePendingTradeAuthIntent, type TradeAuthIntent } from './tradeAuthGate';
export type AuthScreen = 'guest' | 'choice' | 'login' | 'demo' | 'submitting' | 'hydrating' | 'ready' | 'recoverable-error';
export type AuthFlowState = Readonly<{ screen: AuthScreen; context: PublicBrokerContext | null; intent: TradeAuthIntent | null; attempt: number; form: 'login' | 'demo'; error: string }>;
let state: AuthFlowState = Object.freeze({ screen: 'guest', context: null, intent: null, attempt: 0, form: 'login', error: '' });
const listeners = new Set<() => void>();
let controller: AbortController | null = null;
const update = (patch: Partial<AuthFlowState>) => { state = Object.freeze({ ...state, ...patch }); listeners.forEach(listener => listener()); };
export const getAuthFlowState = () => state;
export const subscribeAuthFlow = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function dismissAuthFlow() { controller?.abort(); controller = null; clearPendingTradeAuthIntent(); update({ screen: 'guest', intent: null, context: null, error: '', attempt: state.attempt + 1 }); }
export function openAuthFlow(intent?: TradeAuthIntent, form?: 'login' | 'demo') {
  if (state.screen !== 'guest' && state.screen !== 'ready') return;
  const context = getPublicBrokerContext(); if (!context) return;
  clearPendingTradeAuthIntent();
  // Only Buy/Sell opens a draft afterward. Mutations and generic New Order never replay.
  const draft = intent?.symbol && intent.side && ['market-order', 'order-ticket'].includes(intent.kind) ? savePendingTradeAuthIntent(intent) : null;
  update({ screen: form ?? 'choice', context, intent: draft, attempt: state.attempt + 1, form: form ?? 'login', error: '' });
}
export const showAuthForm = (form: 'login' | 'demo') => { controller?.abort(); update({ screen: form, form, error: '', attempt: state.attempt + 1 }); };
export function beginAuthSubmission(): { state: AuthFlowState; signal: AbortSignal } | null {
  if (!['login', 'demo', 'recoverable-error'].includes(state.screen)) return null;
  controller?.abort(); controller = new AbortController(); update({ screen: 'submitting', attempt: state.attempt + 1, error: '' });
  return { state, signal: controller.signal };
}
export const isAuthAttemptCurrent = (attempt: number) => state.attempt === attempt && !controller?.signal.aborted && state.context === getPublicBrokerContext();
export function setAuthProgress(attempt: number, screen: AuthScreen, error = '') { if (isAuthAttemptCurrent(attempt)) update({ screen, error }); }
/** Authentication can return a draft once; it has no order transport or execution callback. */
export function completeAuthenticatedFlow(attempt: number, hydrationAccepted: boolean, investor: boolean): TradeAuthIntent | null {
  if (!isAuthAttemptCurrent(attempt) || state.screen !== 'hydrating' || !hydrationAccepted) return null;
  const intent = consumePendingTradeAuthIntent(); update({ screen: 'ready', intent: null, error: '' });
  return investor ? null : intent;
}
subscribePublicBrokerContext(dismissAuthFlow);
