/**
 * White-Label Broker Configuration API (V2)
 * 
 * Dynamically resolves the branding, URLs, feature flags, and max leverage settings
 * based on the user's specific broker tenant. This configures the entire UI theme.
 */

import { withPinnedBrokerEndpoints } from '../config/pinnedBrokerEndpoints';
import { timedFetch } from '../utils/apiLatency';
import { recordMarketDataEvent } from '../market/marketDataTelemetry';
import { createBrokerDirectoryReadCache } from './brokerDirectoryReadCache';
import {
  ADDITIONAL_BROKER_DIRECTORY_BASE_URL,
  ADDITIONAL_BROKER_DIRECTORY_IDS,
  PUBLIC_BROKER_DIRECTORY_BASE_URL,
  buildBrokerHealthUrl,
  ensureBrokerRestApiBase,
  isBrokerServerUrlForApiBase,
  toBrokerServiceRoot,
  containsBlockedTestNetBrokerIp,
  normalizeBrokerServerUrl,
  resolveBrokerEndpointSet,
} from './brokerRouting';

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Broker Config API — https://backend.orrnn.com/api/v2/broker/config
//
// Endpoint integrated:
//   GET /broker/config — Returns broker-specific configuration
//
// Broker resolution order:
//   1. broker_id query param (explicit)
//   2. Bearer token (auto-detects logged-in user's broker)
//   3. Falls back to platform defaults if neither provided
//
// This endpoint provides the app with broker branding, feature flags,
// leverage limits, supported currencies, and legal/compliance URLs.
//
// Error responses handled:
//   200 — Success (full config or platform default fallback)
//   401 — Unauthorized (handled automatically by apiClient token refresh)
//   422 — Validation error (malformed broker_id)
//   429 — Rate limited (too many requests)
//   500 — Internal server error
//   503 — Service unavailable (backend down or maintenance)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Error Class ────────────────────────────────────────────────────────────────

/**
 * Structured error for broker config API failures.
 * Consumers can check `statusCode` to differentiate error types
 * (e.g., show a "server down" banner for 503 vs. a validation toast for 422).
 */
export class BrokerConfigError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'BrokerConfigError';
    this.statusCode = statusCode;
  }
}

// ─── Response Types ─────────────────────────────────────────────────────────────

/**
 * Full broker config response when a valid broker_id is resolved.
 * GET /broker/config?broker_id=abc → 200
 */
export interface BrokerConfigResponse {
  broker_id: string;
  broker_name: string;
  server_name: string;
  supported_currencies: string[];
  default_leverage: number;
  max_leverage: number;
  max_accounts: number;
  max_instruments: number;
  max_managers: number;
  registration_enabled: boolean;
  copy_trading_enabled: boolean;
  prop_firm_enabled: boolean;
  status: string;
  logo_url: string;
  theme_color: string;
  support_email: string;
  terms_url: string;
  privacy_url: string;
}

/**
 * GET /broker/servers — single entry in the broker server directory.
 * Each row describes one reachable broker endpoint that an account can be
 * created on / signed into. Multiple rows can share `broker_id` when the
 * broker exposes more than one server (region, demo/live, fallback IPs).
 */
export interface BrokerServer {
  extended_api_url?: string;
  extended_api_origin?: string;
  feed_broker_id?: string;
  protocol_mode?: string;
  directory_source?: 'rich' | 'v2_raw';
  id: number;
  broker_id: string;
  broker_name: string;
  active?: boolean;
  license_active?: boolean;
  licensed?: boolean;
  config_version?: string | number;
  schema_version?: string | number;
  server_url?: string;
  market_api_url?: string;
  domain_name?: string;
  server_domain?: string;
  services_domain?: string;
  feed_status_https_url?: string;
  feed_status_url?: string;
  feed_url?: string;
  feed_ws_url?: string;
  feed_wss_url?: string;
  trade_ws_url?: string;
  trade_wss_url?: string;
  ws_url?: string;
  wss_url?: string;
  domains?: {
    admin?: string;
    domain_name?: string;
    manager?: string;
    server?: string;
    services?: string;
    webterminal?: string;
  };
  logo_url?: string;
  protocol: string;     // 'http' | 'https' | 'mt5' | ...
  region: string;
  server: string;       // host:port — used as the human-readable Server name
  server_ip: string;
  server_port: number;
  enabled?: boolean;
  created_at: number;   // epoch seconds
}

export type RichValidatedBrokerServer = BrokerServer & {
  directory_source: 'rich';
  enabled: true;
  active: true;
  config_version: string;
  schema_version: string;
  server_url: string;
  services_domain: string;
  market_api_url: string;
  feed_wss_url: string;
  feed_status_https_url: string;
};

export type RawV2BrokerServer = BrokerServer & {
  directory_source: 'v2_raw';
  enabled: true;
  server_url: string;
  market_api_url: string;
  config_version: string;
  schema_version: 'broker-directory.v2.raw';
  services_domain: string;
  feed_wss_url: string;
  feed_status_https_url: string;
};

export type ValidatedBrokerServer =
  | RichValidatedBrokerServer
  | RawV2BrokerServer;

/**
 * Quarantined display metadata from an unversioned legacy directory response.
 * This shape intentionally cannot carry a URL, token, or routing field.
 */
export type BrokerDirectoryIdentity = Readonly<{
  kind: 'identity_only';
  id: string;
  brokerId: string;
  brokerName: string;
}>;

export type ApprovedBrokerDirectoryEntry = Readonly<{
  kind: 'approved';
  server: RichValidatedBrokerServer;
}>;

export type RawV2BrokerDirectoryEntry = Readonly<{
  kind: 'v2_server';
  server: RawV2BrokerServer;
}>;

