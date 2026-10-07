import type { ValidatedBrokerServer } from '../../api/broker';
import { createPublicBrokerContext } from '../../state/publicBrokerContext';

/** Use directory order for guest browsing, skipping unsupported public feeds. */
export function resolveStartupGuestBroker(
  servers: readonly ValidatedBrokerServer[],
): ValidatedBrokerServer | null {
  for (const server of servers) {
    try {
      createPublicBrokerContext(server);
      return server;
    } catch {
      // A selectable login server may not support anonymous market data.
    }
  }
  return null;
}
