import { captureActiveBrokerSessionOwnerStamp } from '../../state/activeBrokerSession';

/** UI-only fence after the market API has validated its response owner.
 * A causal token refresh preserves the account/session namespace. Account
 * switches and new login epochs never do. Transport validation stays strict.
 */
export function isMarketOrderFeedbackCurrent(cacheNamespace: string): boolean {
  return Boolean(cacheNamespace && captureActiveBrokerSessionOwnerStamp()?.cacheNamespace === cacheNamespace);
}
