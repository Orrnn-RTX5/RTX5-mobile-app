import type { ActivateBrokerSessionInput } from './activeBrokerSession';
import { revalidateBrokerSessionEndpointSet } from '../api/brokerRouting';

export const ACTIVE_BROKER_SESSION_MANIFEST_KEY =
  'rtx5_active_broker_session_manifest_v2';
const LEGACY_ACTIVE_BROKER_SESSION_MANIFEST_KEY =
  'rtx5_active_broker_session_manifest_v1';
export const ACTIVE_BROKER_SESSION_MANIFEST_VERSION = 2 as const;

export type ActiveBrokerSessionManifest = Readonly<{
  version: typeof ACTIVE_BROKER_SESSION_MANIFEST_VERSION;
  brokerId: string;
  accountLogin: string;
  apiBase: string;
  feedWsBase: string;
  tradeWsBase?: string;
  feedStatusUrl: string;
  servicesDomain: string;
  configVersion: string;
  /** Investor (read-only) session. Absent in older manifests: restores as false. */
  investor?: boolean;
}>;

const cleanString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';

export const createActiveBrokerSessionManifest = (
  input: ActivateBrokerSessionInput,
): ActiveBrokerSessionManifest => {
  const brokerId = cleanString(input.brokerId);
  const accountLogin = cleanString(input.accountLogin);
  const apiBase = cleanString(input.apiBase);
  const feedWsBase = cleanString(input.feedWsBase);
  const tradeWsBase = cleanString(input.tradeWsBase);
  const feedStatusUrl = cleanString(input.feedStatusUrl);
  const servicesDomain = cleanString(input.servicesDomain);
  const configVersion = cleanString(input.configVersion);

  if (
    !brokerId ||
    !/^\d+$/.test(accountLogin) || !/[1-9]/.test(accountLogin) || (typeof input.accountLogin === 'number' && !Number.isSafeInteger(input.accountLogin)) ||
    !apiBase ||
    !feedWsBase ||
    !feedStatusUrl ||
    !servicesDomain ||
    !configVersion
  ) {
    throw new Error('Active broker session manifest is incomplete or invalid.');
  }

  const resolution = revalidateBrokerSessionEndpointSet({
    brokerId,
    apiBase,
    feedWsBase,
    tradeWsBase,
    feedStatusUrl,
    servicesDomain,
    configVersion,
  });
  if (!resolution.ok) {
    throw new Error(`Active broker session manifest endpoint validation failed: ${resolution.message}`);
  }
  const endpoints = resolution.endpoints;

  return Object.freeze({
    version: ACTIVE_BROKER_SESSION_MANIFEST_VERSION,
    brokerId,
    accountLogin,
    apiBase: endpoints.apiBase,
    feedWsBase: endpoints.feedWsBase,
    ...(endpoints.tradeWsBase ? { tradeWsBase: endpoints.tradeWsBase } : {}),
    feedStatusUrl: endpoints.feedStatusUrl,
    servicesDomain: endpoints.servicesDomain,
    configVersion: endpoints.configVersion,
    ...(input.investor === true ? { investor: true } : {}),
  });
};

export const parseActiveBrokerSessionManifest = (
  rawValue: string | null,
): ActiveBrokerSessionManifest | null => {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown> | null;
    if (!parsed || parsed.version !== ACTIVE_BROKER_SESSION_MANIFEST_VERSION) {
      return null;
    }
    return createActiveBrokerSessionManifest({
      brokerId: cleanString(parsed.brokerId),
      accountLogin: cleanString(parsed.accountLogin),
      apiBase: cleanString(parsed.apiBase),
      feedWsBase: cleanString(parsed.feedWsBase),
      tradeWsBase: cleanString(parsed.tradeWsBase),
      feedStatusUrl: cleanString(parsed.feedStatusUrl),
      servicesDomain: cleanString(parsed.servicesDomain),
      // Manifests written before contract v3 carry a feed-auth field.
      // It is ignored on purpose so those sessions restore without a re-login.
      configVersion: cleanString(parsed.configVersion),
      // Tolerant: only an explicit boolean true marks an investor session.
      investor: parsed.investor === true,
    });
  } catch {
    return null;
  }
};

export const writeActiveBrokerSessionManifest = async (
  input: ActivateBrokerSessionInput,
): Promise<ActiveBrokerSessionManifest> => {
  const manifest = createActiveBrokerSessionManifest(input);
  const { setSecureItemAsync } = await import('../utils/secureStorage');
  await setSecureItemAsync(
    ACTIVE_BROKER_SESSION_MANIFEST_KEY,
    JSON.stringify(manifest),
  );
  const { removeSecureItemAsync } = await import('../utils/secureStorage');
  await removeSecureItemAsync(LEGACY_ACTIVE_BROKER_SESSION_MANIFEST_KEY);
  return manifest;
};

export const readActiveBrokerSessionManifest = async (): Promise<ActiveBrokerSessionManifest | null> => {
  const { getSecureItemAsync, removeSecureItemAsync } = await import('../utils/secureStorage');
  const rawValue = await getSecureItemAsync(ACTIVE_BROKER_SESSION_MANIFEST_KEY);
  const manifest = parseActiveBrokerSessionManifest(rawValue);

  // V1 lacked services-domain provenance, so it cannot be migrated safely.
  // Remove it instead of trusting persisted endpoints that cannot be rebound.
  await removeSecureItemAsync(LEGACY_ACTIVE_BROKER_SESSION_MANIFEST_KEY);
  if (rawValue && !manifest) {
    await removeSecureItemAsync(ACTIVE_BROKER_SESSION_MANIFEST_KEY);
  }
  return manifest;
};

export const clearActiveBrokerSessionManifest = async (): Promise<void> => {
  const { removeSecureItemAsync } = await import('../utils/secureStorage');
  await Promise.all([
    removeSecureItemAsync(ACTIVE_BROKER_SESSION_MANIFEST_KEY),
    removeSecureItemAsync(LEGACY_ACTIVE_BROKER_SESSION_MANIFEST_KEY),
  ]);
};
