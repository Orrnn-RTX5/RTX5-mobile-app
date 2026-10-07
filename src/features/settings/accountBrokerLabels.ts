import type { BrokerConfigResponse, BrokerServer } from '../../api/broker';
import { isBrokerServerUrlForApiBase } from '../../api/brokerRouting';
import { resolveAccountCompanyName } from './accountCompanyName';

const cleanLabel = (value?: string | null): string => {
  const label = String(value ?? '').trim();
  return /^(?:[-\u2013\u2014]+|null|undefined)$/i.test(label) ? '' : label;
};

/** Display metadata only: these fallbacks never change account routing. */
export function resolveAccountBrokerLabels(input: {
  brokerId: string;
  serverUrl?: string | null;
  config?: Pick<BrokerConfigResponse, 'broker_id' | 'broker_name' | 'server_name'> | null;
  directory?: readonly BrokerServer[];
  sessionServerName?: string | null;
  savedServerName?: string | null;
}): { brokerName: string | null; serverName: string | null } {
  const brokerId = cleanLabel(input.brokerId);
  const identity = brokerId.toLowerCase();
  const configId = cleanLabel(input.config?.broker_id).toLowerCase();
  const config = !configId || configId === identity ? input.config : null;
  const candidates = (input.directory ?? []).filter(
    (entry) => entry.broker_id.trim().toLowerCase() === identity,
  );
  const selectedServer = input.serverUrl
    ? candidates.find((entry) =>
        isBrokerServerUrlForApiBase(input.serverUrl, entry.market_api_url || entry.server_url),
      )
    : candidates.length === 1 ? candidates[0] : undefined;
  const directoryName = cleanLabel(selectedServer?.broker_name)
    || candidates.map((entry) => cleanLabel(entry.broker_name)).find(Boolean);
  const brokerName = resolveAccountCompanyName(
    cleanLabel(config?.broker_name) || directoryName,
    brokerId,
  );

  // Older backfills stored broker_id as `server`; it is not a server name.
  const storedServer = [input.sessionServerName, input.savedServerName]
    .map(cleanLabel)
    .find((label) => label && label.toLowerCase() !== identity);
  let serverHost = '';
  try {
    const url = new URL(input.serverUrl ?? '');
    if (url.protocol === 'https:' || url.protocol === 'http:') serverHost = url.host;
  } catch {
    // A missing URL leaves the available config/directory/saved label in charge.
  }
  const serverName = cleanLabel(config?.server_name)
    || cleanLabel(selectedServer?.server)
    || storedServer
    || serverHost
    || null;
  return { brokerName, serverName };
}
