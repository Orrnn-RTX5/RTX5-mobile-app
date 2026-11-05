/**
 * Active broker market-feed health service.
 *
 * The URL is supplied by the validated session manifest; this module never
 * derives `/health` or falls back to a global gateway.
 */

import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
} from '../state/activeBrokerSession';
import { timedFetch } from '../utils/apiLatency';

/** Broker-specific response from the exact feedStatusUrl. */
export interface HealthResponse {
  status: string;
  timestamp?: number;
  version?: string;
  [key: string]: unknown;
}

/**
 * Checks the active broker's configured market-feed status endpoint.
 */
export async function getHealth(): Promise<HealthResponse> {
  const capture = captureActiveBrokerSession();
  if (!capture) {
    throw new Error('No active broker session is available for the health check.');
  }
  const identity = getActiveBrokerSessionIdentity(capture.session);
  const statusUrl = capture.session.feedStatusUrl;
  const response = await timedFetch(statusUrl, {
    headers: { accept: 'application/json' },
  }, {
    label: 'health.broker',
    method: 'GET',
    endpoint: new URL(statusUrl).pathname,
    source: 'broker',
  });

  if (!isActiveBrokerSessionCurrent(identity)) {
    throw new Error('Broker session changed during the health check.');
  }
  if (!response.ok) {
    throw new Error(`Gateway unhealthy: HTTP ${response.status}`);
  }

  const body = await response.json() as HealthResponse;
  if (!isActiveBrokerSessionCurrent(identity)) {
    throw new Error('Broker session changed while reading the health response.');
  }
  return body;
}