export type BrokerDirectoryEntry =
  | BrokerDirectoryIdentity
  | ApprovedBrokerDirectoryEntry
  | RawV2BrokerDirectoryEntry;

export type BrokerDirectoryResult = Readonly<{
  mode: 'approved' | 'v2' | 'identity_only';
  entries: readonly BrokerDirectoryEntry[];
  approvedServers: readonly RichValidatedBrokerServer[];
  selectableServers: readonly ValidatedBrokerServer[];
  /** Display-only identities returned by the primary directory, never secondary discovery. */
  reportedBrokers?: readonly BrokerDirectoryIdentity[];
  primarySelectableServers?: readonly ValidatedBrokerServer[];
  warningCode?: string;
}>;

type BrokerDirectoryEnvelope = {
  schema_version?: unknown;
  brokers?: unknown;
  value?: unknown;
};

export const SUPPORTED_RICH_BROKER_DIRECTORY_SCHEMA_VERSION =
  'broker-directory.rich.v1' as const;

export class BrokerDirectorySchemaError extends Error {
  public readonly code: string;
  public readonly recordIndex?: number;

  constructor(code: string, message: string, recordIndex?: number) {
    super(message);
    this.name = 'BrokerDirectorySchemaError';
    this.code = code;
    this.recordIndex = recordIndex;
  }
}

/** A deterministic directory-contract failure that query callers must not retry. */
export class BrokerDirectoryContractError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BrokerDirectoryContractError';
    this.code = code;
  }
}

const asDirectoryRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const requiredDirectoryString = (
  record: Record<string, unknown>,
  key: string,
  recordIndex: number,
): string => {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BrokerDirectorySchemaError(
      `missing_${key}`,
      `Broker directory record ${recordIndex} is missing ${key}.`,
      recordIndex,
    );
  }
  return value.trim();
};

const requiredDirectoryNumber = (
  record: Record<string, unknown>,
  key: string,
  recordIndex: number,
): number => {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BrokerDirectorySchemaError(
      `missing_${key}`,
      `Broker directory record ${recordIndex} is missing ${key}.`,
      recordIndex,
    );
  }
  return value;
};

const optionalDirectoryString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const readPublicRoutingFields = (record: Record<string, unknown>) => ({
  ...(optionalDirectoryString(record, 'extended_api_url') ? { extended_api_url: optionalDirectoryString(record, 'extended_api_url') } : {}),
  ...(optionalDirectoryString(record, 'extended_api_origin') ? { extended_api_origin: optionalDirectoryString(record, 'extended_api_origin') } : {}),
  ...(optionalDirectoryString(record, 'feed_broker_id') ? { feed_broker_id: optionalDirectoryString(record, 'feed_broker_id') } : {}),
  ...(optionalDirectoryString(record, 'protocol_mode') ? { protocol_mode: optionalDirectoryString(record, 'protocol_mode') } : {}),
});

const parseDirectoryRecord = (
  value: unknown,
  schemaVersion: string,
  recordIndex: number,
): RichValidatedBrokerServer => {
  const record = asDirectoryRecord(value);
  if (!record) {
    throw new BrokerDirectorySchemaError(
      'malformed_record',
      `Broker directory record ${recordIndex} is not an object.`,
      recordIndex,
    );
  }
  if (containsBlockedTestNetBrokerIp(record)) {
    throw new BrokerDirectorySchemaError(
      'blocked_test_net_endpoint',
      `Broker directory record ${recordIndex} contains a blocked TEST-NET endpoint.`,
      recordIndex,
    );
  }

  const resolution = resolveBrokerEndpointSet(record);
  if (!resolution.ok) {
    throw new BrokerDirectorySchemaError(
      resolution.code,
      `Broker directory record ${recordIndex} was rejected: ${resolution.message}`,
      recordIndex,
    );
  }

  const { endpoints } = resolution;
  // Handoff: persist exact directory server_url (service root). REST is
  // derived as {server_url}/api/v2 and must match the resolved apiBase.
  const exactServerUrl = toBrokerServiceRoot(
    normalizeBrokerServerUrl(optionalDirectoryString(record, 'server_url'))
    || endpoints.apiBase,
  );
  if (!exactServerUrl || !isBrokerServerUrlForApiBase(exactServerUrl, endpoints.apiBase)) {
    throw new BrokerDirectorySchemaError(
      'invalid_server_url',
      `Broker directory record ${recordIndex} must bind server_url to its broker service root.`,
      recordIndex,
    );
  }
  const domainsRecord = asDirectoryRecord(record.domains);
  const domains = domainsRecord
    ? {
      ...(optionalDirectoryString(domainsRecord, 'admin') ? { admin: optionalDirectoryString(domainsRecord, 'admin') } : {}),
      ...(optionalDirectoryString(domainsRecord, 'domain_name') ? { domain_name: optionalDirectoryString(domainsRecord, 'domain_name') } : {}),
      ...(optionalDirectoryString(domainsRecord, 'manager') ? { manager: optionalDirectoryString(domainsRecord, 'manager') } : {}),
      ...(optionalDirectoryString(domainsRecord, 'server') ? { server: optionalDirectoryString(domainsRecord, 'server') } : {}),
      ...(optionalDirectoryString(domainsRecord, 'services') ? { services: optionalDirectoryString(domainsRecord, 'services') } : {}),
      ...(optionalDirectoryString(domainsRecord, 'webterminal') ? { webterminal: optionalDirectoryString(domainsRecord, 'webterminal') } : {}),
    }
    : undefined;

  return Object.freeze({
    directory_source: 'rich' as const,
    id: requiredDirectoryNumber(record, 'id', recordIndex),
    broker_id: endpoints.brokerId,
    ...readPublicRoutingFields(record),
    broker_name: requiredDirectoryString(record, 'broker_name', recordIndex),
    enabled: true,
    active: true,
    ...(optionalDirectoryString(record, 'status') ? { status: optionalDirectoryString(record, 'status') } : {}),
    ...(typeof record.license_active === 'boolean' ? { license_active: record.license_active } : {}),
    ...(typeof record.licensed === 'boolean' ? { licensed: record.licensed } : {}),
    config_version: endpoints.configVersion,
    schema_version: schemaVersion,
    services_domain: endpoints.servicesDomain,
    // REST base is derived at request time from server_url; keep market_api_url
    // aligned with the resolved apiBase for rich revalidation only.
    market_api_url: endpoints.apiBase,
    feed_wss_url: endpoints.feedWsBase,
    feed_status_https_url: endpoints.feedStatusUrl,
    ...(endpoints.tradeWsBase ? { trade_wss_url: endpoints.tradeWsBase } : {}),
    server_url: exactServerUrl,
    ...(optionalDirectoryString(record, 'domain_name') ? { domain_name: optionalDirectoryString(record, 'domain_name') } : {}),
    ...(optionalDirectoryString(record, 'server_domain') ? { server_domain: optionalDirectoryString(record, 'server_domain') } : {}),
    ...(optionalDirectoryString(record, 'feed_status_url') ? { feed_status_url: optionalDirectoryString(record, 'feed_status_url') } : {}),
    ...(optionalDirectoryString(record, 'feed_url') ? { feed_url: optionalDirectoryString(record, 'feed_url') } : {}),
    ...(optionalDirectoryString(record, 'feed_ws_url') ? { feed_ws_url: optionalDirectoryString(record, 'feed_ws_url') } : {}),
    ...(optionalDirectoryString(record, 'trade_ws_url') ? { trade_ws_url: optionalDirectoryString(record, 'trade_ws_url') } : {}),
    ...(optionalDirectoryString(record, 'ws_url') ? { ws_url: optionalDirectoryString(record, 'ws_url') } : {}),
    ...(optionalDirectoryString(record, 'wss_url') ? { wss_url: optionalDirectoryString(record, 'wss_url') } : {}),
    ...(domains && Object.keys(domains).length > 0 ? { domains } : {}),
    ...(optionalDirectoryString(record, 'logo_url') ? { logo_url: optionalDirectoryString(record, 'logo_url') } : {}),
    protocol: optionalDirectoryString(record, 'protocol') ?? '',
    region: optionalDirectoryString(record, 'region') ?? '',
    server: optionalDirectoryString(record, 'server') ?? '',
    server_ip: optionalDirectoryString(record, 'server_ip') ?? '',
    server_port: requiredDirectoryNumber(record, 'server_port', recordIndex),
    created_at: requiredDirectoryNumber(record, 'created_at', recordIndex),
  });
};

