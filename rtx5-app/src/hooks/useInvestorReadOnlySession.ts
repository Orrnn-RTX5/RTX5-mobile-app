/**
 * Investor (read-only) session hook.
 *
 * The active session stores `investor` from login `login_type:"investor"` or
 * refresh `investor:true`. Trade entry points use this hook to hide or disable
 * new orders, closes, bulk closes and SL/TP changes. It is UX only: the server
 * still answers `403 INVESTOR_READ_ONLY`, which tradingErrors maps.
 */
import { Alert } from 'react-native';
import { useSyncExternalStore } from 'react';
import { subscribeActiveBrokerSession } from '../state/activeBrokerSession';
import {
  INVESTOR_READ_ONLY_MESSAGE,
  INVESTOR_READ_ONLY_TITLE,
  isActiveSessionInvestorReadOnly,
} from '../state/investorReadOnlySession';

export {
  INVESTOR_READ_ONLY_MESSAGE,
  INVESTOR_READ_ONLY_TITLE,
  isActiveSessionInvestorReadOnly,
};

const subscribe = (onStoreChange: () => void) =>
  subscribeActiveBrokerSession(() => onStoreChange());

export function useInvestorReadOnlySession(): boolean {
  return useSyncExternalStore(
    subscribe,
    isActiveSessionInvestorReadOnly,
    () => false,
  );
}

/**
 * Imperative guard for trade handlers. Returns true (and explains why) when
 * the active session is read-only; the caller must then stop.
 */
export const blockInvestorTradeAction = (
  translate: (text: string) => string = (text) => text,
): boolean => {
  if (!isActiveSessionInvestorReadOnly()) return false;
  Alert.alert(translate(INVESTOR_READ_ONLY_TITLE), translate(INVESTOR_READ_ONLY_MESSAGE));
  return true;
};
