import { captureActiveBrokerSession, subscribeActiveBrokerSession, getActiveBrokerSessionIdentity, updateActiveBrokerSessionCredentials } from '../state/activeBrokerSession';
import { isInvestorReadOnlySession } from '../api/investorSession';
import { publicRows } from '../api/orrnnDemoPublicMarket';
import { useTradingState } from '../state/tradingState';
import { normalizeSymbol } from '../domain/symbols';
import { resolveQuoteActionAvailability } from '../market/quoteIntegrity';
import { checkOrderPolicy } from './tradingPolicy';
let hydrated: { namespace: string; instruments: Record<string, unknown>[]; account: any } | null = null;
subscribeActiveBrokerSession(event => { if (event.type !== 'credentials_updated') hydrated = null; });
export function acceptTradingHydration(namespace: string, me: any, account: any, catalog: unknown): boolean {
  const active = captureActiveBrokerSession();
  if (!active || active.session.cacheNamespace !== namespace || !me || !account || String(account.login ?? account.account_login) !== active.session.accountLogin ||
    me.broker_id !== undefined && me.broker_id !== active.session.brokerId || account.broker_id !== undefined && account.broker_id !== active.session.brokerId ||
    me.account_login !== undefined && String(me.account_login) !== active.session.accountLogin) return false;
  const instruments = publicRows(catalog, 'instruments'); if (!instruments.length) return false;
  // Hydrated permissions can further restrict a session; they never promote an investor login.
  if (!active.session.investor && (isInvestorReadOnlySession(me) || isInvestorReadOnlySession(account))) {
    updateActiveBrokerSessionCredentials(getActiveBrokerSessionIdentity(active.session), active.credentials, { investor: true });
  }
  hydrated = { namespace, account, instruments }; return true;
}
export function assertTradingSession(namespace: string) {
  const active = captureActiveBrokerSession();
  if (!active || active.session.cacheNamespace !== namespace || !active.credentials.accessToken || !/^\d+$/.test(active.session.accountLogin) || !/[1-9]/.test(active.session.accountLogin)) throw new Error('A current trading session is required.');
  if (active.session.investor) throw new Error('Investor sessions are read-only.');
  if (active.credentials.expiresAt && Date.parse(active.credentials.expiresAt) <= Date.now()) throw new Error('The trading session has expired.');
  if (hydrated?.namespace !== namespace) throw new Error('Account and trading policy are still loading.');
  if (hydrated.account.trade_enabled === false || hydrated.account.trading_enabled === false || ['disabled', 'blocked', 'closed'].includes(String(hydrated.account.status).toLowerCase())) throw new Error('Trading is disabled for this account.');
}
export async function assertOrderReadiness(namespace: string, body: any, read: (endpoint: string, options?: RequestInit) => Promise<Response>) {
  assertTradingSession(namespace);
  const symbol = String(body?.symbol ?? '');
  const instrument = hydrated!.instruments.find(row => row.symbol === symbol);
  const quote = useTradingState.getState().quotes[normalizeSymbol(symbol)];
  const availability = resolveQuoteActionAvailability(quote);
  if (!availability.allowed) throw new Error('A fresh executable quote is required.');
  const policyError = checkOrderPolicy(instrument, Number(body.volume ?? body.lots), body.side, hydrated!.account);
  if (policyError) throw new Error(policyError);
  const marketResponse = await read('/market/status/' + encodeURIComponent(symbol));
  if (!marketResponse.ok) throw new Error('Market status could not be verified.');
  const market: any = await marketResponse.json();
  if (market.trade_open !== true && market.market_state !== 'open') throw new Error('The market is closed or its status is unknown.');
  const marginResponse = await read('/calculate/margin', { method: 'POST', body: JSON.stringify({ account_login: body.account_login, symbol, side: body.side, volume: body.volume ?? body.lots }) });
  if (!marginResponse.ok) throw new Error('The broker could not verify margin and risk.');
  const margin: any = await marginResponse.json();
  if (!Number.isFinite(margin.required_margin) || margin.required_margin < 0 || !Number.isFinite(margin.free_margin) || margin.free_margin < margin.required_margin || !Number.isFinite(margin.max_lots) || Number(body.volume ?? body.lots) > margin.max_lots) throw new Error('Insufficient margin or incomplete risk calculation.');
  assertTradingSession(namespace);
  if (!resolveQuoteActionAvailability(useTradingState.getState().quotes[normalizeSymbol(symbol)]).allowed) throw new Error('The executable quote expired during risk checks.');
}