/**
 * Parses the one explicitly supported rich directory schema. Unversioned or
 * unknown payloads fail closed; the currently live unversioned response is a
 * release-contract blocker, not an alternate schema. Invalid rows are rejected
 * individually so one disabled record cannot hide unrelated approved brokers.
 */
export function parseBrokerDirectoryPayload(payload: unknown): RichValidatedBrokerServer[] {
  const envelope = asDirectoryRecord(payload) as BrokerDirectoryEnvelope | null;
  if (!envelope) {
    recordMarketDataEvent('directory_schema_result', {
      accepted: false,
      reason: 'missing_schema_version',
      topLevel: Array.isArray(payload) ? 'array' : typeof payload,
    });
    throw new BrokerDirectorySchemaError(
      'missing_schema_version',
      'Broker directory response must be a versioned object envelope.',
    );
  }
  const schemaVersion =
    (typeof envelope.schema_version === 'string' || typeof envelope.schema_version === 'number')
      ? String(envelope.schema_version).trim()
      : '';
  if (!schemaVersion) {
    recordMarketDataEvent('directory_schema_result', {
      accepted: false,
      reason: 'missing_schema_version',
    });
    throw new BrokerDirectorySchemaError(
      'missing_schema_version',
      'Broker directory response is missing schema_version.',
    );
  }
  if (schemaVersion !== SUPPORTED_RICH_BROKER_DIRECTORY_SCHEMA_VERSION) {
    recordMarketDataEvent('directory_schema_result', {
      accepted: false,
      reason: 'unsupported_schema_version',
      schemaVersion,
    });
    throw new BrokerDirectorySchemaError(
      'unsupported_schema_version',
      `Broker directory schema "${schemaVersion}" is not approved by this mobile build.`,
    );
  }

  const hasBrokers = Array.isArray(envelope.brokers);
  const hasValue = Array.isArray(envelope.value);
  if (hasBrokers && hasValue) {
    throw new BrokerDirectorySchemaError(
      'ambiguous_directory_records',
      'Broker directory response contains multiple record collections.',
    );
  }
  const rows = hasBrokers ? envelope.brokers : null;
  if (!Array.isArray(rows)) {
    throw new BrokerDirectorySchemaError(
      'missing_directory_records',
      'Broker directory response is missing its brokers array.',
    );
  }

  const accepted: RichValidatedBrokerServer[] = [];
  const rejected: BrokerDirectorySchemaError[] = [];
  rows.forEach((row, index) => {
    try {
      accepted.push(parseDirectoryRecord(row, schemaVersion, index));
    } catch (error) {
      if (error instanceof BrokerDirectorySchemaError) {
        rejected.push(error);
        return;
      }
      throw error;
    }
  });

  if (accepted.length === 0 && rejected.length > 0) {
    recordMarketDataEvent('directory_schema_result', {
      accepted: false,
      reason: rejected[0].code,
      rejectedCount: rejected.length,
    });
    throw rejected[0];
  }
  recordMarketDataEvent('directory_schema_result', {
    accepted: true,
    schemaVersion,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
  });
  return accepted;
}

