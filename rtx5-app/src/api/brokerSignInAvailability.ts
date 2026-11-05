import { ensureBrokerRestApiBase } from './brokerRouting';

export type BrokerAvailabilityResponse = Pick<Response, 'ok'> & Partial<Pick<Response, 'status' | 'json'>>;
export type BrokerAvailabilityRequester = (url: string) => Promise<BrokerAvailabilityResponse>;

/**
 * Aggregate trading health can be degraded by individual fenced accounts while
 * the broker still accepts sign-in. Confirm its active public configuration on
 * the same approved server; account/trade requests retain their own checks.
 */
export async function confirmBrokerSignInAvailability(
  serverUrl: string,
  health: BrokerAvailabilityResponse,
  request: BrokerAvailabilityRequester,
): Promise<boolean> {
  if (health.ok) return true;
  if (health.status !== 503 || !health.json) return false;
  try {
    const status = await health.json();
    if (status?.status !== 'degraded') return false;
    const apiBase = ensureBrokerRestApiBase(serverUrl);
    if (!apiBase) return false;
    const response = await request(`${apiBase}/broker/config`);
    if (!response.ok || !response.json) return false;
    const payload = await response.json();
    const config = payload?.data ?? payload;
    return config?.status === 'active'
      && typeof config.broker_id === 'string' && config.broker_id.trim().length > 0
      && config.enabled !== false && config.active !== false && config.license_active !== false;
  } catch {
    return false;
  }
}
