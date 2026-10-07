const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const BROKER_BACKEND_DOMAIN_UNAVAILABLE_MESSAGE =
  'Broker endpoints are missing, invalid, or not approved for this broker. Please update the broker service contract and try again.';

export type BrokerServiceDiscovery = {
  directory_source?: 'rich' | 'v2_raw' | null;
  id?: string | number | null;
  broker_id?: string | null;
  enabled?: boolean | null;
  active?: boolean | null;
  status?: string | null;
  license_active?: boolean | null;
  licensed?: boolean | null;
  config_version?: string | number | null;
  schema_version?: string | number | null;
  services_domain?: string | null;
  market_api_url?: string | null;
  feed_status_https_url?: string | null;
  feed_status_url?: string | null;
  feed_ws_url?: string | null;
  feed_wss_url?: string | null;
  trade_ws_url?: string | null;
  trade_wss_url?: string | null;
  server_url?: string | null;

  // Other legacy/opaque fields remain typed so callers can report why a record
  // was rejected. They are never used to construct an authenticated endpoint.
  domain_name?: string | null;
  server_domain?: string | null;
  feed_url?: string | null;
  ws_url?: string | null;
  wss_url?: string | null;
  domains?: {
    domain_name?: string | null;
    server?: string | null;
    services?: string | null;
  } | null;
  protocol?: string | null;
  server?: string | null;
  server_ip?: string | null;
  server_port?: number | null;
  created_at?: string | number | null;
};

export type ValidatedBrokerEndpointSet = Readonly<{
  brokerId: string;
  apiBase: string;
  feedWsBase: string;
  feedStatusUrl: string;
  tradeWsBase?: string;
  servicesDomain: string;
  configVersion: string;
}>;

export type BrokerEndpointResolutionErrorCode =
  | 'blocked_test_net_endpoint'
  | 'disabled'
  | 'missing_enabled_approval'
  | 'inactive'
  | 'missing_active_approval'
  | 'unlicensed'
  | 'missing_license_approval'
  | 'missing_broker_id'
  | 'missing_config_version'
  | 'missing_services_domain'
  | 'invalid_services_domain'
  | 'opaque_or_missing_endpoints'
  | 'conflicting_endpoint_fields'
  | 'invalid_api_endpoint'
  | 'invalid_feed_endpoint'
  | 'invalid_status_endpoint'
  | 'invalid_trade_endpoint'
  | 'endpoint_host_mismatch'
  | 'invalid_server_url';

export type BrokerEndpointResolution =
  | { ok: true; mode: 'direct' | 'v2_raw'; endpoints: ValidatedBrokerEndpointSet }
  | { ok: false; code: BrokerEndpointResolutionErrorCode; message: string };

type StrictServiceProtocol = 'https:' | 'wss:';

type StrictUrlOptions = {
  allowQuery?: boolean;
};

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const BLOCKED_TEST_NET_BROKER_IP_PATTERN =
  /(?:^|[^0-9])203\.0\.113\.(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:$|[^0-9])/;
const RESERVED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.invalid'] as const;
const BROKER_ROUTING_ADDRESS_FIELDS = [
  'server',
  'server_ip',
  'server_url',
  'market_api_url',
  'services_domain',
  'domain_name',
  'server_domain',
  'admin_domain',
  'manager_domain',
  'webterminal_domain',
  'feed_status_https_url',
  'feed_status_url',
  'feed_url',
  'feed_ws_url',
  'feed_wss_url',
  'trade_ws_url',
  'trade_wss_url',
  'ws_url',
  'wss_url',
] as const;

/**
 * Returns true when a known routing/address/domain field contains one of the
 * documentation-only 203.0.113.0/24 range used by broken broker fixtures.
 * Unknown metadata is deliberately ignored for forward-compatible v2 rows.
 */