const LEGACY_IDENTITY_ONLY_WARNING_CODE = 'legacy_directory_identity_only';

const requiredLegacyIdentityString = (
  record: Record<string, unknown>,
  key: 'broker_id' | 'broker_name',
  recordIndex: number,
): string => {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BrokerDirectorySchemaError(
      `missing_${key}`,
      `Legacy broker directory record ${recordIndex} is missing ${key}.`,
      recordIndex,
    );
  }
  return value.trim();
};

const requiredLegacyIdentityId = (
  record: Record<string, unknown>,
  recordIndex: number,
): string => {
  const value = record.id;
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  throw new BrokerDirectorySchemaError(
    'missing_id',
    `Legacy broker directory record ${recordIndex} is missing id.`,
    recordIndex,
  );
};

const RAW_V2_SCHEMA_VERSION = 'broker-directory.v2.raw' as const;

const acceptRawV2BrokerRecord = (
  record: Readonly<Record<string, unknown>>,
  recordIndex: number,
): RawV2BrokerServer => {
  const id = requiredDirectoryNumber(record, 'id', recordIndex);
  const createdAt = requiredDirectoryNumber(record, 'created_at', recordIndex);
  const server = requiredDirectoryString(record, 'server', recordIndex);
  const serverIp = requiredDirectoryString(record, 'server_ip', recordIndex);
  const protocol = requiredDirectoryString(record, 'protocol', recordIndex);
  requiredDirectoryString(record, 'server_url', recordIndex);
  requiredDirectoryString(record, 'feed_wss_url', recordIndex);
  requiredDirectoryString(record, 'feed_status_https_url', recordIndex);
  if (protocol.toLowerCase() !== 'https') {
    throw new BrokerDirectorySchemaError(
      'invalid_protocol',
      `Broker directory record ${recordIndex} must declare HTTPS protocol.`,
      recordIndex,
    );
  }
  const localConfigVersion = `v2:${id}:${createdAt}`;
  const candidate = {
    ...record,
    directory_source: 'v2_raw' as const,
    config_version: localConfigVersion,
  };
  const resolution = resolveBrokerEndpointSet(candidate);
  if (!resolution.ok) {
    throw new BrokerDirectorySchemaError(
      resolution.code,
      `Broker directory record ${recordIndex} was rejected: ${resolution.message}`,
      recordIndex,
    );
  }

  const { endpoints } = resolution;
  // Handoff contract: store directory server_url exactly as the service root.
  // REST/login uses {server_url}/api/v2 via ensureBrokerRestApiBase.
  const exactServerUrl = toBrokerServiceRoot(endpoints.apiBase);
  if (!exactServerUrl || !isBrokerServerUrlForApiBase(exactServerUrl, endpoints.apiBase)) {
    throw new BrokerDirectorySchemaError(
      'invalid_server_url',
      `Broker directory record ${recordIndex} must bind server_url to its broker service root.`,
      recordIndex,
    );
  }
  return Object.freeze({
    directory_source: 'v2_raw' as const,
    id,
    broker_id: endpoints.brokerId,
    ...readPublicRoutingFields(record),
    broker_name: requiredDirectoryString(record, 'broker_name', recordIndex),
    enabled: true as const,
    ...(typeof record.active === 'boolean' ? { active: record.active } : {}),
    ...(typeof record.license_active === 'boolean' ? { license_active: record.license_active } : {}),
    ...(typeof record.licensed === 'boolean' ? { licensed: record.licensed } : {}),
    config_version: endpoints.configVersion,
    schema_version: RAW_V2_SCHEMA_VERSION,
    server_url: exactServerUrl,
    // Not used for routing (server_url is authority). Kept as derived REST
    // base for any rich-style revalidation of the same host.
    market_api_url: ensureBrokerRestApiBase(exactServerUrl),
    services_domain: endpoints.servicesDomain,
    feed_wss_url: endpoints.feedWsBase,
    feed_status_https_url: endpoints.feedStatusUrl,
    ...(endpoints.tradeWsBase ? { trade_wss_url: endpoints.tradeWsBase } : {}),
    ...(optionalDirectoryString(record, 'logo_url') ? { logo_url: optionalDirectoryString(record, 'logo_url') } : {}),
    protocol: 'https',
    region: optionalDirectoryString(record, 'region') ?? '',
    server,
    server_ip: serverIp,
    server_port: requiredDirectoryNumber(record, 'server_port', recordIndex),
    created_at: createdAt,
  });
};

const parseRawV2BrokerDirectory = (
  rows: readonly unknown[],
): BrokerDirectoryResult => {
  const accepted: RawV2BrokerServer[] = [];
  const rejected: BrokerDirectorySchemaError[] = [];
  let blockedTestNetCount = 0;
  let pinnedFallbackCount = 0;

  rows.forEach((value, recordIndex) => {
    const record = asDirectoryRecord(value);
    if (!record) {
      rejected.push(new BrokerDirectorySchemaError(
        'malformed_record',
        `Broker directory record ${recordIndex} is not an object.`,
        recordIndex,
      ));
      return;
    }
    if (record.enabled === false) return;
    if (Object.prototype.hasOwnProperty.call(record, 'active') && record.active !== true) return;
    if (containsBlockedTestNetBrokerIp(record)) {
      blockedTestNetCount += 1;
      return;
    }

    try {
      accepted.push(acceptRawV2BrokerRecord(record, recordIndex));
    } catch (error) {
      if (!(error instanceof BrokerDirectorySchemaError)) {
        throw error;
      }
      // Contract v3 brokers whose directory row is unusable (raw IP / ws://)
      // fall back to their published hostnames. See pinnedBrokerEndpoints.ts.
      const pinnedRecord = withPinnedBrokerEndpoints(record);
      if (pinnedRecord) {
        try {
          accepted.push(acceptRawV2BrokerRecord(pinnedRecord, recordIndex));
          pinnedFallbackCount += 1;
          return;
        } catch (pinnedError) {
          if (!(pinnedError instanceof BrokerDirectorySchemaError)) {
            throw pinnedError;
          }
        }
      }
      rejected.push(error);
    }
  });

  if (accepted.length === 0 && rejected.length > 0) {
    throw rejected[0];
  }

  const selectableServers = Object.freeze(accepted) as readonly RawV2BrokerServer[];
  const entries = Object.freeze(selectableServers.map((server): RawV2BrokerDirectoryEntry => (
    Object.freeze({ kind: 'v2_server', server })
  )));
  const approvedServers = Object.freeze([]) as readonly RichValidatedBrokerServer[];

  recordMarketDataEvent('directory_schema_result', {
    accepted: true,
    mode: 'v2',
    acceptedCount: selectableServers.length,
    rejectedCount: rejected.length,
    blockedTestNetCount,
    pinnedFallbackCount,
  });

  return Object.freeze({
    mode: 'v2',
    entries,
    approvedServers,
    selectableServers,
  });
};

