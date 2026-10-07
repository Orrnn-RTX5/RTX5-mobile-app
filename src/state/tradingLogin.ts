/**
 * Core module: tradingLogin.ts
 */

import { captureActiveBrokerSession } from './activeBrokerSession';
import { useLiveAccountState } from './liveAccountState';
import { useUserPreferences } from './userPreferences';

const toPositiveLogin = (value: unknown): number | undefined => {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return undefined;
};

/**
 * Central resolution utility for determining the active trading account login.
 * Prefer the authenticated broker session (source of truth for positions/cache
 * scope), then live WS metrics, then persisted preferences.
 *
 * @returns The active numeric MT5 login ID, or undefined if no account is authenticated.
 */
export function resolveTradingLogin(): number | undefined {
  // 1. Active broker session — must match positionsState cache-scope checks.
  const sessionLogin = toPositiveLogin(captureActiveBrokerSession()?.session.accountLogin);
  if (sessionLogin !== undefined) {
    return sessionLogin;
  }

  // 2. Live WebSocket metrics (may lag during account switch).
  const liveLogin = toPositiveLogin(useLiveAccountState.getState().login);
  if (liveLogin !== undefined) {
    return liveLogin;
  }

  // 3. Persisted preferences (boot / pre-session hydrate).
  return toPositiveLogin(useUserPreferences.getState().accountDetails?.id);
}

/**
 * Reactive hook variant of resolveTradingLogin().
 * Use inside components that need to update immediately when the active
 * account login changes, such as query hooks keyed by account login.
 */
export function useResolvedTradingLogin(): number | undefined {
  const liveLogin = useLiveAccountState((state) => state.login);
  const persistedLogin = useUserPreferences((state) => state.accountDetails?.id);
  // Session is not a React store; re-read each render so login switches that
  // also update live/preferences still resolve the session login first.
  const sessionLogin = toPositiveLogin(captureActiveBrokerSession()?.session.accountLogin);
  if (sessionLogin !== undefined) {
    return sessionLogin;
  }

  const resolvedLive = toPositiveLogin(liveLogin);
  if (resolvedLive !== undefined) {
    return resolvedLive;
  }

  return toPositiveLogin(persistedLogin);
}

/**
 * String-based wrapper for resolveTradingLogin, heavily used in TanStack Query keys 
 * and API requests where string interpolation is required.
 * 
 * @returns The active login as a string, or undefined.
 */
export function resolveTradingLoginString(): string | undefined {
  const login = resolveTradingLogin();
  return login !== undefined ? String(login) : undefined;
}