export function containsBlockedTestNetBrokerIp(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const visited = new WeakSet<object>();

  const visitDomainMap = (candidate: unknown): boolean => {
    if (typeof candidate === 'string') {
      return BLOCKED_TEST_NET_BROKER_IP_PATTERN.test(candidate);
    }
    if (!candidate || typeof candidate !== 'object') return false;
    if (visited.has(candidate)) return false;
    visited.add(candidate);

    if (Array.isArray(candidate)) {
      return candidate.some(visitDomainMap);
    }
    return Object.values(candidate as Record<string, unknown>).some(visitDomainMap);
  };

  return BROKER_ROUTING_ADDRESS_FIELDS.some((field) => {
    const candidate = record[field];
    return typeof candidate === 'string' && BLOCKED_TEST_NET_BROKER_IP_PATTERN.test(candidate);
  }) || visitDomainMap(record.domains);
}

const isIpv4Host = (hostname: string): boolean => {
  if (!IPV4_PATTERN.test(hostname)) return false;
  return hostname.split('.').every((part) => {
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
};

const isIpLiteral = (hostname: string): boolean => {
  const normalized = hostname.trim().replace(/^\[|\]$/g, '');
  return isIpv4Host(normalized) || normalized.includes(':');
};

const isApprovedPublicHostname = (hostname: string): boolean => {
  const normalized = hostname.trim().replace(/\.$/, '').toLowerCase();
  if (!normalized || normalized === 'localhost' || isIpLiteral(normalized) || !normalized.includes('.')) {
    return false;
  }
  return !RESERVED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
};

const normalizeStrictServiceUrl = (
  value: string | undefined | null,
  protocol: StrictServiceProtocol,
  options: StrictUrlOptions = {},
): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (
      url.protocol !== protocol ||
      !isApprovedPublicHostname(url.hostname) ||
      url.username ||
      url.password ||
      url.hash ||
      (!options.allowQuery && url.search)
    ) {
      return '';
    }

    const pathname = url.pathname === '/' ? '' : trimTrailingSlash(url.pathname);
    return `${url.protocol}//${url.host}${pathname}${options.allowQuery ? url.search : ''}`;
  } catch {
    return '';
  }
};

export const normalizeBrokerHttpsUrl = (value?: string | null): string =>
  normalizeStrictServiceUrl(value, 'https:');

export const normalizeBrokerWssUrl = (value?: string | null): string =>
  normalizeStrictServiceUrl(value, 'wss:');

const API_VERSION_PATH_PATTERN = /^\/api\/v\d+$/i;

/**
 * Directory records publish the broker *service root* (e.g. https://services.myprop.trade).
 * REST lives under that root at /api/v2. Already-versioned bases are preserved.
 */
export function ensureBrokerRestApiBase(serverUrl?: string | null): string {
  const normalized = normalizeBrokerHttpsUrl(serverUrl);
  if (!normalized) return '';

  try {
    const url = new URL(normalized);
    const pathname = url.pathname === '/' ? '' : trimTrailingSlash(url.pathname);
    if (!pathname) {
      return `${url.protocol}//${url.host}/api/v2`;
    }
    if (API_VERSION_PATH_PATTERN.test(pathname)) {
      return normalized;
    }
    // Non-version paths are left exact; callers must not invent segments.
    return normalized;
  } catch {
    return '';
  }
}

/**
 * Health is served at the service root (`/health`), not under `/api/vN`.
 * Strip a trailing API version path when the REST base was stored as apiBase.
 */
export function toBrokerServiceRoot(serverUrl?: string | null): string {
  const normalized = normalizeBrokerHttpsUrl(serverUrl);
  if (!normalized) return '';

  try {
    const url = new URL(normalized);
    const pathname = url.pathname === '/' ? '' : trimTrailingSlash(url.pathname);
    if (!pathname) {
      return `${url.protocol}//${url.host}`;
    }
    if (API_VERSION_PATH_PATTERN.test(pathname)) {
      return `${url.protocol}//${url.host}`;
    }
    return normalized;
  } catch {
    return '';
  }
}

/**
 * The gateway trade lifecycle socket has one broker-owned path. The broker
 * directory's validated `server_url` remains the authority; only its exact
 * TLS host (including an explicit port) is reused for `/ws/v2`.
 */
