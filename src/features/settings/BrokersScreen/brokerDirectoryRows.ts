import type { BrokerDirectoryEntry, BrokerServer } from '../../../api/broker';
import {
  PUBLIC_BROKER_DIRECTORY_BASE_URL,
  isBrokerServerUrlForApiBase,
  normalizeBrokerServerUrl,
  resolveBrokerEndpointSet,
} from '../../../api/brokerRouting';

const PINNED_BROKER_NAMES = ['MetaQuotes Ltd.'];

type BrokerDirectoryRowBase = {
  id: string;
  brokerId: string;
  name: string;
  server: string;
  logoUrl: string;
  region: string;
  protocol: string;
};

export type SelectableBrokerDirectoryRow = BrokerDirectoryRowBase & {
  selectable: true;
  serverUrl: string;
  feedStatusUrl: string;
  domain: string;
};

export type IdentityOnlyBrokerDirectoryRow = BrokerDirectoryRowBase & {
  selectable: false;
  serverUrl: '';
  feedStatusUrl: '';
  logoUrl: '';
  region: '';
  protocol: '';
  domain?: never;
};

export type BrokerDirectoryRow =
  | SelectableBrokerDirectoryRow
  | IdentityOnlyBrokerDirectoryRow;

const BROKER_LOGO_KEYS = [
  'logo_url',
  'logoUrl',
  'logo',
  'logo_path',
  'logoPath',
  'image_url',
  'imageUrl',
  'icon_url',
  'iconUrl',
  'brand_logo_url',
  'brandLogoUrl',
] as const;

const BROKER_LOGO_NESTED_KEYS = [
  'brand',
  'branding',
  'config',
  'theme',
] as const;

const PUBLIC_BROKER_DIRECTORY_ORIGIN = (() => {
  try {
    return new URL(PUBLIC_BROKER_DIRECTORY_BASE_URL).origin;
  } catch {
    return PUBLIC_BROKER_DIRECTORY_BASE_URL.replace(/\/api\/v\d+\/?$/i, '');
  }
})();

function getLogoValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function resolveBrokerDomain(value: string): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const hostname = parsed.hostname.trim().replace(/\.$/, '').toLowerCase();
    return parsed.protocol === 'https:' && hostname.includes('.')
      ? hostname
      : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeBrokerLogoUrl(logoUrl?: string | null) {
  const raw = String(logoUrl ?? '').trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/^http:\/\//i, 'https://');
  }

  try {
    const base = raw.startsWith('/')
      ? `${PUBLIC_BROKER_DIRECTORY_ORIGIN}/`
      : `${PUBLIC_BROKER_DIRECTORY_BASE_URL.replace(/\/+$/, '')}/`;
    return new URL(raw, base).toString().replace(/^http:\/\//i, 'https://');
  } catch {
    return raw;
  }
}

export function resolveBrokerLogoUrl(broker: BrokerServer) {
  const record = broker as unknown as Record<string, unknown>;

  for (const key of BROKER_LOGO_KEYS) {
    const directLogo = normalizeBrokerLogoUrl(getLogoValue(record[key]));
    if (directLogo) return directLogo;
  }

  for (const key of BROKER_LOGO_NESTED_KEYS) {
    const nested = asUnknownRecord(record[key]);
    if (!nested) continue;
    for (const logoKey of BROKER_LOGO_KEYS) {
      const nestedLogo = normalizeBrokerLogoUrl(getLogoValue(nested[logoKey]));
      if (nestedLogo) return nestedLogo;
    }
  }

  return '';
}

export function buildBrokerDomainLogoUrl(domain?: string) {
  const cleanDomain = String(domain ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return cleanDomain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain)}&sz=128`
    : '';
}

export function formatBrokerInitials(name: string) {
  const words = name
    .replace(/\([^)]*\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase();
  return initials || 'BR';
}

function isRawNetworkEndpoint(value: string) {
  const host = value
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split('/')[0];

  return (
    /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(host) ||
    /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/i.test(host)
  );
}

function formatVisibleServerName(broker: BrokerServer) {
  const server = broker.server?.trim() || '';
  if (!server || isRawNetworkEndpoint(server)) {
    return broker.broker_name?.trim() || broker.broker_id;
  }

  return server;
}

export function buildBrokerDirectoryRows(
  entries?: readonly BrokerDirectoryEntry[],
): BrokerDirectoryRow[] {
  const rowsByBrokerId = new Map<string, BrokerDirectoryRow>();

  for (const entry of entries ?? []) {
    let row: BrokerDirectoryRow;

    if (entry.kind === 'approved' || entry.kind === 'v2_server') {
      const broker = entry.server;
      const resolution = resolveBrokerEndpointSet(broker);
      const exactServerUrl = normalizeBrokerServerUrl(broker.server_url);
      // Handoff: selectable rows keep exact directory server_url (service root).
      // REST apiBase is {server_url}/api/v2 and must match that root.
      if (resolution.ok && isBrokerServerUrlForApiBase(exactServerUrl, resolution.endpoints.apiBase)) {
        row = {
          id: `srv-${broker.id ?? broker.broker_id}`,
          brokerId: resolution.endpoints.brokerId,
          name: broker.broker_name,
          server: formatVisibleServerName(broker),
          selectable: true,
          serverUrl: exactServerUrl,
          feedStatusUrl: resolution.endpoints.feedStatusUrl,
          logoUrl: resolveBrokerLogoUrl(broker),
          region: broker.region,
          protocol: broker.protocol,
          domain: resolution.endpoints.servicesDomain,
        };
      } else {
        // A malformed runtime value must never gain authority merely because
        // its discriminator says "approved". Preserve identity only.
        row = {
          id: `srv-${broker.id ?? broker.broker_id}`,
          brokerId: broker.broker_id,
          name: broker.broker_name,
          server: broker.broker_name,
          selectable: false,
          serverUrl: '',
          feedStatusUrl: '',
          logoUrl: '',
          region: '',
          protocol: '',
        };
      }
    } else {
      row = {
        id: `srv-${entry.id || entry.brokerId}`,
        brokerId: entry.brokerId,
        name: entry.brokerName,
        server: entry.brokerName,
        selectable: false,
        serverUrl: '',
        feedStatusUrl: '',
        logoUrl: '',
        region: '',
        protocol: '',
      };
    }

    const brokerKey = row.brokerId.trim().toLowerCase();
    if (!brokerKey) continue;
    const existing = rowsByBrokerId.get(brokerKey);
    if (!existing || (!existing.selectable && row.selectable)) {
      rowsByBrokerId.set(brokerKey, row);
    }
  }

  return [...rowsByBrokerId.values()];
}

export function sortBrokerDirectoryRows(
  rows: readonly BrokerDirectoryRow[],
): BrokerDirectoryRow[] {
  const pinnedSet = new Set(PINNED_BROKER_NAMES.map((name) => name.toLowerCase()));
  return [...rows].sort((a, b) => {
    const aPinned = pinnedSet.has(a.name.toLowerCase()) ? 0 : 1;
    const bPinned = pinnedSet.has(b.name.toLowerCase()) ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    return a.name.localeCompare(b.name);
  });
}
