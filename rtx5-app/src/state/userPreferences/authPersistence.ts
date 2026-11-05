import type { SecureAuthCredentialBundle } from '../secureCredentialBundle';
import { isSensitiveAuthKey } from '../../utils/securityRedaction';

type UnknownRecord = Record<string, unknown>;

export type PersistedAccountIdentity = {
  id: string;
  name: string;
  server: string;
};

export type LegacyPreferenceCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

export type SanitizedPreferenceAuthSnapshot = {
  sanitizedStorageValue: UnknownRecord;
  accountIdentity: PersistedAccountIdentity | null;
  brokerId: string;
  shouldRestoreAuthenticatedSession: boolean;
  legacyCredentials: LegacyPreferenceCredentials | null;
  containedAuthSecrets: boolean;
};

const asRecord = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};

const cleanString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';

const firstString = (records: UnknownRecord[], keys: string[]): string => {
  for (const record of records) {
    for (const key of keys) {
      const value = cleanString(record[key]);
      if (value) return value;
    }
  }
  return '';
};

const stripSensitiveFields = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripSensitiveFields);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const next: UnknownRecord = {};
  for (const [key, nestedValue] of Object.entries(value as UnknownRecord)) {
    if (!isSensitiveAuthKey(key)) {
      next[key] = stripSensitiveFields(nestedValue);
    }
  }
  return next;
};

export function sanitizePreferenceAuthStorageValue(
  storageValue: unknown,
): SanitizedPreferenceAuthSnapshot {
  const envelope = asRecord(storageValue);
  const state = asRecord(envelope.state);
  const accountDetails = asRecord(state.accountDetails);
  const credentials = asRecord(accountDetails.credentials);
  const accountId = cleanString(accountDetails.id);
  const accountIdentity = accountId
    ? {
        id: accountId,
        name: cleanString(accountDetails.name) || `Account ${accountId}`,
        server: cleanString(accountDetails.server),
      }
    : null;
  const credentialSources = [credentials, accountDetails, state];
  const accessToken = firstString(credentialSources, ['accessToken', 'access_token']);
  const legacyCredentials = accessToken
    ? {
        accessToken,
        refreshToken: firstString(credentialSources, ['refreshToken', 'refresh_token']),
        expiresAt: firstString(credentialSources, ['expiresAt', 'expires_at']),
      }
    : null;

  const sanitizedEnvelope = asRecord(stripSensitiveFields(envelope));
  const sanitizedState = asRecord(sanitizedEnvelope.state);
  sanitizedState.accountDetails = accountIdentity;
  sanitizedEnvelope.state = sanitizedState;

  return {
    sanitizedStorageValue: sanitizedEnvelope,
    accountIdentity,
    brokerId: cleanString(state.brokerId),
    shouldRestoreAuthenticatedSession: state.isLoggedIn === true,
    legacyCredentials,
    containedAuthSecrets: JSON.stringify(storageValue) !== JSON.stringify(sanitizedEnvelope),
  };
}

export function injectRuntimeCredentials(
  sanitizedStorageValue: UnknownRecord,
  bundle: SecureAuthCredentialBundle,
  accountIdentity: PersistedAccountIdentity,
): UnknownRecord {
  const envelope = asRecord(stripSensitiveFields(sanitizedStorageValue));
  const state = asRecord(envelope.state);
  state.isLoggedIn = true;
  state.accountDetails = {
    ...accountIdentity,
    credentials: {
      accessToken: bundle.accessToken,
      refreshToken: bundle.refreshToken,
      expiresAt: bundle.expiresAt,
    },
  };
  envelope.state = state;
  return envelope;
}

export function failClosedPersistedAuthState(
  sanitizedStorageValue: UnknownRecord,
): UnknownRecord {
  const envelope = asRecord(stripSensitiveFields(sanitizedStorageValue));
  const state = asRecord(envelope.state);
  state.isLoggedIn = false;
  state.accountDetails = null;
  state.accountType = 'unknown';
  state.accountEnvironmentSource = 'unknown';
  state.accountEnvironmentKey = '';
  state.isDemoAccount = false;
  envelope.state = state;
  return envelope;
}
