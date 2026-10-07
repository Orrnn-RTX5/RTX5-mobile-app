import { apiJsonClient, commitApiJson } from './apiClient';
import { StaleBrokerSessionError, type BrokerApiJsonResponse } from './brokerApi';
import { captureActiveBrokerSessionProvenance } from '../state/activeBrokerSession';
import { normalizeQuoteSymbolKey, normalizeSymbol } from '../domain/symbols';
import {
  cacheInstrumentMeta,
  findInstrumentMetaInCatalogPayload,
  getCachedInstrumentMeta,
  normalizeInstrumentMetaPayload,
  primeInstrumentMetaCacheFromCatalogPayload,
  type InstrumentMetaDTO,
} from './instrumentMeta';

export type { InstrumentMetaDTO };
export {
  getCachedInstrumentMeta,
  normalizeInstrumentMetaPayload,
  primeInstrumentMetaCacheFromCatalogPayload,
};

/**
 * Bootstrap, the symbol picker and individual metadata lookups share a single
 * in-flight catalog read for the same session and credential generation.
 */
const catalogRequests = new Map<string, Promise<BrokerApiJsonResponse<unknown>>>();

export async function fetchInstrumentCatalogResponse(
  cacheNamespace: string,
): Promise<BrokerApiJsonResponse<unknown>> {
  const provenance = captureActiveBrokerSessionProvenance();
  if (!provenance || provenance.cacheNamespace !== cacheNamespace) {
    throw new StaleBrokerSessionError();
  }
  const key = `${cacheNamespace}:${provenance.credentialGeneration}:${provenance.credentialIdentity}`;
  let request = catalogRequests.get(key);
  if (!request) {
    request = apiJsonClient<unknown>('/instruments');
    catalogRequests.set(key, request);
    const ownedRequest = request;
    const release = () => {
      if (catalogRequests.get(key) === ownedRequest) catalogRequests.delete(key);
    };
    void request.then(release, release);
  }

  const result = await request;
  // Each caller revalidates the response owner after its own await. A shared
  // promise never authorizes a write after broker/account/credential changes.
  return commitApiJson(result, cacheNamespace, () => {
    if (!result.ok) {
      throw Object.assign(new Error('Failed to fetch the instrument catalog'), { status: result.status });
    }
    return result;
  });
}

/**
 * Resolve one instrument's metadata.
 *
 * Contract v3: `GET /instruments/{symbol}` does not exist (404). The symbol is
 * looked up in the cached `GET /instruments` list (a bare array), fetching the
 * list once when the cache has no entry for this session.
 */
export async function fetchInstrumentMeta(
  symbol: string,
  cacheNamespace: string,
): Promise<InstrumentMetaDTO> {
  if (!cacheNamespace) {
    throw new Error('Instrument metadata requires an active session cache namespace.');
  }
  if (captureActiveBrokerSessionProvenance()?.cacheNamespace !== cacheNamespace) {
    throw new StaleBrokerSessionError();
  }

  const cached = getCachedInstrumentMeta(symbol, cacheNamespace);
  if (cached) return cached;

  const result = await fetchInstrumentCatalogResponse(cacheNamespace);
  const found = commitApiJson(result, cacheNamespace, (catalog) => {
    // Another metadata caller or bootstrap may have primed this shared catalog
    // while we awaited it. Avoid re-normalizing every instrument for each row
    // of a newly opened symbol picker/order ticket.
    const primed = getCachedInstrumentMeta(symbol, cacheNamespace);
    if (primed) return primed;
    primeInstrumentMetaCacheFromCatalogPayload(catalog, cacheNamespace);
    const meta = getCachedInstrumentMeta(symbol, cacheNamespace)
      ?? findInstrumentMetaInCatalogPayload(catalog, symbol);
    if (meta) cacheInstrumentMeta(meta, cacheNamespace);
    return meta;
  });
  if (found) return found;

  const label = normalizeSymbol(symbol) || normalizeQuoteSymbolKey(symbol) || symbol;
  throw new Error(`Instrument ${label} is not in the broker catalog`);
}

/** @internal Test seam. */
export const __resetInstrumentCatalogRequestsForTests = (): void => {
  catalogRequests.clear();
};