const parseLegacyBrokerDirectoryIdentities = (
  rows: readonly unknown[],
): BrokerDirectoryResult => {
  const accepted: BrokerDirectoryIdentity[] = [];
  const rejected: BrokerDirectorySchemaError[] = [];

  rows.forEach((value, recordIndex) => {
    const record = asDirectoryRecord(value);
    if (!record) {
      rejected.push(new BrokerDirectorySchemaError(
        'malformed_record',
        `Legacy broker directory record ${recordIndex} is not an object.`,
        recordIndex,
      ));
      return;
    }
    // An explicit backend disable is safe to honor for display. Missing
    // approval is still never upgraded into routing authority.
    if (record.enabled === false) return;

    try {
      // Deliberately copy only display identity. Every endpoint-like field in
      // the legacy object is discarded so it can never become routing authority.
      accepted.push(Object.freeze({
        kind: 'identity_only',
        id: requiredLegacyIdentityId(record, recordIndex),
        brokerId: requiredLegacyIdentityString(record, 'broker_id', recordIndex),
        brokerName: requiredLegacyIdentityString(record, 'broker_name', recordIndex),
      }));
    } catch (error) {
      if (error instanceof BrokerDirectorySchemaError) {
        rejected.push(error);
        return;
      }
      throw error;
    }
  });

  if (accepted.length === 0 && rejected.length > 0) {
    throw rejected[0];
  }

  const entries = Object.freeze(accepted);
  const approvedServers = Object.freeze([]) as readonly RichValidatedBrokerServer[];
  const selectableServers = Object.freeze([]) as readonly ValidatedBrokerServer[];

  recordMarketDataEvent('directory_schema_result', {
    accepted: false,
    identityDisplayAccepted: true,
    mode: 'identity_only',
    reason: LEGACY_IDENTITY_ONLY_WARNING_CODE,
    identityCount: entries.length,
    rejectedCount: rejected.length,
  });

  return Object.freeze({
    mode: 'identity_only',
    entries,
    approvedServers,
    selectableServers,
    warningCode: LEGACY_IDENTITY_ONLY_WARNING_CODE,
  });
};

/**
 * Parses either the approved rich contract or a quarantined legacy listing.
 * Legacy records can populate a read-only broker-name list, but they never
 * populate `approvedServers` and therefore cannot authorize any connection.
 */
export function parseBrokerDirectoryListingPayload(payload: unknown): BrokerDirectoryResult {
  if (Array.isArray(payload)) {
    return parseRawV2BrokerDirectory(payload);
  }

  const envelope = asDirectoryRecord(payload);
  const hasSchemaVersion = envelope
    ? Object.prototype.hasOwnProperty.call(envelope, 'schema_version')
    : false;
  if (envelope && !hasSchemaVersion && Array.isArray(envelope.value)) {
    return parseLegacyBrokerDirectoryIdentities(envelope.value);
  }

  // Unknown/unversioned envelopes and unsupported versions retain the strict
  // parser's fail-closed behavior.
  const approvedServers = Object.freeze([
    ...parseBrokerDirectoryPayload(payload),
  ]) as readonly RichValidatedBrokerServer[];
  const entries = Object.freeze(approvedServers.map((server): ApprovedBrokerDirectoryEntry => (
    Object.freeze({ kind: 'approved', server })
  )));

  return Object.freeze({
    mode: 'approved',
    entries,
    approvedServers,
    selectableServers: approvedServers,
  });
}

/**
 * Fallback response when broker_id is not found or not provided.
 * The API returns 200 with platform defaults that have a different shape
 * (some fields are string-typed numbers, different field names).
 */
export interface BrokerConfigFallbackResponse {
  broker_name: string;
  logo_url: string;
  theme_color: string;
  support_email: string;
  support_phone: string;
  terms_url: string;
  privacy_url: string;
  max_leverage: string;        // Note: string in fallback, number in full response
  min_deposit: string;
  min_withdrawal: string;
  maintenance_mode: string;    // "true" | "false" as strings
  allowed_countries: string;   // JSON string array
}

// ─── Status-specific error messages ─────────────────────────────────────────────

const HTTP_ERROR_MESSAGES: Record<number, string> = {
  401: 'Authentication required — please log in again',
  403: 'Access denied — insufficient permissions for this broker',
  404: 'Broker not found',
  422: 'Invalid broker ID format — please check and try again',
  429: 'Too many requests — please wait a moment and retry',
  500: 'Server error — the trading platform encountered an issue',
  502: 'Bad gateway — unable to reach the trading backend',
  503: 'Service unavailable — the trading platform is under maintenance',
  504: 'Gateway timeout — the trading backend took too long to respond',
};

