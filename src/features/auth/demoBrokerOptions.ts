import type { BrokerDirectoryResult, ValidatedBrokerServer } from '../../api/broker';

export type DemoBrokerOption = Readonly<{ brokerId: string; name: string; server?: ValidatedBrokerServer }>;

/** Primary response names determine membership; validated endpoints determine availability. */
export function getDemoBrokerOptions(directory?: BrokerDirectoryResult): readonly DemoBrokerOption[] {
  return (directory?.reportedBrokers ?? []).map(identity => ({
    brokerId: identity.brokerId,
    name: identity.brokerName,
    server: directory?.primarySelectableServers?.find(server => server.broker_id === identity.brokerId),
  }));
}
