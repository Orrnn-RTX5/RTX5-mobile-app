/**
 * Post-login account profile enrichment (backend contract v3).
 *
 * Login no longer returns the account name, server or account type. After the
 * session is committed this module fills in, without blocking login:
 * - name   from GET /account/{login} `name`;
 * - server from GET /broker/config `server_name`, else the directory
 *   `broker_name` the caller already used as its initial label.
 * The account type is committed separately from the same /account/{login}
 * `group` by accountEnvironmentSession (bootstrap or
 * refreshActiveAccountEnvironment); "demo" in the group means demo, and an
 * account without that evidence keeps the login-time "real" fallback.
 *
 * Every failure is swallowed: the login-time fallbacks stay in place.
 */

import {
  isActiveBrokerSessionProvenanceCurrent,
  type ActiveBrokerSessionProvenance,
} from '../state/activeBrokerSession';
import { buildAccountEnvironmentKey } from '../domain/accountType';
import { readAccountDisplayName } from './authSession';

export type AccountProfileEnrichmentInput = Readonly<{
  provenance: ActiveBrokerSessionProvenance;
  /** Broker id as stored on the saved-account row. */
  brokerId: string;
  accountLogin: string;
  /**
   * The raw GET /account/{login} payload when the caller already has it (for
   * example from bootstrapApp). When omitted, the account is fetched here.
   */
  accountDetail?: Promise<unknown> | unknown;
}>;

export type AccountProfileEnrichmentResult = Readonly<{
  name?: string;
  serverName?: string;
}>;

const settle = async <T>(work: () => Promise<T> | T): Promise<T | undefined> => {
  try {
    return await work();
  } catch {
    return undefined;
  }
};

export async function enrichSignedInAccountProfile(
  input: AccountProfileEnrichmentInput,
): Promise<AccountProfileEnrichmentResult> {
  const [accountDetail, brokerConfig] = await Promise.all([
    settle(async () => {
      if (input.accountDetail !== undefined) return input.accountDetail;
      const { getAccountByIdResult } = await import('./accounts');
      return (await getAccountByIdResult(input.accountLogin)).raw;
    }),
    settle(async () => {
      const { getBrokerConfig } = await import('./broker');
      return getBrokerConfig();
    }),
  ]);

  if (!isActiveBrokerSessionProvenanceCurrent(input.provenance)) return {};

  const name = readAccountDisplayName(accountDetail, input.accountLogin);
  const serverNameRaw = (brokerConfig as { server_name?: unknown } | undefined)?.server_name;
  const serverName = typeof serverNameRaw === 'string' ? serverNameRaw.trim() : '';
  if (!name && !serverName) return {};

  const updates = {
    ...(name ? { name } : {}),
    ...(serverName ? { server: serverName } : {}),
  };

  const { useUserPreferences } = await import('../state/userPreferences');
  const { useSavedAccounts } = await import('../state/savedAccounts');
  if (!isActiveBrokerSessionProvenanceCurrent(input.provenance)) return {};

  const preferences = useUserPreferences.getState();
  if (String(preferences.accountDetails?.id ?? '').trim() === input.accountLogin) {
    preferences.updateAccountDetails(updates);
  }

  const accountKey = buildAccountEnvironmentKey(input.brokerId, input.accountLogin);
  const savedAccounts = useSavedAccounts.getState();
  const saved = savedAccounts.accounts.find(
    (account) => buildAccountEnvironmentKey(account.brokerId, account.login) === accountKey,
  );
  if (saved) {
    savedAccounts.upsertAccount({ ...saved, ...updates });
  }

  return Object.freeze({
    ...(name ? { name } : {}),
    ...(serverName ? { serverName } : {}),
  });
}
