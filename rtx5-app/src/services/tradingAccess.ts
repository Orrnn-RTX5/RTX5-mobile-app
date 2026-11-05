import { captureActiveBrokerSession, subscribeActiveBrokerSession, getActiveBrokerSessionIdentity, updateActiveBrokerSessionCredentials } from '../state/activeBrokerSession';
import { isInvestorReadOnlySession } from '../api/investorSession';
import { publicRows } from '../api/orrnnDemoPublicMarket';
import { readExecutionQuote } from '../market/executionQuoteSource';
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
// The order endpoint owns final market/margin acceptance. The ticket prepares
// those previews before enabling Buy/Sell; submission rechecks local state only.
export function assertOrderReadiness(namespace: string, body: any): void {
  assertTradingSession(namespace);
  const symbol = String(body?.symbol ?? '');
  const instrument = hydrated!.instruments.find(row => row.symbol === symbol);
  const quote = readExecutionQuote(namespace, symbol);
  const availability = resolveQuoteActionAvailability(quote);
  if (!availability.allowed) throw new Error('A fresh executable quote is required.');
  const policyError = checkOrderPolicy(instrument, Number(body.volume ?? body.lots), body.side, hydrated!.account);
  if (policyError) throw new Error(policyError);
}
