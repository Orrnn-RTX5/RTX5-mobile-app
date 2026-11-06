import { apiJsonClient, commitApiJson } from './apiClient';
import { buildAccountDetailPath, buildAccountMetricsPath } from './accountsRoutes';
import { StaleBrokerSessionError, type BrokerApiJsonResponse } from './brokerApi';
import { captureActiveBrokerSessionProvenance } from '../state/activeBrokerSession';
import { mergeAccountMetricsSnapshots } from '../utils/accountMetrics';

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

export async function fetchAccountMetricsSnapshotResponse(
  login: number | string,
): Promise<BrokerApiJsonResponse<unknown>> {
  const provenance = captureActiveBrokerSessionProvenance();
  if (!provenance) throw new StaleBrokerSessionError();

  const endpoint = buildAccountMetricsPath(login);
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
  return commitApiJson(result, provenance.cacheNamespace, () => result);
}

export async function fetchAccountWithMetricsSnapshot(
  login: number | string,
): Promise<BrokerApiJsonResponse<unknown>> {
  const [accountSettled, metricsSettled] = await Promise.allSettled([
    fetchAccountSnapshotResponse(login),
    fetchAccountMetricsSnapshotResponse(login),
  ]);

  if (accountSettled.status === 'rejected' && metricsSettled.status === 'rejected') {
    throw accountSettled.reason;
  }

  const accountResponse =
    accountSettled.status === 'fulfilled' ? accountSettled.value : null;
  const metricsResponse =
    metricsSettled.status === 'fulfilled' ? metricsSettled.value : null;

  if (accountResponse && metricsResponse) {
    // Merge /account/{login} and /account/{login}/metrics using the Publication Token Guard.
    const mergedFirst = mergeAccountMetricsSnapshots(
      null,
      accountResponse.data,
      { activeLogin: login },
    );
    const mergedBoth = mergeAccountMetricsSnapshots(
      mergedFirst,
      metricsResponse.data,
      { activeLogin: login },
    );
    return {
      ...accountResponse,
      data: mergedBoth ?? accountResponse.data,
    };
  }

  return (accountResponse ?? metricsResponse)!;
}
