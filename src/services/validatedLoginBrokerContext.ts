import type { ActivateBrokerSessionInput } from '../state/activeBrokerSession';
import {
  isPublicBrokerContextCurrent,
  type PublicBrokerContext,
} from '../state/publicBrokerContext';

/** Reuse only the live directory context that authorized this login request. */
export function validateLoginBrokerContext(
  context: PublicBrokerContext,
  session: ActivateBrokerSessionInput,
): PublicBrokerContext {
  // Identity is deliberate: matching persisted fields or a cloned context do
  // not establish directory provenance, even if their generation is current.
  if (!isPublicBrokerContextCurrent(context)) {
    throw new Error('Broker selection changed. Select the broker again before signing in.');
  }
  if (
    context.brokerId !== session.brokerId ||
    context.configVersion !== session.configVersion
  ) {
    throw new Error('Broker configuration changed. Select the broker again before signing in.');
  }
  if (
    context.apiBase !== session.apiBase ||
    context.feedWsBase !== session.feedWsBase ||
    context.feedStatusUrl !== session.feedStatusUrl ||
    (context.endpoints.tradeWsBase ?? '') !== (session.tradeWsBase ?? '') ||
    context.endpoints.servicesDomain !== session.servicesDomain
  ) {
    throw new Error('Trading session endpoints do not match the verified broker context.');
  }
  return context;
}