export function deriveBrokerTradeWsBase(serverUrl?: string | null): string {
  const normalized = normalizeBrokerHttpsUrl(serverUrl);
  if (!normalized) return '';

  try {
    const url = new URL(normalized);
    return normalizeBrokerWssUrl(`wss://${url.host}/ws/v2`);
  } catch {
    return '';
  }
}

type ApprovedServiceAuthority = {
  authority: string;
  hostname: string;
};

const parseApprovedServicesDomain = (value: string | undefined | null): ApprovedServiceAuthority | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const candidate = raw.includes('://') ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== 'https:' ||
      !isApprovedPublicHostname(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '/' && url.pathname !== '')
    ) {
      return null;
    }
    return {
      authority: url.host.toLowerCase(),
      hostname: url.hostname.toLowerCase(),
    };
  } catch {
    return null;
  }
};

const normalizeVersion = (value: unknown): string => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim();
};

const resolveExplicitEndpoint = (
  values: ReadonlyArray<string | null | undefined>,
  protocol: StrictServiceProtocol,
): { value: string; conflict: boolean; present: boolean } => {
  const presentValues = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  if (presentValues.length === 0) {
    return { value: '', conflict: false, present: false };
  }

  const normalized = presentValues.map((value) => normalizeStrictServiceUrl(value, protocol));
  if (normalized.some((value) => !value)) {
    return { value: '', conflict: false, present: true };
  }
  const unique = Array.from(new Set(normalized));
  return {
    value: unique.length === 1 ? unique[0] : '',
    conflict: unique.length > 1,
    present: true,
  };
};

const endpointHostMatches = (endpoint: string, approved: ApprovedServiceAuthority): boolean => {
  try {
    const url = new URL(endpoint);
    return url.host.toLowerCase() === approved.authority && url.hostname.toLowerCase() === approved.hostname;
  } catch {
    return false;
  }
};

const resolutionError = (
  code: BrokerEndpointResolutionErrorCode,
  message: string,
): BrokerEndpointResolution => ({ ok: false, code, message });

type CompatibleEndpointResult = Readonly<{
  value: string;
  conflict: boolean;
}>;

const resolveCompatibleRawV2Endpoint = (
  values: ReadonlyArray<string | null | undefined>,
  protocol: StrictServiceProtocol,
  approved: ApprovedServiceAuthority,
): CompatibleEndpointResult => {
  const compatible = values
    .map((value) => normalizeStrictServiceUrl(value, protocol))
    .filter((value) => value && endpointHostMatches(value, approved));
  const unique = Array.from(new Set(compatible));
  return {
    value: unique.length === 1 ? unique[0] : '',
    conflict: unique.length > 1,
  };
};

/**
 * Resolves a row already accepted from the configured v2 directory. The API
 * base comes exclusively from that row's `server_url`; no domain aliases,
 * market URL, broker ID, or platform URL can replace it.
 */
