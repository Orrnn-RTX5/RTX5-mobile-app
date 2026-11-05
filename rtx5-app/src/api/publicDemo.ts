import { timedFetch } from '../utils/apiLatency';
import {
  type BrokerServiceDiscovery,
  resolveBrokerEndpointSet,
  type ValidatedBrokerEndpointSet,
} from './brokerRouting';

const DEMO_SETUP_TEMPORARILY_UNAVAILABLE_MESSAGE =
  'Demo account service is temporarily unavailable. Please try again in a moment.';

function configuredPositiveNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export const ORRNN_DEMO_BROKER_ID = process.env.EXPO_PUBLIC_ORRNN_DEMO_BROKER_ID || '';
export const ORRNN_DEMO_INITIAL_BALANCE = configuredPositiveNumber(
  process.env.EXPO_PUBLIC_ORRNN_DEMO_INITIAL_BALANCE,
);
export const ORRNN_DEMO_ORIGIN_BROKER =
  process.env.EXPO_PUBLIC_ORRNN_DEMO_ORIGIN_BROKER || '';
export const ORRNN_DEMO_ORIGIN_BROKER_DISPLAY_NAME =
  process.env.EXPO_PUBLIC_ORRNN_DEMO_ORIGIN_BROKER_DISPLAY_NAME ||
  'Orrnn demo mobile';
export const ORRNN_DEMO_ORIGIN_BROKER_LABEL =
  process.env.EXPO_PUBLIC_ORRNN_DEMO_ORIGIN_BROKER_LABEL ||
  'Demo account source';
export const ORRNN_DEMO_CANONICAL_GROUP = 'orrnn-demo/demo-std';
export const PUBLIC_API_V1_BASE_URL =
  process.env.EXPO_PUBLIC_API_V1_BASE_URL || '';
export const PUBLIC_DEMO_API_BASE_URL =
  process.env.EXPO_PUBLIC_DEMO_API_BASE_URL || '';

export interface OrrnnDemoStatusResponse {
  service: string;
  status: string;
  broker: string;
  broker_id: string;
  demo_groups_available: number;
  total_demo_accounts: number;
  database: string;
}

export class OrrnnDemoApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'OrrnnDemoApiError';
    this.statusCode = statusCode;
  }
}

function getDemoSetupUnavailableMessage(statusCode: number): string {
  if (statusCode >= 500 || statusCode === 0) {
    return DEMO_SETUP_TEMPORARILY_UNAVAILABLE_MESSAGE;
  }

  return 'Demo account setup is temporarily unavailable. Please try again.';
}

export function isOrrnnDemoHealthy(status: OrrnnDemoStatusResponse | null | undefined): boolean {
  return (
    Boolean(ORRNN_DEMO_BROKER_ID) &&
    status?.service === 'orrnn-demo' &&
    status.broker_id === ORRNN_DEMO_BROKER_ID &&
    status.status === 'ok' &&
    status.broker === 'active' &&
    status.database === 'connected' &&
    status.demo_groups_available > 0
  );
}

export async function getOrrnnDemoStatus(): Promise<OrrnnDemoStatusResponse> {
  if (!PUBLIC_DEMO_API_BASE_URL) {
    throw new OrrnnDemoApiError(0, DEMO_SETUP_TEMPORARILY_UNAVAILABLE_MESSAGE);
  }
  let response: Response;

  try {
    response = await timedFetch(`${PUBLIC_DEMO_API_BASE_URL}/public/demo-status`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    }, {
      label: 'publicDemo.status',
      method: 'GET',
      endpoint: '/public/demo-status',
      source: 'publicDemo',
    });
  } catch (_error) {
    throw new OrrnnDemoApiError(
      0,
      'Network error - unable to reach the demo account service.',
    );
  }

  if (!response.ok) {
    throw new OrrnnDemoApiError(
      response.status,
      getDemoSetupUnavailableMessage(response.status),
    );
  }

  return response.json();
}

export interface OrrnnDemoGroup {
  name: string;
  description: string;
  currency: string;
  leverage: number;
}

export interface OrrnnDemoGroupsResponse {
  groups: OrrnnDemoGroup[];
  count: number;
}

export interface CreateOrrnnDemoAccountRequest {
  group: string;
  email: string;
  master_pass: string;
  first_name: string;
  last_name?: string;
  phone?: string;
  initial_balance: number;
  origin_broker: string;
}

export interface OrrnnDemoAccountResponse {
  login: number;
  broker_id: string;
  group: string;
}

type OrrnnDemoBrokerDiscovery = BrokerServiceDiscovery & {
  broker_id?: string | null;
  broker_name?: string | null;
  logo_url?: string | null;
};

export type OrrnnDemoBrokerAuthRoute = {
  brokerId: string;
  serverUrl: string;
  logoUrl: string;
  endpoints: ValidatedBrokerEndpointSet | null;
  source: 'broker-directory' | 'missing';
};

