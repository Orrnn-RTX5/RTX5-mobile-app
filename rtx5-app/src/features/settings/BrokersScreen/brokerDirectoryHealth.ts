import { timedFetch } from '../../../utils/apiLatency';
import { normalizeFeedStatusVerdict } from '../../../market/feedHealthProbe';

export type BrokerDirectoryHealthState =
  | 'healthy'
  | 'delayed'
  | 'provider_down'
  | 'unavailable';

export type BrokerDirectoryHealthResult = Readonly<{
  state: BrokerDirectoryHealthState;
  label: string;
}>;

// Directory badges are informational snapshots, not durable feed state. Probe
// at a conservative foreground cadence and independently expire each result so
// a stalled request can never leave an old healthy badge on screen forever.
export const BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS = 30_000;
export const BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS = 45_000;

const RESULT: Record<BrokerDirectoryHealthState, BrokerDirectoryHealthResult> = {
  healthy: Object.freeze({ state: 'healthy', label: 'Market data available' }),
  delayed: Object.freeze({ state: 'delayed', label: 'Prices delayed' }),
  provider_down: Object.freeze({ state: 'provider_down', label: 'Provider unavailable' }),
  // Only the market-data status endpoint failed (e.g. Trivanta's /ws/feed/status
  // answering a Cloudflare 502 while /health and REST are up). Say so, rather
  // than a bare "Status unavailable" that reads as "broker unavailable".
  unavailable: Object.freeze({ state: 'unavailable', label: 'Market data status unavailable' }),
};

/**
 * Contract v3 (5.2) verdict of one /ws/feed/status payload:
 * healthy → healthy, degraded → delayed, down → provider_down. The fields v3
 * says to ignore (`status`, `upstream_connected`, `auth_accepted`,
 * `market_available`) never affect the badge.
 */
export const classifyBrokerDirectoryHealth = (
  payload: unknown,
  observedAt: number,
): BrokerDirectoryHealthResult => {
  const status = normalizeFeedStatusVerdict(payload, observedAt);
  if (!status) return RESULT.unavailable;
  switch (status.verdict) {
    case 'healthy':
      return RESULT.healthy;
    case 'degraded':
      return RESULT.delayed;
    case 'down':
      return RESULT.provider_down;
    default:
      return RESULT.unavailable;
  }
};

export const probeBrokerDirectoryHealth = async (
  feedStatusUrl: string,
  signal?: AbortSignal,
): Promise<BrokerDirectoryHealthResult> => {
  if (!feedStatusUrl) return RESULT.unavailable;
  try {
    const response = await timedFetch(feedStatusUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
    }, {
      label: 'broker.directoryFeedHealth',
      method: 'GET',
      endpoint: '/ws/feed/status',
      source: 'brokerDirectory',
      timeoutMs: 3_000,
    });
    if (!response.ok) return RESULT.unavailable;
    return classifyBrokerDirectoryHealth(await response.json(), Date.now());
  } catch {
    return RESULT.unavailable;
  }
};