const resolveRawV2BrokerEndpointSet = (
  record: BrokerServiceDiscovery,
): BrokerEndpointResolution => {
  const brokerId = String(record.broker_id ?? '').trim();
  if (!brokerId) {
    return resolutionError('missing_broker_id', 'Broker record is missing broker_id.');
  }
  if (Object.prototype.hasOwnProperty.call(record, 'enabled') && record.enabled !== true) {
    if (record.enabled === false) {
      return resolutionError('disabled', `Broker "${brokerId}" is disabled.`);
    }
    return resolutionError(
      'missing_enabled_approval',
      `Broker "${brokerId}" is missing an explicit enabled approval.`,
    );
  }
  const brokerStatus = String(record.status ?? '').trim().toLowerCase();
  if (
    (Object.prototype.hasOwnProperty.call(record, 'active') && record.active !== true) ||
    ['disabled', 'inactive', 'suspended', 'revoked', 'deleted'].includes(brokerStatus)
  ) {
    return resolutionError('inactive', `Broker "${brokerId}" is inactive.`);
  }
  if (record.license_active === false || record.licensed === false) {
    return resolutionError('unlicensed', `Broker "${brokerId}" is not licensed for mobile routing.`);
  }

  const serviceRoot = normalizeBrokerHttpsUrl(record.server_url);
  const apiBase = ensureBrokerRestApiBase(serviceRoot);
  if (!serviceRoot || !apiBase || isSharedBackendOrigin(serviceRoot)) {
    return resolutionError(
      'invalid_server_url',
      `Broker "${brokerId}" has an invalid HTTPS server_url.`,
    );
  }

  const parsedServiceRoot = new URL(serviceRoot);
  const approved: ApprovedServiceAuthority = {
    authority: parsedServiceRoot.host.toLowerCase(),
    hostname: parsedServiceRoot.hostname.toLowerCase(),
  };
  const feed = resolveCompatibleRawV2Endpoint(
    [record.feed_wss_url, record.feed_ws_url, record.feed_url, record.wss_url, record.ws_url],
    'wss:',
    approved,
  );
  const status = resolveCompatibleRawV2Endpoint(
    [record.feed_status_https_url, record.feed_status_url],
    'https:',
    approved,
  );
  const trade = resolveCompatibleRawV2Endpoint(
    [record.trade_wss_url, record.trade_ws_url],
    'wss:',
    approved,
  );
  const hasExplicitTradeEndpoint = [record.trade_wss_url, record.trade_ws_url]
    .some((value) => Boolean(String(value ?? '').trim()));

  if (feed.conflict || status.conflict || trade.conflict) {
    return resolutionError(
      'conflicting_endpoint_fields',
      `Broker "${brokerId}" exposes conflicting compatible endpoint aliases.`,
    );
  }
  if (!feed.value) {
    return resolutionError(
      'invalid_feed_endpoint',
      `Broker "${brokerId}" has no compatible exact WSS feed endpoint.`,
    );
  }
  if (!status.value) {
    return resolutionError(
      'invalid_status_endpoint',
      `Broker "${brokerId}" has no compatible exact HTTPS feed status endpoint.`,
    );
  }
  if (hasExplicitTradeEndpoint && !trade.value) {
    return resolutionError(
      'invalid_trade_endpoint',
      `Broker "${brokerId}" has an invalid or mismatched WSS trade endpoint.`,
    );
  }

  const tradeWsBase = trade.value || deriveBrokerTradeWsBase(serviceRoot);
  if (!tradeWsBase) {
    return resolutionError(
      'invalid_trade_endpoint',
      `Broker "${brokerId}" has no valid WSS trade endpoint.`,
    );
  }

  const configVersion = normalizeVersion(record.config_version);
  if (!configVersion) {
    return resolutionError(
      'missing_config_version',
      `Broker "${brokerId}" is missing its local v2 record version.`,
    );
  }

  return {
    ok: true,
    mode: 'v2_raw',
    endpoints: Object.freeze({
      brokerId,
      apiBase,
      feedWsBase: feed.value,
      feedStatusUrl: status.value,
      tradeWsBase,
      servicesDomain: approved.authority,
      configVersion,
    }),
  };
};

/**
 * Validates the direct-endpoint form of a rich broker-directory record.
 *
 * The resolver deliberately does not inspect generic domains, raw server
 * values, regions, broker IDs, or IP fields to manufacture routes. The sole
 * derivation allowed is the gateway `/ws/v2` path on an exact validated
 * `server_url` when an explicit trade socket URL is absent.
 */
