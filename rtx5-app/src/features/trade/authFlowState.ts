import { getPublicBrokerContext, subscribePublicBrokerContext, type PublicBrokerContext } from '../../state/publicBrokerContext';
import { clearPendingTradeAuthIntent, consumePendingTradeAuthIntent, savePendingTradeAuthIntent, type TradeAuthIntent } from './tradeAuthGate';
export type AuthScreen = 'guest' | 'select-broker' | 'choice' | 'login' | 'demo' | 'submitting' | 'hydrating' | 'ready' | 'recoverable-error';
export type AuthFlowState = Readonly<{ screen: AuthScreen; context: PublicBrokerContext | null; intent: TradeAuthIntent | null; attempt: number; form: 'login' | 'demo'; variant?: 'login' | 'broker'; error: string }>;
let state: AuthFlowState = Object.freeze({ screen: 'guest', context: null, intent: null, attempt: 0, form: 'login', variant: 'login', error: '' });
const listeners = new Set<() => void>();
let controller: AbortController | null = null;
let entryHandoff: { entryPath: string; context: PublicBrokerContext } | null = null;
let deferredAuthEntry: { entryPath: string; context: PublicBrokerContext; form: 'login' | 'demo'; attempt: number } | null = null;
const normalizeEntryPath = (path: string) => path.split(/[?#]/, 1)[0].replace(/\/\([^)]*\)/g, '').replace(/\/$/, '') || '/';
const isAuthEntryPath = (path: string) => /^\/(?:login|register|register-entry|settings\/(?:broker-detail|brokers))$/.test(path);
const update = (patch: Partial<AuthFlowState>) => { state = Object.freeze({ ...state, ...patch }); listeners.forEach(listener => listener()); };
export const getAuthFlowState = () => state;
export const subscribeAuthFlow = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function dismissAuthFlow() { controller?.abort(); controller = null; entryHandoff = null; deferredAuthEntry = null; clearPendingTradeAuthIntent(); update({ screen: 'guest', intent: null, context: null, variant: 'login', error: '', attempt: state.attempt + 1 }); }
/** UIKit must finish replacing the native entry screen before presenting the root modal. */
export function deferAuthEntryUntilQuotes(form: 'login' | 'demo', entryPath: string): boolean {
  const context = getPublicBrokerContext();
  const path = normalizeEntryPath(entryPath);
  if (!context || !isAuthEntryPath(path)) return false;
  deferredAuthEntry = { entryPath: path, context, form, attempt: state.attempt };
  return true;
}
/** Called by the root host after the destination route has committed. */
export function completeDeferredAuthEntry(pathname: string): boolean {
  const entry = deferredAuthEntry;
  if (!entry) return false;
  const path = normalizeEntryPath(pathname);
  if (path === entry.entryPath) return false;
  deferredAuthEntry = null;
  if (path !== '/quotes' || entry.context !== getPublicBrokerContext() || entry.attempt !== state.attempt) return false;
  openAuthFlow(undefined, entry.form);
  return true;
}
export function openAuthFlow(intent?: TradeAuthIntent, form?: 'login' | 'demo', entryPath?: string) {
  if (state.screen !== 'guest' && state.screen !== 'ready') return;
  const context = getPublicBrokerContext(); if (!context) return;
  deferredAuthEntry = null;
  const path = entryPath ? normalizeEntryPath(entryPath) : '';
  entryHandoff = isAuthEntryPath(path) ? { entryPath: path, context } : null;
  clearPendingTradeAuthIntent();
  // Only Buy/Sell opens a draft afterward. Mutations and generic New Order never replay.
  const draft = intent?.symbol && intent.side && ['market-order', 'order-ticket'].includes(intent.kind) ? savePendingTradeAuthIntent(intent) : null;
  update({ screen: form ?? 'choice', context, intent: draft, attempt: state.attempt + 1, form: form ?? 'login', variant: form || intent ? 'login' : 'broker', error: '' });
}
/** A drawer request owns one modal, including broker selection on a cold start. */
export function requestAccountEntry(form: 'login' | 'demo') {
  if (state.screen !== 'guest' && state.screen !== 'ready') return;
  if (getPublicBrokerContext()) { openAuthFlow(undefined, form); return; }
  controller?.abort(); controller = null;
  entryHandoff = null; deferredAuthEntry = null; clearPendingTradeAuthIntent();
  update({ screen: 'select-broker', context: null, intent: null, form, variant: 'login', error: '', attempt: state.attempt + 1 });
}
/** Preserve only the route entry/replacement explicitly owned by this flow. */
export function retainAuthEntryHandoff(nextPath: string): boolean {
  if (!entryHandoff || entryHandoff.context !== state.context || state.context !== getPublicBrokerContext() || state.screen === 'guest' || state.screen === 'ready') return false;
  const next = normalizeEntryPath(nextPath);
  if (next === entryHandoff.entryPath) return true;
  // React may coalesce the entry route and its immediate Quotes replacement.
  if (next === '/quotes' && entryHandoff.entryPath !== '/settings/brokers') { entryHandoff = null; return true; }
  return false;
}
export const showAuthForm = (form: 'login' | 'demo') => { controller?.abort(); update({ screen: form, form, error: '', attempt: state.attempt + 1 }); };
/** Broker selection is a child of the open form, rather than a dismissal. */
export function beginAuthBrokerSelection(): boolean {
  if (!['choice', 'login', 'demo', 'recoverable-error'].includes(state.screen) || !state.context) return false;
  controller?.abort(); controller = null;
  entryHandoff = null; deferredAuthEntry = null; clearPendingTradeAuthIntent();
  update({ screen: 'select-broker', intent: null, error: '', attempt: state.attempt + 1 });
  return true;
}
export function cancelAuthBrokerSelection() {
  if (state.screen === 'select-broker' && state.context && state.context === getPublicBrokerContext()) showAuthForm(state.form);
}
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
subscribePublicBrokerContext(() => {
  const context = getPublicBrokerContext();
  // Both first-time selection and a form's broker picker return to the form.
  // Other broker changes still cancel authentication and its pending requests.
  if (state.screen === 'select-broker') {
    if (context) update({ screen: state.form, context, error: '', attempt: state.attempt + 1 });
    if (context || !state.context) return;
  }
  dismissAuthFlow();
});
