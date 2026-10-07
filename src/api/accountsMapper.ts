import {
  readRawAccountGroup,
  resolveAccountEnvironment,
  type AccountEnvironment,
  type BackendAccountEnvironmentSource,
} from '../domain/accountType';

type NumericAccountField = number | string | null | undefined;

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function pickFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = parseFiniteNumber(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return parseFiniteNumber(value) ?? fallback;
}

/**
 * Contract v3 (`GET /account/{login}`): `equity`, `used_margin`,
 * `free_margin`, `margin_level` and `floating_pnl` are present only when the
 * server calculation succeeds. A missing value keeps the last known value and
 * is reported as stale; it is never replaced with 0 or recomputed locally.
 */
export type ServerMetricResolution = Readonly<{ value: number; stale: boolean }>;

export function resolveServerMetric(
  parsed: number | undefined,
  previous: number | undefined,
): ServerMetricResolution {
  if (parsed !== undefined) {
    return { value: parsed, stale: false };
  }
  // No earlier value exists on the first load: 0 is a placeholder only and is
  // flagged stale so the UI can show it as unavailable.
  return {
    value: typeof previous === 'number' && Number.isFinite(previous) ? previous : 0,
    stale: true,
  };
}

/** `margin_level: 0` means no margin is used; display it as an em dash. */
export function formatMarginLevel(
  marginLevel: number | null | undefined,
  format: (value: number) => string = (value) => value.toFixed(2),
): string {
  if (typeof marginLevel !== 'number' || !Number.isFinite(marginLevel) || marginLevel === 0) {
    return '—';
  }
  return `${format(marginLevel)}%`;
}

/** Account metrics the server may omit when its calculation fails. */
export type TradingAccountServerMetric =
  | 'equity'
  | 'usedMargin'
  | 'freeMargin'
  | 'marginLevel'
  | 'floatingPnl';

/**
 * Single trading account as returned by `GET /account/{login}` (snake_case).
 * `GET /accounts` is not used: it returns 403 for traders (contract v3).
 */
export interface TradingAccountRaw {
  login: NumericAccountField;
  name?: string | null;
  group?: string | null;
  Group?: unknown;
  account_group?: unknown;
  accountGroup?: unknown;
  account_type?: unknown;
  accountType?: unknown;
  type?: unknown;
  kind?: unknown;
  account_kind?: unknown;
  accountKind?: unknown;
  mode?: unknown;
  is_demo?: unknown;
  isDemo?: unknown;
  demo?: unknown;
  is_contest?: unknown;
  isContest?: unknown;
  contest?: unknown;
  account?: unknown;
  user?: unknown;
  currency?: string | null;
  leverage: NumericAccountField;
  balance: NumericAccountField;
  credit: NumericAccountField;
  equity: NumericAccountField;
  margin?: NumericAccountField;
  margin_used?: NumericAccountField;
  used_margin?: NumericAccountField;
  marginUsed?: NumericAccountField;
  usedMargin?: NumericAccountField;
  margin_free?: NumericAccountField;
  free_margin?: NumericAccountField;
  freeMargin?: NumericAccountField;
  margin_available?: NumericAccountField;
  marginAvailable?: NumericAccountField;
  margin_level?: NumericAccountField;
  marginLevel?: NumericAccountField;
  floating?: NumericAccountField;
  floating_pnl?: NumericAccountField;
  total_swap?: NumericAccountField;
  /** Not sent by contract v3; derive from the positions list length instead. */
  open_positions?: NumericAccountField;
  status?: string | null;
  created_at?: NumericAccountField;
  updated_at?: NumericAccountField;
}

/**
 * Normalized trading account for UI consumption (camelCase).
 */
export interface TradingAccount {
  login: number;
  name: string;
  group: string;
  accountEnvironment: AccountEnvironment;
  accountEnvironmentSource: BackendAccountEnvironmentSource;
  currency: string;
  leverage: number;
  balance: number;
  credit: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  marginLevel: number;
  floatingPnl: number;
  totalSwap: number;
  /**
   * Legacy `open_positions` when a server sends it, otherwise 0. Contract v3
   * does not send it: UIs must use the length of the positions list.
   */
  openPositions: number;
  status: string;
  createdAt: number;
  updatedAt: number;
  /**
   * Server metrics that were missing from this response. Their values are the
   * last known values (or a 0 placeholder when none exist yet).
   */
  staleMetrics: readonly TradingAccountServerMetric[];
}

/**
 * Maps a single raw API account (snake_case) to the UI-friendly shape (camelCase).
 */
export function mapRawAccount(
  raw: TradingAccountRaw,
  previous?: TradingAccount | null,
): TradingAccount {
  const login = Math.trunc(toFiniteNumber(raw.login));
  const accountEnvironmentEvidence = resolveAccountEnvironment(raw, true);
  // Only reuse earlier values for the same account.
  const prior = previous && previous.login === login ? previous : undefined;
  const equity = resolveServerMetric(pickFiniteNumber(raw.equity), prior?.equity);
  // `used_margin` is the contract key; older aliases remain fallbacks.
  const usedMargin = resolveServerMetric(pickFiniteNumber(
    raw.used_margin,
    raw.margin_used,
    raw.marginUsed,
    raw.usedMargin,
    raw.margin,
  ), prior?.usedMargin);
  const freeMargin = resolveServerMetric(pickFiniteNumber(
    raw.free_margin,
    raw.margin_free,
    raw.freeMargin,
    raw.margin_available,
    raw.marginAvailable,
  ), prior?.freeMargin);
  const marginLevel = resolveServerMetric(
    pickFiniteNumber(raw.margin_level, raw.marginLevel),
    prior?.marginLevel,
  );
  const floatingPnl = resolveServerMetric(
    pickFiniteNumber(raw.floating_pnl, raw.floating),
    prior?.floatingPnl,
  );
  const staleMetrics = (
    [
      ['equity', equity],
      ['usedMargin', usedMargin],
      ['freeMargin', freeMargin],
      ['marginLevel', marginLevel],
      ['floatingPnl', floatingPnl],
    ] as const
  )
    .filter(([, metric]) => metric.stale)
    .map(([key]) => key);

  return {
    login,
    name: raw.name || `Account ${login}`,
    // Preserve the backend value. A missing group is unknown environment
    // evidence; fabricating "standard" would conflate lot type with Real.
    group: readRawAccountGroup(raw) ?? '',
    accountEnvironment: accountEnvironmentEvidence.accountType,
    accountEnvironmentSource: accountEnvironmentEvidence.source,
    currency: raw.currency || 'USD',
    leverage: toFiniteNumber(raw.leverage),
    balance: toFiniteNumber(raw.balance),
    credit: toFiniteNumber(raw.credit),
    equity: equity.value,
    usedMargin: usedMargin.value,
    freeMargin: freeMargin.value,
    marginLevel: marginLevel.value,
    floatingPnl: floatingPnl.value,
    totalSwap: toFiniteNumber(raw.total_swap),
    openPositions: Math.trunc(toFiniteNumber(raw.open_positions)),
    status: raw.status || 'active',
    createdAt: toFiniteNumber(raw.created_at),
    updatedAt: toFiniteNumber(raw.updated_at),
    staleMetrics,
  };
}
