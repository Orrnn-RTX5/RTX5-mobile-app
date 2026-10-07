/**
 * Pure investor (read-only) selector over the active broker session. The
 * React hook and alert guard live in hooks/useInvestorReadOnlySession.
 */
import { isInvestorReadOnlySession } from '../api/investorSession';
import {
  getActiveBrokerSession,
  type ActiveBrokerSession,
} from './activeBrokerSession';

export const INVESTOR_READ_ONLY_TITLE = 'Read-Only Account';
export const INVESTOR_READ_ONLY_MESSAGE =
  'You are logged in with a read-only (investor) password. Trading is not allowed on this login.';

export const selectInvestorReadOnly = (
  session: ActiveBrokerSession | null | undefined,
): boolean => isInvestorReadOnlySession(session ? { investor: session.investor } : null);

export const isActiveSessionInvestorReadOnly = (): boolean =>
  selectInvestorReadOnly(getActiveBrokerSession());