// ─── Type guard ─────────────────────────────────────────────────────────────────

/**
 * Checks if the response is a full broker config (has broker_id field)
 * versus a platform default fallback.
 */
// Keep broker directory lookups bounded so login/account navigation never
// waits on a long network stall before the next touch can be handled.
// Directory discovery is a cold-start request and can pay DNS + TCP + TLS
// setup on a mobile network. Keep enough headroom for transient/cold latency;
// the query layer still owns bounded retries and the UI remains fail-closed.
const BROKER_SERVERS_TIMEOUT_MS = 10000;

/** Shown when the directory answers with something other than JSON. */
export const BROKER_LIST_UNAVAILABLE_MESSAGE =
  'Broker list unavailable: the broker directory returned a non-JSON response.';
// Matches the Settings/Accounts gate (SELECTED_BROKER_HEALTH_TIMEOUT_MS). The
// first probe after logout pays a cold DNS + TCP + TLS handshake before the
// backend responds, so a tighter budget false-fired "broker unavailable" on
// healthy brokers; the probe additionally retries once on timeout only.
const BROKER_HEALTH_TIMEOUT_MS = 3000;

export function isBrokerConfigFull(
  data: BrokerConfigResponse | BrokerConfigFallbackResponse
): data is BrokerConfigResponse {
  return 'broker_id' in data && typeof (data as BrokerConfigResponse).broker_id === 'string';
}

// ─── API Function ───────────────────────────────────────────────────────────────

/**
 * GET /broker/config
 *
 * Fetches broker-specific configuration. Uses apiClient for automatic
 * Bearer token injection and 401 refresh handling.
 *
 * @param brokerId - Optional broker ID. If omitted, the backend resolves
 *                   the broker from the JWT Bearer token or falls back to
 *                   platform defaults.
 * @returns BrokerConfigResponse with branding, feature flags, limits, and URLs
 * @throws BrokerConfigError with status-specific message on failure:
 *         - 422: Invalid/malformed broker_id
 *         - 429: Rate limited
 *         - 500: Internal server error
 *         - 503: Service unavailable / maintenance mode
 *         - Other non-200: Generic error with HTTP status
 */
export async function getBrokerConfig(brokerId?: string): Promise<BrokerConfigResponse> {
  // Build endpoint with optional broker_id query parameter
  const endpoint = brokerId
    ? `/broker/config?broker_id=${encodeURIComponent(brokerId)}`
    : '/broker/config';

  let response: Response;

  try {
    // Keep the directory schema parser importable in a plain Node test/runtime;
    // the React Native auth client is loaded only when this authenticated API
    // function actually runs.
    const { apiClient } = await import('./apiClient');
    response = await apiClient(endpoint);
  } catch (networkError) {
    // Network-level failures (DNS, timeout, connection refused)
    throw new BrokerConfigError(
      0,
      'Network error — unable to connect to the trading server. Please check your connection.'
    );
  }

  // ─── Handle non-200 HTTP responses with status-specific messages ────────
  if (!response.ok) {
    let serverMessage = '';
    try {
      const errorData = await response.json();
      serverMessage = errorData.detail || errorData.message || errorData.error || '';
    } catch (_e) {
      // Response body not parseable — use status-based message
    }

    const statusMessage = HTTP_ERROR_MESSAGES[response.status]
      || `Unexpected error (HTTP ${response.status})`;

    // Combine status-specific message with server detail when available
    const fullMessage = serverMessage
      ? `${statusMessage}: ${serverMessage}`
      : statusMessage;

    throw new BrokerConfigError(response.status, fullMessage);
  }

  return response.json();
}

/** Retain returned names even when a row's endpoints cannot authorize a connection. */
export function readReportedBrokerIdentities(payload: unknown): readonly BrokerDirectoryIdentity[] {
  const envelope = asDirectoryRecord(payload);
  const rows = Array.isArray(payload) ? payload : Array.isArray(envelope?.brokers) ? envelope.brokers : Array.isArray(envelope?.value) ? envelope.value : [];
  const identities = new Map<string, BrokerDirectoryIdentity>();
  for (const value of rows) {
    const record = asDirectoryRecord(value);
    if (!record || record.enabled === false || record.active === false) continue;
    const brokerId = typeof record.broker_id === 'string' ? record.broker_id.trim() : '';
    const brokerName = typeof record.broker_name === 'string' ? record.broker_name.trim() : '';
    if (!brokerId || !brokerName || identities.has(brokerId)) continue;
    identities.set(brokerId, Object.freeze({ kind: 'identity_only', id: String(record.id ?? brokerId), brokerId, brokerName }));
  }
  return Object.freeze([...identities.values()]);
}

/** Public broker directory; names and validated endpoints share one response. */
const fetchBrokerDirectoryFromBase = async (
  baseUrl: string,
): Promise<BrokerDirectoryResult> => {
  let response: Response;
  try {
    response = await timedFetch(`${baseUrl}/broker/servers`, {
      headers: { accept: 'application/json' },
    }, {
      label: 'broker.servers',
      method: 'GET',
      endpoint: '/broker/servers',
      source: 'broker',
      timeoutMs: BROKER_SERVERS_TIMEOUT_MS,
    });
  } catch (networkError) {
    if (networkError instanceof Error && networkError.name === 'AbortError') {
      throw new BrokerConfigError(
        0,
        'Broker list request timed out. Please check your connection and try again.',
      );
    }
    throw new BrokerConfigError(
      0,
      'Network error — unable to load broker list. Please check your connection.',
    );
  }

  if (!response.ok) {
    let serverMessage = '';
    try {
      const errorData = await response.json();
      serverMessage = errorData.detail || errorData.message || errorData.error || '';
    } catch {
      // ignore non-JSON error bodies
    }
    const statusMessage = HTTP_ERROR_MESSAGES[response.status]
      || `Unexpected error (HTTP ${response.status})`;
    const fullMessage = serverMessage ? `${statusMessage}: ${serverMessage}` : statusMessage;
    throw new BrokerConfigError(response.status, fullMessage);
  }

  // A non-JSON body (for example an HTML page from a wrong host) is an error,
  // never an empty list, so the query layer cannot cache it as 'no brokers'.
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new BrokerDirectoryContractError(
      'invalid_json',
      BROKER_LIST_UNAVAILABLE_MESSAGE,
    );
  }

  try {
    const directory = parseBrokerDirectoryListingPayload(data);
    return Object.freeze({
      ...directory,
      reportedBrokers: readReportedBrokerIdentities(data),
      primarySelectableServers: directory.selectableServers,
    });
  } catch (error) {
    if (error instanceof BrokerDirectoryContractError) {
      throw error;
    }
    if (error instanceof BrokerDirectorySchemaError) {
      throw new BrokerDirectoryContractError(
        error.code,
        `Broker directory contract rejected (${error.code}): ${error.message}`,
      );
    }
    throw error;
  }
};

