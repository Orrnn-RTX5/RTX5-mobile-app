import { apiJsonClient, commitApiJson } from './apiClient';
import { buildAccountDetailPath } from './accountsRoutes';
import { StaleBrokerSessionError, type BrokerApiJsonResponse } from './brokerApi';
import { captureActiveBrokerSessionProvenance } from '../state/activeBrokerSession';

// Dashboard summary, account details, environment refresh and bootstrap all
// read the same endpoint. Share only overlapping reads, never a settled value:
// the next refresh must still reach the server for authoritative metrics.
const accountSnapshotRequests = new Map<string, Promise<BrokerApiJsonResponse<unknown>>>();

export async function fetchAccountSnapshotResponse(
  login: number | string,
): Promise<BrokerApiJsonResponse<unknown>> {
  const provenance = captureActiveBrokerSessionProvenance();
  if (!provenance) throw new StaleBrokerSessionError();

  const endpoint = buildAccountDetailPath(login);
  const key = JSON.stringify([
    provenance.cacheNamespace,
    provenance.credentialGeneration,
    provenance.credentialIdentity,
    endpoint,
  ]);
  let request = accountSnapshotRequests.get(key);
  if (!request) {
    request = apiJsonClient<unknown>(endpoint);
    accountSnapshotRequests.set(key, request);
    const ownedRequest = request;
    const release = () => {
      if (accountSnapshotRequests.get(key) === ownedRequest) accountSnapshotRequests.delete(key);
    };
    void request.then(release, release);
  }

  const result = await request;
  // Sharing a promise never permits a result from an old account or credential
  // generation to cross into the current session. Callers also guard commits.
  return commitApiJson(result, provenance.cacheNamespace, () => result);
}
