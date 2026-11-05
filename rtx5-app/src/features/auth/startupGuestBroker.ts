import type { ValidatedBrokerServer } from '../../api/broker';
import { getPinnedBrokerServiceRoot } from '../../config/pinnedBrokerEndpoints';
import { createPublicBrokerContext } from '../../state/publicBrokerContext';

const PREFERRED_STARTUP_GUEST_BROKER_IDS = ['orrnn', 'trivanta-markets'] as const;

/** Use preferred verified guest feeds first, then directory order, skipping unsupported public feeds. */
export function resolveStartupGuestBroker(
  servers: readonly ValidatedBrokerServer[],
  excludedBrokerIds?: ReadonlySet<string>,
): ValidatedBrokerServer | null {
  const isExcluded = (brokerId: string) =>
    excludedBrokerIds?.has(brokerId.trim().toLowerCase()) ?? false;

  const candidates = [
    ...PREFERRED_STARTUP_GUEST_BROKER_IDS.flatMap((preferredId) =>
      servers.filter((server) => server.broker_id.trim().toLowerCase() === preferredId),
    ),
    ...servers.filter((server) => Boolean(getPinnedBrokerServiceRoot(server.broker_id))),
    ...servers,
  ];

  const seen = new Set<string>();
  for (const server of candidates) {
    const key = `${server.broker_id}:${server.server_url ?? ''}`;
    if (seen.has(key) || isExcluded(server.broker_id)) continue;
    seen.add(key);
    try {
      createPublicBrokerContext(server);
      return server;
    } catch {
      // A selectable login server may not support anonymous market data.
    }
  }
  return null;
}
