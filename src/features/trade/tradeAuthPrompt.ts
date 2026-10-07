import { captureActiveBrokerSession } from '../../state/activeBrokerSession';
import { useUserPreferences } from '../../state/userPreferences';
import { openAuthFlow } from './authFlowState';
import { shouldRequestOrrnnDemoTradeAuth, type TradeAuthIntent } from './tradeAuthGate';

/** Shared UI boundary; the transport independently enforces the same session requirement. */
export function requireTradingSession(intent: TradeAuthIntent): boolean {
  const preferences = useUserPreferences.getState();
  const active = captureActiveBrokerSession();
  const expired = active?.credentials.expiresAt && Date.parse(active.credentials.expiresAt) <= Date.now();
  const invalid = shouldRequestOrrnnDemoTradeAuth({
    selectedBrokerId: preferences.brokerId, isLoggedIn: preferences.isLoggedIn,
    accountId: preferences.accountDetails?.id, accessToken: preferences.accountDetails?.credentials?.accessToken,
    activeBrokerId: active?.session.brokerId, activeAccountLogin: active?.session.accountLogin,
    activeAccessToken: active?.credentials.accessToken,
  }) || Boolean(expired && !active?.credentials.refreshToken);
  if (!invalid) return false;
  openAuthFlow({ ...intent, volume: intent.volume ?? preferences.tradeVolume });
  return true;
}
export const requestOrrnnDemoTradeAuth = requireTradingSession;