export function resolveBrokerEndpointSet(record: BrokerServiceDiscovery): BrokerEndpointResolution {
  if (containsBlockedTestNetBrokerIp(record)) {
    return resolutionError(
      'blocked_test_net_endpoint',
      'Broker record contains a blocked TEST-NET placeholder endpoint.',
    );
  }
  if (record.directory_source === 'v2_raw') {
    return resolveRawV2BrokerEndpointSet(record);
  }

  const brokerId = String(record.broker_id ?? '').trim();
  if (!brokerId) {
    return resolutionError('missing_broker_id', 'Broker record is missing broker_id.');
  }
  if (record.enabled !== true) {
    if (record.enabled !== false) {
      return resolutionError(
        'missing_enabled_approval',
        `Broker "${brokerId}" is missing an explicit enabled approval.`,
      );
    }
    return resolutionError('disabled', `Broker "${brokerId}" is disabled.`);
  }
  const brokerStatus = String(record.status ?? '').trim().toLowerCase();
  if (record.active !== true) {
    if (record.active !== false) {
      return resolutionError(
        'missing_active_approval',
        `Broker "${brokerId}" is missing an explicit active approval.`,
      );
    }
    return resolutionError('inactive', `Broker "${brokerId}" is inactive.`);
  }
  if (['disabled', 'inactive', 'suspended', 'revoked', 'deleted'].includes(brokerStatus)) {
    return resolutionError('inactive', `Broker "${brokerId}" is inactive.`);
  }
  if (record.license_active === false || record.licensed === false) {
    return resolutionError('unlicensed', `Broker "${brokerId}" is not licensed for mobile routing.`);
  }
  if (record.license_active !== true && record.licensed !== true) {
    return resolutionError(
      'missing_license_approval',
      `Broker "${brokerId}" is missing an explicit license approval.`,
    );
  }

  const configVersion = normalizeVersion(record.config_version);
  if (!configVersion) {
    return resolutionError(
      'missing_config_version',
      `Broker "${brokerId}" is missing config_version.`,
    );
  }

  const rawServicesDomain = String(record.services_domain ?? '').trim();
  if (!rawServicesDomain) {
    return resolutionError('missing_services_domain', `Broker "${brokerId}" is missing services_domain.`);
  }
  const approvedDomain = parseApprovedServicesDomain(rawServicesDomain);
  if (!approvedDomain) {
    return resolutionError('invalid_services_domain', `Broker "${brokerId}" has an invalid services_domain.`);
  }

  const api = resolveExplicitEndpoint([record.market_api_url], 'https:');
  const feed = resolveExplicitEndpoint([record.feed_wss_url, record.feed_ws_url], 'wss:');
  const status = resolveExplicitEndpoint(
    [record.feed_status_https_url, record.feed_status_url],
    'https:',
  );
  const trade = resolveExplicitEndpoint([record.trade_wss_url, record.trade_ws_url], 'wss:');

  if (!api.present || !feed.present || !status.present) {
    return resolutionError(
      'opaque_or_missing_endpoints',
      `Broker "${brokerId}" does not expose the required rich direct-endpoint set.`,
    );
  }
  if (api.conflict || feed.conflict || status.conflict || trade.conflict) {
    return resolutionError(
      'conflicting_endpoint_fields',
      `Broker "${brokerId}" exposes conflicting endpoint aliases.`,
    );
  }
  if (!api.value) {
    return resolutionError('invalid_api_endpoint', `Broker "${brokerId}" has an invalid HTTPS API endpoint.`);
  }
  const restApiBase = ensureBrokerRestApiBase(api.value);
  if (!restApiBase) {
    return resolutionError('invalid_api_endpoint', `Broker "${brokerId}" has an invalid HTTPS API endpoint.`);
  }
  if (!feed.value) {
    return resolutionError('invalid_feed_endpoint', `Broker "${brokerId}" has an invalid WSS feed endpoint.`);
  }
  if (!status.value) {
    return resolutionError('invalid_status_endpoint', `Broker "${brokerId}" has an invalid HTTPS feed status endpoint.`);
  }
  if (trade.present && !trade.value) {
    return resolutionError('invalid_trade_endpoint', `Broker "${brokerId}" has an invalid WSS trade endpoint.`);
  }

  const derivedTradeWsBase = !trade.present && isBrokerServerUrlForApiBase(record.server_url, restApiBase)
    ? deriveBrokerTradeWsBase(record.server_url)
    : '';
  const tradeWsBase = trade.value || derivedTradeWsBase;

  const endpoints = [restApiBase, feed.value, status.value, ...(tradeWsBase ? [tradeWsBase] : [])];
  if (endpoints.some((endpoint) => !endpointHostMatches(endpoint, approvedDomain))) {
    return resolutionError(
      'endpoint_host_mismatch',
      `Broker "${brokerId}" endpoint host does not match services_domain.`,
    );
  }

  return {
    ok: true,
    mode: 'direct',
    endpoints: Object.freeze({
      brokerId,
      apiBase: restApiBase,
      feedWsBase: feed.value,
      feedStatusUrl: status.value,
      ...(tradeWsBase ? { tradeWsBase } : {}),
      servicesDomain: approvedDomain.authority,
      configVersion,
    }),
  };
}

