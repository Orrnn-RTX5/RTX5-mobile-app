import { getPublicBrokerContext, subscribePublicBrokerContext, type PublicBrokerContext } from '../../state/publicBrokerContext';
import { clearPendingTradeAuthIntent, consumePendingTradeAuthIntent, savePendingTradeAuthIntent, type TradeAuthIntent } from './tradeAuthGate';
export type AuthScreen = 'guest' | 'choice' | 'login' | 'demo' | 'submitting' | 'hydrating' | 'ready' | 'recoverable-error';
export type AuthFlowState = Readonly<{ screen: AuthScreen; context: PublicBrokerContext | null; intent: TradeAuthIntent | null; attempt: number; form: 'login' | 'demo'; error: string }>;
let state: AuthFlowState = Object.freeze({ screen: 'guest', context: null, intent: null, attempt: 0, form: 'login', error: '' });
const listeners = new Set<() => void>();
let controller: AbortController | null = null;
let entryHandoff: { entryPath: string; context: PublicBrokerContext } | null = null;
const normalizeEntryPath = (path: string) => path.split(/[?#]/, 1)[0].replace(/\/\([^)]*\)/g, '').replace(/\/$/, '') || '/';
const isAuthEntryPath = (path: string) => /^\/(?:login|register|register-entry|settings\/broker-detail)$/.test(path);
const update = (patch: Partial<AuthFlowState>) => { state = Object.freeze({ ...state, ...patch }); listeners.forEach(listener => listener()); };
export const getAuthFlowState = () => state;
export const subscribeAuthFlow = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function dismissAuthFlow() { controller?.abort(); controller = null; entryHandoff = null; clearPendingTradeAuthIntent(); update({ screen: 'guest', intent: null, context: null, error: '', attempt: state.attempt + 1 }); }
export function openAuthFlow(intent?: TradeAuthIntent, form?: 'login' | 'demo', entryPath?: string) {
  if (state.screen !== 'guest' && state.screen !== 'ready') return;
  const context = getPublicBrokerContext(); if (!context) return;
  const path = entryPath ? normalizeEntryPath(entryPath) : '';
  entryHandoff = isAuthEntryPath(path) ? { entryPath: path, context } : null;
  clearPendingTradeAuthIntent();
  // Only Buy/Sell opens a draft afterward. Mutations and generic New Order never replay.
  const draft = intent?.symbol && intent.side && ['market-order', 'order-ticket'].includes(intent.kind) ? savePendingTradeAuthIntent(intent) : null;
  update({ screen: form ?? 'choice', context, intent: draft, attempt: state.attempt + 1, form: form ?? 'login', error: '' });
}
/** Preserve only the route entry/replacement explicitly owned by this flow. */
export function retainAuthEntryHandoff(nextPath: string): boolean {
  if (!entryHandoff || entryHandoff.context !== state.context || state.context !== getPublicBrokerContext() || state.screen === 'guest' || state.screen === 'ready') return false;
  const next = normalizeEntryPath(nextPath);
  if (next === entryHandoff.entryPath) return true;
  // React may coalesce the entry route and its immediate Quotes replacement.
  if (next === '/quotes') { entryHandoff = null; return true; }
  return false;
}
export const showAuthForm = (form: 'login' | 'demo') => { controller?.abort(); update({ screen: form, form, error: '', attempt: state.attempt + 1 }); };
export function beginAuthSubmission(): { state: AuthFlowState; signal: AbortSignal } | null {
  if (!['login', 'demo', 'recoverable-error'].includes(state.screen)) return null;
  controller?.abort(); controller = new AbortController(); update({ screen: 'submitting', attempt: state.attempt + 1, error: '' });
  return { state, signal: controller.signal };
}
export const isAuthAttemptCurrent = (attempt: number) => state.attempt === attempt && !controller?.signal.aborted && state.context === getPublicBrokerContext();
export function setAuthProgress(attempt: number, screen: AuthScreen, error = '') { if (isAuthAttemptCurrent(attempt)) update({ screen, error }); }
/** A securely committed ordinary login can browse while account data loads. */
export function completeAuthenticatedLogin(attempt: number): boolean {
  if (!isAuthAttemptCurrent(attempt) || state.screen !== 'hydrating' || state.form !== 'login' || state.intent) return false;
  entryHandoff = null;
  update({ screen: 'ready', error: '' });
  return true;
}
/** Authentication can return a draft once; it has no order transport or execution callback. */
export function completeAuthenticatedFlow(attempt: number, hydrationAccepted: boolean, investor: boolean): TradeAuthIntent | null {
  if (!isAuthAttemptCurrent(attempt) || state.screen !== 'hydrating' || !hydrationAccepted) return null;
  entryHandoff = null;
  const intent = consumePendingTradeAuthIntent(); update({ screen: 'ready', intent: null, error: '' });
  return investor ? null : intent;
}
subscribePublicBrokerContext(dismissAuthFlow);
