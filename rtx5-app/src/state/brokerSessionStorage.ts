import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  getSecureItemAsync,
  removeSecureItemAsync,
  setSecureItemAsync,
} from '../utils/secureStorage';
import {
  AUTH_CREDENTIAL_BUNDLE_KEY,
  LEGACY_AUTH_CREDENTIAL_KEYS,
  LEGACY_ACCESS_TOKEN_KEY,
  LEGACY_EXPIRES_AT_KEY,
  LEGACY_REFRESH_TOKEN_KEY,
  SecureCredentialBundleStore,
  type LegacyAuthCredentialInput,
  type SecureAuthCredentialBundle,
  type SecureAuthCredentialInput,
} from './secureCredentialBundle';

export const ACTIVE_BROKER_ID_KEY = 'broker_id';
export const ACTIVE_BROKER_SERVER_URL_KEY = 'server_url';
export const ACTIVE_BROKER_LOGO_URL_KEY = 'logo_url';
export const ACCESS_TOKEN_KEY = LEGACY_ACCESS_TOKEN_KEY;
export const REFRESH_TOKEN_KEY = LEGACY_REFRESH_TOKEN_KEY;
export const EXPIRES_AT_KEY = LEGACY_EXPIRES_AT_KEY;
export { AUTH_CREDENTIAL_BUNDLE_KEY };

const secureCredentialBundleStore = new SecureCredentialBundleStore({
  getItem: getSecureItemAsync,
  setItem: setSecureItemAsync,
  removeItem: removeSecureItemAsync,
});

const WEB_AUTH_STORAGE_KEYS = [
  AUTH_CREDENTIAL_BUNDLE_KEY,
  ...LEGACY_AUTH_CREDENTIAL_KEYS,
] as const;

async function clearLegacyWebAuthStorage(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.multiRemove([...WEB_AUTH_STORAGE_KEYS]);
  }
}

async function assertNativeAuthCredentialStorage(): Promise<void> {
  if (Platform.OS === 'web') {
    await clearLegacyWebAuthStorage();
    throw new Error('Secure broker credential storage is unavailable on web.');
  }
}

/**
 * Removes the pre-epoch route aliases. Authenticated routing is owned by the
 * versioned active-session manifest and must never be reconstructed by pairing
 * one of these mutable values with a credential bundle.
 */
export async function clearLegacySelectedBrokerSession(): Promise<void> {
  await Promise.all([
    removeSecureItemAsync(ACTIVE_BROKER_ID_KEY),
    removeSecureItemAsync(ACTIVE_BROKER_SERVER_URL_KEY),
    removeSecureItemAsync(ACTIVE_BROKER_LOGO_URL_KEY),
  ]);
}

export async function clearAuthSessionTokens(): Promise<void> {
  if (Platform.OS === 'web') {
    await clearLegacyWebAuthStorage();
    return;
  }
  await secureCredentialBundleStore.clear();
}

/** Removes obsolete unbound aliases without changing the active credential bundle. */
export async function clearLegacyAuthSessionCredentials(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.multiRemove([...LEGACY_AUTH_CREDENTIAL_KEYS]);
    return;
  }
  await secureCredentialBundleStore.clearLegacy();
}

export async function replaceAuthSessionCredentials(
  input: SecureAuthCredentialInput,
): Promise<SecureAuthCredentialBundle> {
  await assertNativeAuthCredentialStorage();
  return secureCredentialBundleStore.replace(input);
}

export async function getStoredAuthSessionCredentials(expected?: {
  brokerId?: string | null;
  accountLogin?: string | number | null;
}): Promise<SecureAuthCredentialBundle | null> {
  await assertNativeAuthCredentialStorage();
  return secureCredentialBundleStore.get(expected);
}

export async function migrateLegacyAuthSessionCredentials(input: {
  brokerId: string;
  accountLogin: string | number;
  credentials?: LegacyAuthCredentialInput | null;
}): Promise<SecureAuthCredentialBundle | null> {
  await assertNativeAuthCredentialStorage();
  return secureCredentialBundleStore.migrateLegacy(input);
}