export type BrokerSessionEndpointSetInput = Readonly<{
  brokerId: string;
  apiBase: string;
  feedWsBase: string;
  feedStatusUrl: string;
  tradeWsBase?: string | null;
  servicesDomain: string;
  configVersion: string | number;
}>;

/**
 * Revalidates a previously approved endpoint set without deriving any field.
 * This is used when committing/restoring a session so persisted URLs cannot be
 * accepted unless every exact host still matches the approved services domain.
 */
export function revalidateBrokerSessionEndpointSet(
  input: BrokerSessionEndpointSetInput,
): BrokerEndpointResolution {
  const tradeWsBase = input.tradeWsBase || deriveBrokerTradeWsBase(input.apiBase);
  return resolveBrokerEndpointSet({
    broker_id: input.brokerId,
    enabled: true,
    active: true,
    license_active: true,
    config_version: input.configVersion,
    services_domain: input.servicesDomain,
    market_api_url: input.apiBase,
    feed_wss_url: input.feedWsBase,
    feed_status_https_url: input.feedStatusUrl,
    ...(tradeWsBase ? { trade_wss_url: tradeWsBase } : {}),
  });
}

const normalizeConfiguredHttpsBase = (value: string | undefined | null): string =>
  normalizeBrokerHttpsUrl(value);

// These are platform endpoints, not broker-session fallbacks. A release that
// omits them remains unconfigured instead of silently changing backend family.
export const DEFAULT_API_BASE_URL = normalizeConfiguredHttpsBase(
  process.env.EXPO_PUBLIC_API_BASE_URL,
);

export const PUBLIC_BROKER_DIRECTORY_BASE_URL = normalizeConfiguredHttpsBase(
  process.env.EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL,
);

export const ADDITIONAL_BROKER_DIRECTORY_BASE_URL = normalizeConfiguredHttpsBase(
  process.env.EXPO_PUBLIC_ADDITIONAL_BROKER_DIRECTORY_BASE_URL,
);

