import type { ValidatedBrokerServer } from '../api/broker';
import { getBrokerDirectoryForBroker } from '../api/broker';
import { createPublicBrokerContext, setPublicBrokerContext } from '../state/publicBrokerContext';
import { useUserPreferences } from '../state/userPreferences';
import { captureActiveBrokerSession } from '../state/activeBrokerSession';
let selection = 0;
export async function selectGuestBrokerById(brokerId: string, isCurrent: () => boolean = () => true) {
  const attempt = ++selection;
  const directory = await getBrokerDirectoryForBroker(brokerId);
  if (attempt !== selection || !isCurrent()) return false;
  const record = directory.selectableServers.find(row => row.broker_id === brokerId);
  if (!record) throw new Error('This broker is no longer supported by the current directory.');
  return selectGuestBroker(record);
}
export async function selectGuestBroker(record: ValidatedBrokerServer) {
  createPublicBrokerContext(record); // validate before discarding the previous selection
  ++selection;
  // Public selection cancels the previous auth form and its requests. Only a
  // successful, verified session commit may replace the authenticated account.
  const preferences = useUserPreferences.getState();
  if (!preferences.isLoggedIn && !captureActiveBrokerSession()) {
    preferences.setQuoteSymbols([]); preferences.setHasSetInitialSymbols(false);
    preferences.setBrokerConnection(record.broker_id, '', record.logo_url ?? '');
  }
  setPublicBrokerContext(record);
  return true;
}
