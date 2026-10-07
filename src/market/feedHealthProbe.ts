/**
 * On-demand `/ws/feed/status` probe (Backend Contract v3, section 5.2).
 *
 * - The endpoint needs no credentials and reads no query parameters, so the
 *   exact `feed_status_https_url` is requested as-is.
 * - It is called only on demand (diagnostics, or after 60 s of socket silence)
 *   with a 10 s timeout; there is no background polling.
 * - Health rule: healthy = symbols_fresh > 0 and a provider connected;
 *   degraded = symbols_fresh == 0 while a provider is connected;
 *   down = no provider connected and symbols_fresh == 0.
 *   `status`, `upstream_connected`, `auth_accepted` and `market_available`
 *   are ignored (Orrnn reports upstream_disconnected while ticks flow).
 * - The verdict is diagnostic only. Live ticks win and the socket is never
 *   stopped because of it.
 */
import {
  captureActiveBrokerSession,
  captureActiveBrokerSessionOwnerStamp,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionOwnerStampCurrent,
  type ActiveBrokerSessionOwnerStamp,
} from '../state/activeBrokerSession';
import { timedFetch } from '../utils/apiLatency';
import { reportFeedServerStatus } from './feedHealthRuntime';
import type {
  FeedServerStatus,
  FeedServerVerdict,
} from './feedHealthState';

export const FEED_STATUS_PROBE_TIMEOUT_MS = 10_000;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const cleanString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const nonNegativeInteger = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
};

const readProviders = (record: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(record.providers)
    ? record.providers.map(asRecord).filter((provider): provider is Record<string, unknown> => Boolean(provider))
    : [];

/**
 * Classify one `/ws/feed/status` payload under the v3 rule. Returns null for a
 * payload that carries neither `symbols_fresh` nor `providers`.
 */
export const normalizeFeedStatusVerdict = (
  payload: unknown,
  observedAt: number,
): FeedServerStatus | null => {
  const record = asRecord(payload);
  if (!record || !Number.isFinite(observedAt) || observedAt <= 0) return null;

  const providers = readProviders(record);
  const symbolsFresh = nonNegativeInteger(record.symbols_fresh ?? record.symbolsFresh);
  if (symbolsFresh === null && providers.length === 0) return null;

  const providerConnected = providers.some((provider) => provider.connected === true);
  const hasFreshSymbols = (symbolsFresh ?? 0) > 0;
  let verdict: FeedServerVerdict;
  if (hasFreshSymbols && providerConnected) {
    verdict = 'healthy';
  } else if (!hasFreshSymbols && !providerConnected) {
    verdict = 'down';
  } else {
    // symbols_fresh == 0 with a connected provider, or fresh symbols while no
    // provider row reports connected: data is not trustworthy either way.
    verdict = 'degraded';
  }

  return Object.freeze({ observedAt, verdict, symbolsFresh, providerConnected });
};

let activeProbeController: AbortController | null = null;

/**
 * One bounded on-demand probe of the exact active `feed_status_https_url`.
 * Resolves the classified verdict (or null on failure) and records it in the
 * health runtime. It never touches the quote socket.
 */
export const probeActiveFeedHealth = async (
  expectedOwner?: ActiveBrokerSessionOwnerStamp,
): Promise<FeedServerStatus | null> => {
  const capture = captureActiveBrokerSession();
  const owner = captureActiveBrokerSessionOwnerStamp();
  if (!capture || !owner) return null;
  const statusUrl = cleanString(capture.session.feedStatusUrl);
  if (!statusUrl) return null;
  const identity = getActiveBrokerSessionIdentity(capture.session);
  if (
    expectedOwner &&
    (
      expectedOwner.brokerId !== owner.brokerId ||
      expectedOwner.accountLogin !== owner.accountLogin ||
      expectedOwner.sessionEpoch !== owner.sessionEpoch ||
      expectedOwner.credentialGeneration !== owner.credentialGeneration ||
      expectedOwner.credentialIdentity !== owner.credentialIdentity
    )
  ) {
    return null;
  }

  activeProbeController?.abort();
  const controller = new AbortController();
  activeProbeController = controller;
  try {
    const response = await timedFetch(statusUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    }, {
      label: 'market.feedHealth',
      method: 'GET',
      endpoint: '/ws/feed/status',
      source: 'marketHealth',
      timeoutMs: FEED_STATUS_PROBE_TIMEOUT_MS,
    });
    if (!response.ok || !isActiveBrokerSessionOwnerStampCurrent(owner)) return null;
    const verdict = normalizeFeedStatusVerdict(await response.json(), Date.now());
    if (!verdict || !isActiveBrokerSessionOwnerStampCurrent(owner)) return null;
    reportFeedServerStatus(identity, verdict);
    return verdict;
  } catch {
    return null;
  } finally {
    if (activeProbeController === controller) activeProbeController = null;
  }
};

export const cancelActiveFeedHealthProbe = (): void => {
  activeProbeController?.abort();
  activeProbeController = null;
};
