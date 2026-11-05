import { useQuery } from '@tanstack/react-query';
import {
  getPublicBrokerConfig,
  resolveBrokerSignUpAvailability,
  type BrokerSignUpAvailability,
} from '../../api/broker';
import { ensureBrokerRestApiBase } from '../../api/brokerRouting';

export const PUBLIC_BROKER_SIGN_UP_CONFIG_KEY = 'publicBrokerSignUpConfig';

export type BrokerSignUpGate = Readonly<{
  /** Real-account sign-up may be shown. */
  real: boolean;
  /** Demo-account sign-up may be shown. */
  demo: boolean;
  /** Any sign-up entry point may be shown. */
  any: boolean;
}>;

const visible = (availability: BrokerSignUpAvailability, loading: boolean): boolean =>
  // Hidden while loading (no flash for brokers that disallow sign-up) and when
  // the broker says "false". A failed or flag-less config keeps the legacy UI.
  !loading && availability !== 'disabled';

/**
 * Contract v3: sign-up follows the selected broker's public
 * `/broker/config` `registration_enabled` / `demo_registration_enabled`.
 * Both Trivanta and Orrnn report false, so their sign-up entries are hidden.
 */
export function useBrokerSignUpGate(serverUrl: string | null | undefined): BrokerSignUpGate {
  const apiBase = ensureBrokerRestApiBase(serverUrl ?? '');
  const query = useQuery({
    queryKey: [PUBLIC_BROKER_SIGN_UP_CONFIG_KEY, apiBase],
    queryFn: () => getPublicBrokerConfig(apiBase),
    enabled: Boolean(apiBase),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  if (!apiBase) {
    return { real: true, demo: true, any: true };
  }
  const loading = query.isPending && query.fetchStatus !== 'idle';
  const config = query.isError ? null : query.data;
  return {
    real: visible(resolveBrokerSignUpAvailability(config, 'real'), loading),
    demo: visible(resolveBrokerSignUpAvailability(config, 'demo'), loading),
    any: visible(resolveBrokerSignUpAvailability(config, 'any'), loading),
  };
}
