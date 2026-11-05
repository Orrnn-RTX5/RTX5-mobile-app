import { getAccountByIdResult } from '../api/accounts';
import {
  buildAccountEnvironmentKey,
  readRawAccountGroup,
  resolveAccountEnvironment,
  type AccountEnvironment,
} from '../domain/accountType';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
  type ActiveBrokerSessionProvenance,
} from '../state/activeBrokerSession';
import { useSavedAccounts } from '../state/savedAccounts';
import { useUserPreferences } from '../state/userPreferences';
import {
  createAccountEnvironmentRefreshOrder,
  readRawAccountLogin,
  type AccountEnvironmentRefreshOrderToken,
} from './accountEnvironmentRefreshCore';

export type AccountEnvironmentRefreshToken = AccountEnvironmentRefreshOrderToken;

export type AccountEnvironmentCommitResult =
  | Readonly<{ status: 'updated'; accountType: Exclude<AccountEnvironment, 'unknown'> }>
  | Readonly<{ status: 'unknown' | 'stale' | 'invalid-payload' | 'no-session' }>
  | Readonly<{ status: 'failed'; error: unknown }>;

const accountEnvironmentRefreshOrder = createAccountEnvironmentRefreshOrder();

const asRecord = (value: unknown): Record<string, unknown> | null => {
  try {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

const cleanIdentityPart = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';

const buildRefreshOwnerKey = (provenance: ActiveBrokerSessionProvenance): string =>
  [
    provenance.cacheNamespace,
    provenance.identity.sessionEpoch,
    provenance.credentialGeneration,
    provenance.credentialIdentity,
  ].join(':');

export function beginAccountEnvironmentRefresh(
  expectedProvenance: ActiveBrokerSessionProvenance,
): AccountEnvironmentRefreshToken | null {
  if (!isActiveBrokerSessionProvenanceCurrent(expectedProvenance)) {
    return null;
  }

  const ownerKey = buildRefreshOwnerKey(expectedProvenance);
  const accountKey = buildAccountEnvironmentKey(
    expectedProvenance.identity.brokerId,
    expectedProvenance.identity.accountLogin,
  );
  return accountEnvironmentRefreshOrder.begin(ownerKey, accountKey);
}

const isRefreshTokenCurrent = (
  token: AccountEnvironmentRefreshToken | undefined,
  expectedProvenance: ActiveBrokerSessionProvenance,
): boolean => {
  if (!token) return true;
  const expectedOwnerKey = buildRefreshOwnerKey(expectedProvenance);
  const expectedAccountKey = buildAccountEnvironmentKey(
    expectedProvenance.identity.brokerId,
    expectedProvenance.identity.accountLogin,
  );
  return accountEnvironmentRefreshOrder.isCurrent(
    token,
    expectedOwnerKey,
    expectedAccountKey,
  );
};

export function commitActiveAccountEnvironmentPayload(
  payload: unknown,
  expectedProvenance: ActiveBrokerSessionProvenance,
  refreshToken?: AccountEnvironmentRefreshToken,
): AccountEnvironmentCommitResult {
  if (
    !isActiveBrokerSessionProvenanceCurrent(expectedProvenance) ||
    !isRefreshTokenCurrent(refreshToken, expectedProvenance)
  ) {
    return { status: 'stale' };
  }

  const record = asRecord(payload);
  if (!record) {
    return { status: 'invalid-payload' };
  }

  const payloadAccountLogin = readRawAccountLogin(record);
  if (
    !payloadAccountLogin ||
    payloadAccountLogin !== cleanIdentityPart(expectedProvenance.identity.accountLogin)
  ) {
    return { status: 'invalid-payload' };
  }

  const environmentEvidence = resolveAccountEnvironment(record, true);
  const resolved = environmentEvidence.accountType;
  if (resolved === 'unknown') {
    return { status: 'unknown' };
  }

  const accountKey = buildAccountEnvironmentKey(
    expectedProvenance.identity.brokerId,
    expectedProvenance.identity.accountLogin,
  );
  useUserPreferences.getState().mergeAccountEnvironmentForAccount(
    accountKey,
    resolved,
    environmentEvidence.source,
  );

  const savedAccounts = useSavedAccounts.getState();
  const saved = savedAccounts.accounts.find(
    (account) =>
      buildAccountEnvironmentKey(account.brokerId, account.login) === accountKey,
  );
  if (saved) {
    const group = readRawAccountGroup(record);
    savedAccounts.upsertAccount({
      ...saved,
      accountType: resolved,
      accountEnvironmentSource: environmentEvidence.source,
      ...(group ? { rawGroup: group } : {}),
    });
  }

  return { status: 'updated', accountType: resolved };
}

export async function refreshActiveAccountEnvironment(
  expectedProvenance?: ActiveBrokerSessionProvenance,
): Promise<AccountEnvironmentCommitResult> {
  const capture = captureActiveBrokerSession();
  if (!capture) {
    return { status: 'no-session' };
  }

  const provenance =
    expectedProvenance ?? getActiveBrokerSessionProvenance(capture.session);
  const refreshToken = beginAccountEnvironmentRefresh(provenance);
  if (!refreshToken) {
    return { status: 'stale' };
  }

  try {
    const { raw } = await getAccountByIdResult(provenance.identity.accountLogin);
    return commitActiveAccountEnvironmentPayload(raw, provenance, refreshToken);
  } catch (error) {
    if (
      !isActiveBrokerSessionProvenanceCurrent(provenance) ||
      !isRefreshTokenCurrent(refreshToken, provenance)
    ) {
      return { status: 'stale' };
    }
    return { status: 'failed', error };
  }
}
