import type {
  ActiveBrokerSession,
  ActiveBrokerSessionEvent,
} from '../../state/activeBrokerSession';

type ModifyPositionSessionScope = Pick<
  ActiveBrokerSession,
  'brokerId' | 'apiBase' | 'accountLogin' | 'cacheNamespace' | 'sessionEpoch'
>;

/**
 * Stable ownership for one broker/account activation. Credential refreshes do
 * not change this key; broker, endpoint, account, or epoch transitions do.
 */
export const buildModifyPositionSessionKey = (
  session: ModifyPositionSessionScope,
): string => JSON.stringify([
  session.brokerId,
  session.apiBase,
  session.accountLogin,
  session.cacheNamespace,
  session.sessionEpoch,
]);

export const shouldResetModifyPositionCoordinator = (
  eventType: ActiveBrokerSessionEvent['type'],
): boolean => eventType === 'transition';

export const handleModifyPositionSessionEvent = (
  eventType: ActiveBrokerSessionEvent['type'],
  resetSession: () => void,
): void => {
  if (shouldResetModifyPositionCoordinator(eventType)) {
    resetSession();
  }
};