const directoryEntryBrokerId = (entry: BrokerDirectoryEntry): string =>
  entry.kind === 'identity_only' ? entry.brokerId : entry.server.broker_id;

const mergeAdditionalBrokerDirectory = (
  primary: BrokerDirectoryResult,
  additional: BrokerDirectoryResult,
  allowedBrokerIds: readonly string[],
): BrokerDirectoryResult => {
  const allowed = new Set(allowedBrokerIds.map((brokerId) => brokerId.trim().toLowerCase()));
  const primaryEntryIds = new Set(
    primary.entries.map((entry) => directoryEntryBrokerId(entry).trim().toLowerCase()),
  );
  const primarySelectableIds = new Set(
    primary.selectableServers.map((server) => server.broker_id.trim().toLowerCase()),
  );
  const primaryApprovedIds = new Set(
    primary.approvedServers.map((server) => server.broker_id.trim().toLowerCase()),
  );
  const isAllowed = (brokerId: string) => allowed.has(brokerId.trim().toLowerCase());

  const extraEntries = additional.entries.filter((entry) => {
    const brokerId = directoryEntryBrokerId(entry).trim().toLowerCase();
    return allowed.has(brokerId) && !primaryEntryIds.has(brokerId);
  });
  const extraSelectableServers = additional.selectableServers.filter((server) => {
    const brokerId = server.broker_id.trim().toLowerCase();
    return isAllowed(brokerId) && !primarySelectableIds.has(brokerId);
  });
  const extraApprovedServers = additional.approvedServers.filter((server) => {
    const brokerId = server.broker_id.trim().toLowerCase();
    return isAllowed(brokerId) && !primaryApprovedIds.has(brokerId);
  });

  if (extraEntries.length === 0 && extraSelectableServers.length === 0) {
    return primary;
  }

  return Object.freeze({
    mode: primary.mode === 'identity_only' && extraSelectableServers.length > 0
      ? additional.mode
      : primary.mode,
    entries: Object.freeze([...primary.entries, ...extraEntries]),
    approvedServers: Object.freeze([...primary.approvedServers, ...extraApprovedServers]),
    selectableServers: Object.freeze([
      ...primary.selectableServers,
      ...extraSelectableServers,
    ]),
    reportedBrokers: primary.reportedBrokers,
    primarySelectableServers: primary.primarySelectableServers,
    ...(primary.warningCode ? { warningCode: primary.warningCode } : {}),
  });
};

const brokerDirectoryReadCache = createBrokerDirectoryReadCache<BrokerDirectoryResult>(30_000);

/** Test seam; cached records are process-local and never stored as routing authority. */
export const __clearBrokerDirectoryReadCacheForTests = () => brokerDirectoryReadCache.clear();

export async function getBrokerDirectory(): Promise<BrokerDirectoryResult> {
  if (!PUBLIC_BROKER_DIRECTORY_BASE_URL) {
    throw new BrokerConfigError(
      0,
      'Broker directory is not configured for this release.',
    );
  }

  // Full directory refreshes stay fresh while sharing any read already underway.
  const primaryRequest = brokerDirectoryReadCache.read(
    PUBLIC_BROKER_DIRECTORY_BASE_URL,
    () => fetchBrokerDirectoryFromBase(PUBLIC_BROKER_DIRECTORY_BASE_URL),
    true,
  );
  // The independent, approved public origins can load together. Waiting for
  // primary first added its entire network round trip to the search popup.
  // Handle optional rejection immediately even if primary is still pending.
  const additionalRequest = ADDITIONAL_BROKER_DIRECTORY_BASE_URL
    && ADDITIONAL_BROKER_DIRECTORY_IDS.length > 0
    && ADDITIONAL_BROKER_DIRECTORY_BASE_URL !== PUBLIC_BROKER_DIRECTORY_BASE_URL
    ? brokerDirectoryReadCache.read(
      ADDITIONAL_BROKER_DIRECTORY_BASE_URL,
      () => fetchBrokerDirectoryFromBase(ADDITIONAL_BROKER_DIRECTORY_BASE_URL),
      true,
    ).catch(() => null)
    : null;
  const primary = await primaryRequest;
  const additional = await additionalRequest;
  // Primary remains mandatory and authoritative; optional discovery only
  // contributes explicitly allowed rows after the normal endpoint validation.
  return additional
    ? mergeAdditionalBrokerDirectory(primary, additional, ADDITIONAL_BROKER_DIRECTORY_IDS)
    : primary;
}