export const ADDITIONAL_BROKER_DIRECTORY_IDS = Object.freeze(
  String(process.env.EXPO_PUBLIC_ADDITIONAL_BROKER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const SHARED_AUTH_PROXY_API_BASE_URL = normalizeConfiguredHttpsBase(
  process.env.EXPO_PUBLIC_AUTH_PROXY_API_BASE_URL,
);

const getSharedBackendOrigins = (): string[] =>
  [
    DEFAULT_API_BASE_URL,
    PUBLIC_BROKER_DIRECTORY_BASE_URL,
    ADDITIONAL_BROKER_DIRECTORY_BASE_URL,
    SHARED_AUTH_PROXY_API_BASE_URL,
  ]
    .filter(Boolean)
    .map((value) => new URL(value).origin.toLowerCase());

export function normalizeBrokerServerUrl(serverUrl?: string | null): string {
  return normalizeBrokerHttpsUrl(serverUrl);
}

export function isSharedBackendOrigin(serverUrl?: string | null): boolean {
  const normalized = normalizeBrokerHttpsUrl(serverUrl);
  if (!normalized) return false;
  return getSharedBackendOrigins().includes(new URL(normalized).origin.toLowerCase());
}

export function isBrokerServiceBaseUrl(serverUrl?: string | null): boolean {
  const normalized = normalizeBrokerHttpsUrl(serverUrl);
  return Boolean(normalized && !isSharedBackendOrigin(normalized));
}

export function getBrokerBackendDomainUnavailableMessage(brokerId?: string | null): string {
  const normalizedBrokerId = String(brokerId ?? '').trim();
  return normalizedBrokerId
    ? `Broker endpoints are missing, invalid, or not approved for broker "${normalizedBrokerId}".`
    : BROKER_BACKEND_DOMAIN_UNAVAILABLE_MESSAGE;
}

/** @deprecated Use resolveBrokerEndpointSet and retain the full endpoint set. */
export function resolveBrokerServiceBaseUrl(broker: BrokerServiceDiscovery): string {
  const resolution = resolveBrokerEndpointSet(broker);
  return resolution.ok ? resolution.endpoints.apiBase : '';
}

export function shouldUseBrokerHostedQuoteFeed(serverUrl?: string | null): boolean {
  return isBrokerServiceBaseUrl(serverUrl);
}

/**
 * Returns the broker REST API base for authenticated calls.
 * Directory service roots become `{root}/api/v2`; already-versioned bases are preserved.
 */
export function buildBrokerApiBaseUrl(serverUrl?: string | null): string {
  return isBrokerServiceBaseUrl(serverUrl) ? ensureBrokerRestApiBase(serverUrl) : '';
}

/**
 * True when `serverUrl` is the directory service root (or already-versioned form)
 * for the resolved REST `apiBase`. Directory handoff stores exact `server_url`
 * roots; REST always lives at `{server_url}/api/v2`.
 */
export function isBrokerServerUrlForApiBase(
  serverUrl?: string | null,
  apiBase?: string | null,
): boolean {
  const restFromServer = ensureBrokerRestApiBase(serverUrl);
  const restFromApiBase = ensureBrokerRestApiBase(apiBase);
  return Boolean(restFromServer && restFromApiBase && restFromServer === restFromApiBase);
}

export function buildApiUrl(endpoint: string, apiBaseUrl: string): string {
  const normalizedBase = normalizeBrokerHttpsUrl(apiBaseUrl);
  if (!normalizedBase) {
    throw new Error('API base URL is missing or invalid.');
  }

  if (/^https?:\/\//i.test(endpoint)) {
    const normalizedEndpoint = normalizeBrokerHttpsUrl(endpoint);
    if (
      !normalizedEndpoint ||
      (normalizedEndpoint !== normalizedBase && !normalizedEndpoint.startsWith(`${normalizedBase}/`))
    ) {
      throw new Error('Absolute API endpoint is outside the active broker API base.');
    }
    return normalizedEndpoint;
  }

  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${normalizedBase}${normalizedEndpoint}`;
}

export type BrokerApiVersion = 'v1' | 'v2';

/**
 * Builds a route on another supported API version without changing broker
 * authority. Authentication and request lifecycle remain inside BrokerAPI.
 */
export function buildVersionedBrokerApiUrl(
  endpoint: string,
  apiBaseUrl: string,
  version: BrokerApiVersion,
): string {
  const serviceRoot = toBrokerServiceRoot(apiBaseUrl);
  if (!serviceRoot) {
    throw new Error('API base URL is missing or invalid.');
  }
  return buildApiUrl(endpoint, `${serviceRoot}/api/${version}`);
}

/** Builds the pre-login health endpoint at the broker service root (`/health`). */
export function buildBrokerHealthUrl(serverUrl: string): string {
  const serviceRoot = toBrokerServiceRoot(serverUrl);
  return serviceRoot ? `${serviceRoot}/health` : '';
}

/**
 * @deprecated Broker WebSocket endpoints must be supplied explicitly by a
 * validated record/handoff. This helper only accepts an already exact WSS URL.
 */
export function buildBrokerWsUrl(
  exactWsUrl: string | undefined | null,
  path: '/ws' | '/ws/v2' | '/ws/feed',
  _fallbackUrl: string,
): string {
  const normalized = normalizeBrokerWssUrl(exactWsUrl);
  if (!normalized) return '';
  try {
    return new URL(normalized).pathname === path ? normalized : '';
  } catch {
    return '';
  }
}

/** Accepts only an explicit WSS URL; never upgrades or falls back. */
export function normalizeConfiguredWsUrl(
  configuredUrl: string | undefined | null,
  _fallbackUrl: string,
): string {
  return normalizeStrictServiceUrl(configuredUrl, 'wss:', { allowQuery: true });
}
