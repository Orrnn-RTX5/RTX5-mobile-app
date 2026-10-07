/**
 * Thin wrapper over loginAPI that normalizes the auth response.
 *
 * Backend contract v3 (2026-09-24) login keys are exactly:
 * access_token, refresh_token, token_type, expires_in, expires_at (epoch s),
 * user_id, username, role, login_type, account_login (number | null),
 * broker_id. There is no feed token, account name, server or account type:
 * - name comes later from GET /account/{login} `name`
 *   ({@link readAccountDisplayName});
 * - server comes from GET /broker/config `server_name`, otherwise the
 *   directory `broker_name` ({@link resolveLoginServerName});
 * - account type comes from GET /account/{login} environment fields or `group`
 *   via the shared resolver; unrecognized groups remain unclassified.
 */

import { loginAPI } from './auth';
import {
  readRawAccountGroup,
  resolveAccountEnvironment,
  type AccountEnvironment,
  type AccountEnvironmentSource,
} from '../domain/accountType';
import { isInvestorReadOnlySession } from './investorSession';
import { positiveAccountLogin } from './guestAuthentication';

export const NO_TRADING_ACCOUNT_MESSAGE = 'No trading account linked to this user';

export interface SignInRequest {
  username: string;
  password: string;
  /** Sent exactly as the directory lists it; broker_id is case-sensitive. */
  brokerId: string;
  /** Directory `broker_name`, used as the server label until /broker/config answers. */
  brokerName?: string;
  serverUrl?: string;
  logoUrl?: string;
  signal?: AbortSignal;
}

export interface SignInResult {
  accessToken: string;
  refreshToken: string;
  expiresAtIso: string;
  accountLogin: string;
  accountName: string;
  serverName: string;
  brokerId: string;
  serverUrl: string;
  logoUrl: string;
  accountType: AccountEnvironment;
  accountEnvironmentSource: AccountEnvironmentSource;
  accountGroup?: string;
  /** `login_type: "investor"`: read-only session, trading is hidden. */
  investor: boolean;
}

export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignInError';
  }
}

const cleanText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Reads the trading account login from a login response.
 *
 * `account_login` is a JSON number that the backend sends as `null` when the
 * user has no trading account; that case must stop the login. Older shapes
 * without the key keep their nested fallbacks.
 */
export function readLoginAccountLogin(response: unknown, typedLogin?: string): string {
  const root = response && typeof response === 'object' && !Array.isArray(response)
    ? response as Record<string, any>
    : {};
  if (
    Object.prototype.hasOwnProperty.call(root, 'account_login') &&
    (root.account_login === null || root.account_login === '')
  ) {
    throw new SignInError(NO_TRADING_ACCOUNT_MESSAGE);
  }
  const raw =
    root.account_login ??
    root.accountLogin ??
    root.user?.account_login;
  const value = positiveAccountLogin(raw);
  if (!value) {
    throw new SignInError(NO_TRADING_ACCOUNT_MESSAGE);
  }
  return value;
}

/** broker_id in the response must equal the selected broker, ignoring case. */
export function isSameBrokerId(a: unknown, b: unknown): boolean {
  const left = typeof a === 'string' || typeof a === 'number' ? String(a).trim() : '';
  const right = typeof b === 'string' || typeof b === 'number' ? String(b).trim() : '';
  return Boolean(left) && left === right;
}

/** Server label: /broker/config `server_name`, else directory `broker_name`, else broker id. */
export function resolveLoginServerName(input: {
  brokerConfigServerName?: unknown;
  directoryBrokerName?: unknown;
  brokerId?: unknown;
}): string {
  return cleanText(input.brokerConfigServerName)
    || cleanText(input.directoryBrokerName)
    || cleanText(input.brokerId);
}

/**
 * `name` from GET /account/{login}. Returns '' when the payload is missing,
 * malformed or belongs to another login, so callers keep their fallback.
 */
export function readAccountDisplayName(accountDetail: unknown, expectedLogin?: string | number): string {
  const record = accountDetail && typeof accountDetail === 'object' && !Array.isArray(accountDetail)
    ? accountDetail as Record<string, unknown>
    : null;
  if (!record) return '';
  if (expectedLogin !== undefined && expectedLogin !== null && record.login !== undefined) {
    const loginValue = record.login;
    if (
      (typeof loginValue !== 'number' && typeof loginValue !== 'string') ||
      String(loginValue).trim() !== String(expectedLogin).trim()
    ) {
      return '';
    }
  }
  return cleanText(record.name);
}

export function resolveLoginExpiresAtIso(response: Record<string, any>): string {
  if (typeof response.expires_at === 'number' && response.expires_at > 0) {
    // Contract v3: epoch seconds. Millisecond values are tolerated.
    const ms = response.expires_at > 1e12 ? response.expires_at : response.expires_at * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof response.expires_at === 'string' && Number.isFinite(Date.parse(response.expires_at))) return new Date(response.expires_at).toISOString();
  const expiresInSec = Number(response.expires_in);
  return expiresInSec > 0 ? new Date(Date.now() + expiresInSec * 1000).toISOString() : '';
}

export async function signInWithCredentials({
  username,
  password,
  brokerId,
  brokerName,
  serverUrl,
  logoUrl,
  signal,
}: SignInRequest): Promise<SignInResult> {
  const response: any = await loginAPI({
    ...(/^\d+$/.test(username.trim()) ? { login: username.trim() } : { username }),
    password,
    // Exactly as the directory lists it (e.g. "Orrnn", "trivanta-markets").
    broker_id: brokerId,
  }, { serverUrl, signal });

  const accessToken = response?.access_token ?? response?.token;
  const refreshToken = response?.refresh_token ?? response?.refreshToken ?? '';
  if (!accessToken) {
    throw new SignInError('Login server did not return an access token.');
  }
  const accountLogin = readLoginAccountLogin(response, username);
  const canonicalBrokerId = response.broker_id ?? response.brokerId;
  if (!isSameBrokerId(canonicalBrokerId, brokerId)) {
    throw new SignInError('Login response did not match the selected broker.');
  }

  const accountName =
    cleanText(response.account_name) ||
    cleanText(response.accountName) ||
    cleanText(response.name) ||
    cleanText(response.username) ||
    'Trader';
  const serverName = resolveLoginServerName({
    brokerConfigServerName: response.server ?? response.broker_server,
    directoryBrokerName: brokerName,
  });
  const accountEnvironmentEvidence = resolveAccountEnvironment(response, true);
  const accountGroup = readRawAccountGroup(response);

  return {
    accessToken,
    refreshToken,
    expiresAtIso: resolveLoginExpiresAtIso(response),
    accountLogin,
    accountName,
    serverName,
    // The selected directory id keeps its exact case for later requests.
    brokerId,
    serverUrl: serverUrl ?? '',
    logoUrl: logoUrl ?? '',
    accountType: accountEnvironmentEvidence.accountType,
    accountEnvironmentSource: accountEnvironmentEvidence.source,
    ...(accountGroup ? { accountGroup } : {}),
    investor: isInvestorReadOnlySession(response),
  };
}
