import type { ValidatedBrokerServer } from '../api/broker';
import { getBrokerDirectoryForBroker } from '../api/broker';
import { createPublicBrokerContext, setPublicBrokerContext } from '../state/publicBrokerContext';
import { logoutBrokerSession, tryPrepareGuestBrokerSelection } from './brokerSessionCoordinator';
import { useUserPreferences } from '../state/userPreferences';
let selection = 0;
export async function selectGuestBrokerById(brokerId: string, isCurrent: () => boolean = () => true) {
  const directory = await getBrokerDirectoryForBroker(brokerId);
  if (!isCurrent()) return false;
  const record = directory.selectableServers.find(row => row.broker_id === brokerId);
  if (!record) throw new Error('This broker is no longer supported by the current directory.');
  return selectGuestBroker(record);
}
export async function selectGuestBroker(record: ValidatedBrokerServer) {
  createPublicBrokerContext(record); // validate before discarding the previous selection
  const attempt = ++selection;
  setPublicBrokerContext(null);
  // A securely restored guest has no private work to erase. The coordinator
  // still invalidates auth attempts/epochs before allowing this shortcut.
  const logout = tryPrepareGuestBrokerSelection() ? null : logoutBrokerSession();
  useUserPreferences.getState().setBrokerConnection('', '');
  if (logout) await logout;
  if (attempt !== selection) return false;
  setPublicBrokerContext(record);
  const preferences = useUserPreferences.getState();
  preferences.setQuoteSymbols([]); preferences.setHasSetInitialSymbols(false);
  preferences.setBrokerConnection(record.broker_id, '', record.logo_url ?? '');
  return true;
}
