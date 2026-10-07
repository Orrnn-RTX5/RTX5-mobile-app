import { toBrokerServiceRoot } from '../../../api/brokerRouting';
import { timedFetch } from '../../../utils/apiLatency';

export const SELECTED_BROKER_UNAVAILABLE_MESSAGE = 'Selected broker is unavailable';
export const SELECTED_BROKER_HEALTH_TIMEOUT_MS = 3_000;

export type SelectedBrokerHealthProbe = (serverUrl: string) => Promise<boolean>;

export type SelectedBrokerHealthGateRequest = Readonly<{
  serverUrl: string;
  onAvailable: () => void;
  onUnavailable: () => void;
}>;

export type SelectedBrokerHealthGateResult =
  | 'opened'
  | 'unavailable'
  | 'ignored';

export type SelectedBrokerHealthGate = Readonly<{
  isPending: () => boolean;
  run: (request: SelectedBrokerHealthGateRequest) => Promise<SelectedBrokerHealthGateResult>;
}>;

type SelectedBrokerHealthRequester = (
  healthUrl: string,
) => Promise<Pick<Response, 'ok'>>;

/**
 * Builds only the health URL belonging to the selected directory record.
 * Health is always at the service root (`/health`), even when callers pass a
 * REST base that already includes `/api/v2`.
 */
export function buildSelectedBrokerHealthUrl(serverUrl: string): string {
  const serviceRoot = toBrokerServiceRoot(serverUrl);
  return serviceRoot ? `${serviceRoot}/health` : '';
}

const requestSelectedBrokerHealth: SelectedBrokerHealthRequester = (healthUrl) => (
  timedFetch(healthUrl, {
    method: 'GET',
    headers: { accept: 'application/json' },
  }, {
    label: 'broker.selected.health',
    method: 'GET',
    endpoint: '/health',
    source: 'broker',
    timeoutMs: SELECTED_BROKER_HEALTH_TIMEOUT_MS,
  })
);

const isHealthProbeTimeout = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

/**
 * A bounded reachability check for the exact selected broker server. Like the
 * login probe (checkBrokerServerHealth), a timeout is retried once: the first
 * request after idle pays a cold DNS + TCP + TLS handshake and can exceed the
 * budget while the broker is healthy. HTTP failures and network errors still
 * fail closed immediately.
 */
export async function probeSelectedBrokerHealth(
  serverUrl: string,
  requester: SelectedBrokerHealthRequester = requestSelectedBrokerHealth,
): Promise<boolean> {
  const healthUrl = buildSelectedBrokerHealthUrl(serverUrl);
  if (!healthUrl) return false;

  try {
    const response = await requester(healthUrl);
    return response.ok;
  } catch (firstError) {
    if (!isHealthProbeTimeout(firstError)) return false;
  }
  try {
    const response = await requester(healthUrl);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Serializes broker selection while health is pending. This prevents a double
 * tap (including one split across retained and mounted picker layers) from
 * opening Broker Detail twice.
 */
export function createSelectedBrokerHealthGate(
  probe: SelectedBrokerHealthProbe = probeSelectedBrokerHealth,
): SelectedBrokerHealthGate {
  let pending = false;

  return Object.freeze({
    isPending: () => pending,
    run: async (request) => {
      if (pending) return 'ignored';
      pending = true;

      try {
        let available = false;
        try {
          available = await probe(request.serverUrl);
        } catch {
          available = false;
        }

        if (!available) {
          request.onUnavailable();
          return 'unavailable';
        }

        request.onAvailable();
        return 'opened';
      } finally {
        pending = false;
      }
    },
  });
}

/** One gate is shared by all simultaneously mounted broker-picker layers. */
export const selectedBrokerHealthGate = createSelectedBrokerHealthGate();