/** Revalidates one broker without waiting for an unrelated optional directory. */
export async function getBrokerDirectoryForBroker(brokerId: string): Promise<BrokerDirectoryResult> {
  if (!PUBLIC_BROKER_DIRECTORY_BASE_URL) {
    throw new BrokerConfigError(0, 'Broker directory is not configured for this release.');
  }
  const primary = await brokerDirectoryReadCache.read(
    PUBLIC_BROKER_DIRECTORY_BASE_URL,
    () => fetchBrokerDirectoryFromBase(PUBLIC_BROKER_DIRECTORY_BASE_URL),
  );
  const requestedId = brokerId.trim().toLowerCase();
  // Match merge precedence here; the session coordinator still requires the
  // exact directory ID and approved endpoints before accepting credentials.
  if (primary.selectableServers.some((server) => server.broker_id.toLowerCase() === requestedId)) {
    return primary;
  }
  if (
    !ADDITIONAL_BROKER_DIRECTORY_BASE_URL
    || ADDITIONAL_BROKER_DIRECTORY_BASE_URL === PUBLIC_BROKER_DIRECTORY_BASE_URL
    || !ADDITIONAL_BROKER_DIRECTORY_IDS.some((id) => id.trim().toLowerCase() === requestedId)
  ) return primary;

  try {
    const additional = await brokerDirectoryReadCache.read(
      ADDITIONAL_BROKER_DIRECTORY_BASE_URL,
      () => fetchBrokerDirectoryFromBase(ADDITIONAL_BROKER_DIRECTORY_BASE_URL),
    );
    return mergeAdditionalBrokerDirectory(primary, additional, ADDITIONAL_BROKER_DIRECTORY_IDS);
  } catch {
    // A missing optional broker remains unsupported; it never replaces the
    // primary source or authorizes saved endpoint addresses.
    return primary;
  }
}

/** Returns every validated selectable server from rich or configured raw-v2 data. */
export async function getBrokerServers(): Promise<ValidatedBrokerServer[]> {
  const directory = await getBrokerDirectory();
  return [...directory.selectableServers];
}

const requestBrokerHealthUrl = (healthUrl: string): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BROKER_HEALTH_TIMEOUT_MS);
  return timedFetch(healthUrl, {
    signal: controller.signal,
    headers: { accept: 'application/json' },
  }, {
    label: 'broker.health',
    method: 'GET',
    endpoint: '/health',
    source: 'broker',
  }).finally(() => clearTimeout(timeout));
};

const isHealthProbeTimeout = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

export async function checkBrokerServerHealth(serverUrl: string): Promise<void> {
  const healthUrl = buildBrokerHealthUrl(serverUrl);
  if (!healthUrl) {
    throw new BrokerConfigError(0, 'Selected broker is unavailable');
  }

  let response: Response;
  try {
    response = await requestBrokerHealthUrl(healthUrl);
  } catch (firstError) {
    // Retry once on timeout only: the first probe after logout pays a cold
    // DNS + TCP + TLS handshake and can exceed the budget once while the
    // broker is actually healthy. Real failures stay fail-closed with no
    // retry so a genuinely down broker never stalls login.
    if (!isHealthProbeTimeout(firstError)) {
      throw new BrokerConfigError(0, 'Selected broker is unavailable');
    }
    try {
      response = await requestBrokerHealthUrl(healthUrl);
    } catch {
      throw new BrokerConfigError(0, 'Selected broker is unavailable');
    }
  }

  if (!response.ok) {
    throw new BrokerConfigError(
      response.status,
      'Selected broker is unavailable',
    );
  }
}


// ─── Public broker config / sign-up gate (contract v3) ──────────────────────────

/** Subset of the public GET {server_url}/api/v2/broker/config used before login. */
export type PublicBrokerSignUpConfig = Readonly<{
  registration_enabled?: boolean;
  demo_registration_enabled?: boolean;
  server_name?: string;
  broker_name?: string;
}>;

export type BrokerSignUpAvailability = 'enabled' | 'disabled' | 'unknown';

const PUBLIC_BROKER_CONFIG_TIMEOUT_MS = 5000;

/**
 * Unauthenticated read of `/broker/config` on the selected broker's validated
 * service root. Used only to decide whether sign-up may be offered.
 */
export async function getPublicBrokerConfig(serverUrl: string): Promise<PublicBrokerSignUpConfig> {
  const apiBase = ensureBrokerRestApiBase(serverUrl);
  if (!apiBase) {
    throw new BrokerConfigError(0, 'Selected broker is unavailable');
  }
  const response = await timedFetch(`${apiBase}/broker/config`, {
    headers: { accept: 'application/json' },
  }, {
    label: 'broker.config.public',
    method: 'GET',
    endpoint: '/broker/config',
    source: 'broker',
    timeoutMs: PUBLIC_BROKER_CONFIG_TIMEOUT_MS,
  });
  if (!response.ok) {
    throw new BrokerConfigError(response.status, `Broker config unavailable (HTTP ${response.status})`);
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new BrokerConfigError(0, 'Broker config returned an invalid response');
  }
  return data as PublicBrokerSignUpConfig;
}

/**
 * Sign-up is offered only when the broker explicitly allows it. Both
 * Trivanta and Orrnn report `registration_enabled:false` and
 * `demo_registration_enabled:false`, so sign-up stays hidden for them.
 * A config without either flag is 'unknown' (legacy behaviour applies).
 */
export function resolveBrokerSignUpAvailability(
  config: PublicBrokerSignUpConfig | null | undefined,
  kind: 'any' | 'real' | 'demo' = 'any',
): BrokerSignUpAvailability {
  if (!config) return 'unknown';
  const real = config.registration_enabled;
  const demo = config.demo_registration_enabled;
  const flags = kind === 'real' ? [real] : kind === 'demo' ? [demo] : [real, demo];
  if (flags.some((flag) => flag === true)) return 'enabled';
  if (flags.some((flag) => flag === false)) return 'disabled';
  return 'unknown';
}
