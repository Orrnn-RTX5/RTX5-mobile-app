export const AUTH_CREDENTIAL_BUNDLE_VERSION = 1 as const;
export const AUTH_CREDENTIAL_BUNDLE_KEY = 'rtx5_auth_credential_bundle_v1';

export const LEGACY_ACCESS_TOKEN_KEY = 'access_token';
export const LEGACY_REFRESH_TOKEN_KEY = 'refresh_token';
export const LEGACY_EXPIRES_AT_KEY = 'expires_at';
/**
 * Secure-store keys from the removed feed-token era. They are never read; they
 * are only deleted on every credential replace/clear so no stale secret stays
 * on the device.
 */
export const LEGACY_FEED_TOKEN_KEYS = [
  'feed_broker_token',
  'broker_feed_token',
  'feed_token',
  'ws_feed_token',
] as const;

export const LEGACY_AUTH_CREDENTIAL_KEYS = [
  LEGACY_ACCESS_TOKEN_KEY,
  LEGACY_REFRESH_TOKEN_KEY,
  LEGACY_EXPIRES_AT_KEY,
  ...LEGACY_FEED_TOKEN_KEYS,
] as const;

export type SecureAuthCredentialBundle = {
  version: typeof AUTH_CREDENTIAL_BUNDLE_VERSION;
  brokerId: string;
  accountLogin: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

export type SecureAuthCredentialInput = {
  brokerId: string;
  accountLogin: string | number;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
};

// Read provenance only; never persisted as part of the credential bundle.
const canonicalStoredBundles = new WeakSet<SecureAuthCredentialBundle>();
export const isCanonicalStoredAuthCredentialBundle = (bundle: SecureAuthCredentialBundle): boolean =>
  canonicalStoredBundles.has(bundle);

export type LegacyAuthCredentialInput = {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
};

export type SecureCredentialStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const cleanString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';

const normalizeBrokerId = (value: unknown): string => cleanString(value);

const createBundle = (input: SecureAuthCredentialInput): SecureAuthCredentialBundle => {
  const brokerId = normalizeBrokerId(input.brokerId);
  const accountLogin = cleanString(input.accountLogin);
  const accessToken = cleanString(input.accessToken);
  if (!brokerId || !/^\d+$/.test(accountLogin) || !/[1-9]/.test(accountLogin) || typeof input.accountLogin === 'number' && !Number.isSafeInteger(input.accountLogin) || !accessToken) {
    throw new Error('Secure auth credentials require brokerId, accountLogin, and accessToken.');
  }

  // Only these fields are written. Any extra field of an input object (for
  // example a pre-v3 feed-auth field) is never copied into storage.
  return {
    version: AUTH_CREDENTIAL_BUNDLE_VERSION,
    brokerId,
    accountLogin,
    accessToken,
    refreshToken: cleanString(input.refreshToken),
    expiresAt: cleanString(input.expiresAt),
  };
};

const parseBundle = (value: string | null): SecureAuthCredentialBundle | null => {
  if (!value) return null;

  try {
    // Bundles written before contract v3 also hold feed-auth fields.
    // Those fields are ignored (not an error) so the user stays signed in.
    const parsed = JSON.parse(value) as Partial<SecureAuthCredentialBundle> | null;
    if (!parsed || parsed.version !== AUTH_CREDENTIAL_BUNDLE_VERSION) {
      return null;
    }
    const bundle = createBundle({
      brokerId: parsed.brokerId ?? '',
      accountLogin: parsed.accountLogin ?? '',
      accessToken: parsed.accessToken ?? '',
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
    });
    if (Object.keys(parsed).length === Object.keys(bundle).length &&
      Object.entries(bundle).every(([key, value]) => (parsed as Record<string, unknown>)[key] === value)) {
      canonicalStoredBundles.add(bundle);
    }
    return bundle;
  } catch {
    return null;
  }
};

const matchesIdentity = (
  bundle: SecureAuthCredentialBundle,
  brokerId?: string | null,
  accountLogin?: string | number | null,
): boolean => {
  const expectedBrokerId = normalizeBrokerId(brokerId);
  const expectedAccountLogin = cleanString(accountLogin);
  return (
    (!expectedBrokerId || bundle.brokerId === expectedBrokerId) &&
    (!expectedAccountLogin || bundle.accountLogin === expectedAccountLogin)
  );
};

export class SecureCredentialBundleStore {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: SecureCredentialStorage) {}

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation);
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async removeLegacyCredentials(): Promise<void> {
    const results = await Promise.allSettled(
      LEGACY_AUTH_CREDENTIAL_KEYS.map((key) => this.storage.removeItem(key)),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') {
      throw failed.reason;
    }
  }

  private async readBundle(): Promise<SecureAuthCredentialBundle | null> {
    return parseBundle(await this.storage.getItem(AUTH_CREDENTIAL_BUNDLE_KEY));
  }

  async get(
    expected?: { brokerId?: string | null; accountLogin?: string | number | null },
  ): Promise<SecureAuthCredentialBundle | null> {
    await this.mutationQueue;
    const bundle = await this.readBundle();
    if (!bundle || !matchesIdentity(bundle, expected?.brokerId, expected?.accountLogin)) {
      return null;
    }
    return bundle;
  }

  replace(input: SecureAuthCredentialInput): Promise<SecureAuthCredentialBundle> {
    return this.enqueueMutation(async () => {
      const bundle = createBundle(input);
      // One versioned value makes credential replacement atomic at the secure
      // storage boundary. Legacy keys are never read, so their independent
      // deletion can overlap the bundle write. Settle both before rollback.
      try {
        const results = await Promise.allSettled([
          this.storage.setItem(AUTH_CREDENTIAL_BUNDLE_KEY, JSON.stringify(bundle)),
          this.removeLegacyCredentials(),
        ]);
        const failed = results.find(result => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
      } catch (error) {
        await Promise.allSettled([
          this.storage.removeItem(AUTH_CREDENTIAL_BUNDLE_KEY),
          ...LEGACY_AUTH_CREDENTIAL_KEYS.map((key) => this.storage.removeItem(key)),
        ]);
        throw error;
      }
      return bundle;
    });
  }

  clear(): Promise<void> {
    return this.enqueueMutation(async () => {
      await Promise.all([
        this.storage.removeItem(AUTH_CREDENTIAL_BUNDLE_KEY),
        ...LEGACY_AUTH_CREDENTIAL_KEYS.map((key) => this.storage.removeItem(key)),
      ]);
    });
  }

  /** Housekeeping only: serialize with replacements and never touch the bundle. */
  clearLegacy(): Promise<void> {
    return this.enqueueMutation(() => this.removeLegacyCredentials());
  }

  migrateLegacy(input: {
    brokerId: string;
    accountLogin: string | number;
    credentials?: LegacyAuthCredentialInput | null;
  }): Promise<SecureAuthCredentialBundle | null> {
    return this.enqueueMutation(async () => {
      const brokerId = normalizeBrokerId(input.brokerId);
      const accountLogin = cleanString(input.accountLogin);
      if (!brokerId || !accountLogin) {
        await this.removeLegacyCredentials();
        return null;
      }

      const existingBundle = await this.readBundle();
      if (existingBundle) {
        await this.removeLegacyCredentials();
        if (matchesIdentity(existingBundle, brokerId, accountLogin)) {
          return existingBundle;
        }

        // The plain preference blob may be stale when its AsyncStorage write
        // failed. It must never delete or overwrite a valid secure bundle that
        // belongs to the session manifest for another broker/account.
        return null;
      }

      const supplied = input.credentials ?? {};
      // Only the broker/account-bound legacy preference blob is eligible for
      // migration. Individual legacy secure keys have no account binding, so
      // treating them as credentials for the selected broker could recreate
      // the exact cross-broker/sticky-token defect this store must eliminate.
      const accessToken = cleanString(supplied.accessToken);
      const refreshToken = cleanString(supplied.refreshToken);
      const expiresAt = cleanString(supplied.expiresAt);

      if (!accessToken) {
        await this.removeLegacyCredentials();
        return null;
      }

      const bundle = createBundle({
        brokerId,
        accountLogin,
        accessToken,
        refreshToken,
        expiresAt,
      });
      await this.storage.setItem(AUTH_CREDENTIAL_BUNDLE_KEY, JSON.stringify(bundle));
      await this.removeLegacyCredentials();
      return bundle;
    });
  }
}
