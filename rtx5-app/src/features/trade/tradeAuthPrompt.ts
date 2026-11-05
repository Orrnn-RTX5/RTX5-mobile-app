import { captureActiveBrokerSession } from '../../state/activeBrokerSession';
import { useUserPreferences } from '../../state/userPreferences';
import { openAuthFlow } from './authFlowState';
import { shouldRequestTradingAuth, type TradeAuthIntent } from './tradeAuthGate';

export function hasTradingSession(): boolean {
  const preferences = useUserPreferences.getState();
  const active = captureActiveBrokerSession();
  const expired = active?.credentials.expiresAt && Date.parse(active.credentials.expiresAt) <= Date.now();
  const invalid = shouldRequestTradingAuth({
    selectedBrokerId: preferences.brokerId, isLoggedIn: preferences.isLoggedIn,
    accountId: preferences.accountDetails?.id, accessToken: preferences.accountDetails?.credentials?.accessToken,
    activeBrokerId: active?.session.brokerId, activeAccountLogin: active?.session.accountLogin,
    activeAccessToken: active?.credentials.accessToken,
  }) || Boolean(expired && !active?.credentials.refreshToken);
  return !invalid;
}

/** Shared UI boundary; the transport independently enforces the same session requirement. */
export function requireTradingSession(intent: TradeAuthIntent): boolean {
  if (hasTradingSession()) return false;
  const preferences = useUserPreferences.getState();
  openAuthFlow({ ...intent, volume: intent.volume ?? preferences.tradeVolume });
  return true;
}
/** Compatibility name: this shared popup and session check apply to all brokers. */
export const requestOrrnnDemoTradeAuth = requireTradingSession;