export function resolveOrrnnDemoBrokerAuthRoute(
  brokerId: string,
  brokers: readonly OrrnnDemoBrokerDiscovery[],
): OrrnnDemoBrokerAuthRoute {
  const routeBrokerId = brokerId.trim();
  const broker = brokers.find(
    (candidate) => candidate.broker_id?.trim() === routeBrokerId,
  );

  if (!broker) {
    return {
      brokerId: routeBrokerId,
      serverUrl: '',
      logoUrl: '',
      endpoints: null,
      source: 'missing',
    };
  }

  const resolution = resolveBrokerEndpointSet(broker);
  const endpoints = resolution.ok ? resolution.endpoints : null;

  return {
    brokerId: routeBrokerId,
    serverUrl: endpoints?.apiBase ?? '',
    logoUrl: broker.logo_url?.trim() ?? '',
    endpoints,
    source: endpoints
      ? 'broker-directory'
      : 'missing',
  };
}

/**
 * Retrieves the list of available demo groups for the orrnn broker.
 * The `name` field from the response items should be used as the `group`
 * parameter when creating a new demo account via POST /api/v1/public/demo-account.
 */
export async function getOrrnnDemoGroups(): Promise<OrrnnDemoGroupsResponse> {
  if (!PUBLIC_DEMO_API_BASE_URL) {
    throw new OrrnnDemoApiError(0, DEMO_SETUP_TEMPORARILY_UNAVAILABLE_MESSAGE);
  }
  let response: Response;

  try {
    response = await timedFetch(`${PUBLIC_DEMO_API_BASE_URL}/public/demo-groups`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    }, {
      label: 'publicDemo.groups',
      method: 'GET',
      endpoint: '/public/demo-groups',
      source: 'publicDemo',
    });
  } catch (_error) {
    throw new OrrnnDemoApiError(
      0,
      'Network error - unable to fetch demo groups.',
    );
  }

  if (!response.ok) {
    throw new OrrnnDemoApiError(
      response.status,
      getDemoSetupUnavailableMessage(response.status),
    );
  }

  return response.json();
}

function compactDemoAccountRequest(
  data: CreateOrrnnDemoAccountRequest,
): CreateOrrnnDemoAccountRequest {
  const lastName = data.last_name?.trim();
  const phone = data.phone?.trim();

  return {
    group: data.group,
    email: data.email.trim(),
    master_pass: data.master_pass,
    first_name: data.first_name.trim(),
    ...(lastName ? { last_name: lastName } : {}),
    ...(phone ? { phone } : {}),
    initial_balance: data.initial_balance,
    origin_broker: data.origin_broker.trim(),
  };
}

async function getDemoAccountErrorMessage(response: Response): Promise<string> {
  const errorData = await response.json().catch(() => ({}));
  const code =
    errorData.code ||
    errorData.retcode ||
    errorData.error?.code ||
    errorData.detail?.code ||
    '';
  const message =
    errorData.message ||
    errorData.detail?.message ||
    errorData.detail ||
    errorData.error?.message ||
    errorData.error ||
    '';

  if (code && message) return `${code}: ${message}`;
  if (message) return String(message);
  if (code) return String(code);
  return `HTTP ${response.status}`;
}

/**
 * INTEGRATED: POST /api/v1/public/demo-account.
 *
 * Creates an unauthenticated Orrnn demo trading account for white-label
 * frontends. The server owns the orrnn-demo identity and live-group rejection;
 * the client sends only the exact public creation DTO.
 */
export async function createOrrnnDemoAccount(
  data: CreateOrrnnDemoAccountRequest,
): Promise<OrrnnDemoAccountResponse> {
  if (!PUBLIC_DEMO_API_BASE_URL || !ORRNN_DEMO_BROKER_ID) {
    throw new OrrnnDemoApiError(0, DEMO_SETUP_TEMPORARILY_UNAVAILABLE_MESSAGE);
  }
  let response: Response;

  try {
    response = await timedFetch(`${PUBLIC_DEMO_API_BASE_URL}/public/demo-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(compactDemoAccountRequest(data)),
    }, {
      label: 'publicDemo.createAccount',
      method: 'POST',
      endpoint: '/public/demo-account',
      source: 'register',
    });
  } catch (_error) {
    throw new OrrnnDemoApiError(
      0,
      'Network error - unable to create the demo account.',
    );
  }

  // The public demo-account contract returns 200 for success. Some server
  // errors are documented as 201 with an MT5-compatible ExceptionResult body,
  // so do not use response.ok here.
  if (response.status !== 200) {
    const serverMessage = await getDemoAccountErrorMessage(response);
    throw new OrrnnDemoApiError(
      response.status,
      `Demo account creation failed: ${serverMessage}`,
    );
  }

  const account = await response.json();
  if (
    typeof account?.login !== 'number' ||
    !Number.isInteger(account.login) ||
    account.login <= 0
  ) {
    throw new OrrnnDemoApiError(
      response.status,
      'Demo account creation failed: response did not include a login number.',
    );
  }
  if (account.broker_id !== ORRNN_DEMO_BROKER_ID) {
    throw new OrrnnDemoApiError(
      response.status,
      'Demo account creation failed: response broker did not match the configured demo broker.',
    );
  }
  if (account.group !== ORRNN_DEMO_CANONICAL_GROUP) {
    throw new OrrnnDemoApiError(
      response.status,
      'Demo account creation failed: response group did not match the canonical demo group.',
    );
  }

  return account as OrrnnDemoAccountResponse;
}
