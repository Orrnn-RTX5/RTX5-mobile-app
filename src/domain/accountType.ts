export type AccountEnvironment = 'demo' | 'real' | 'contest' | 'unknown';
export type KnownAccountEnvironment = Exclude<AccountEnvironment, 'unknown'>;
export type TradingAccountType = KnownAccountEnvironment;

export type LotType = 'standard' | 'cent' | 'micro' | 'unknown';

export type AccountEnvironmentSource =
  | 'backend-explicit'
  | 'backend-group'
  | 'demo-registration'
  | 'initial-fallback'
  | 'legacy-persisted'
  | 'unknown';

export type BackendAccountEnvironmentSource =
  | 'backend-explicit'
  | 'backend-group'
  | 'unknown';

export type AccountEnvironmentEvidence = Readonly<{
  accountType: AccountEnvironment;
  source: BackendAccountEnvironmentSource;
}>;

export type AccountEnvironmentState = Readonly<{
  accountKey: string;
  accountType: KnownAccountEnvironment;
  accountEnvironmentSource: AccountEnvironmentSource;
  isDemoAccount: boolean;
}>;

export type MergeAccountEnvironmentInput = Readonly<{
  accountKey: string;
  resolved: AccountEnvironment;
  source: AccountEnvironmentSource;
  allowInitialFallback?: boolean;
}>;

type UnknownRecord = Record<string, unknown>;

/**
 * Candidate containers retain the legacy backend-shape priority:
 * root payload, root.account, root.user, then root.user.account.
 *
 * Within each container, textual environment aliases are evaluated in this
 * explicit order. Unrecognized values (including lot types) do not block the
 * next alias or container.
 */
const ENVIRONMENT_TEXT_ALIASES = [
  'account_type',
  'accountType',
  'type',
  'kind',
  'account_kind',
  'accountKind',
  'mode',
] as const;

const DEMO_BOOLEAN_ALIASES = ['is_demo', 'isDemo', 'demo'] as const;
const CONTEST_BOOLEAN_ALIASES = ['is_contest', 'isContest', 'contest'] as const;
const ENVIRONMENT_GROUP_ALIASES = ['group', 'Group', 'account_group', 'accountGroup'] as const;

const LOT_TYPE_ALIASES = ['account_type', 'accountType', 'lot_type', 'lotType'] as const;

function readRecord(value: unknown): UnknownRecord | null {
  try {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as UnknownRecord
      : null;
  } catch {
    return null;
  }
}

function readField(record: UnknownRecord | null, key: string): unknown {
  if (!record) return undefined;
  try {
    return record[key];
  } catch {
    return undefined;
  }
}

function readCandidateRecords(payload: unknown): Array<UnknownRecord | null> {
  const root = readRecord(payload);
  const account = readRecord(readField(root, 'account'));
  const user = readRecord(readField(root, 'user'));
  const nestedUserAccount = readRecord(readField(user, 'account'));
  return [root, account, user, nestedUserAccount];
}

function normalizeComparisonText(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, '/');
}

function resolveEnvironmentText(value: unknown): KnownAccountEnvironment | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = normalizeComparisonText(value);
  if (!normalized) return undefined;

  // Preserve the established substring precedence for broker-specific values.
  if (normalized.includes('demo')) return 'demo';
  if (
    normalized.includes('contest')
    || normalized.includes('competition')
    || normalized.includes('tournament')
  ) {
    return 'contest';
  }
  if (normalized.includes('real') || normalized.includes('live')) return 'real';

  return undefined;
}

function resolveLotTypeText(value: unknown): Exclude<LotType, 'unknown'> | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = normalizeComparisonText(value);
  if (!normalized) return undefined;

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  if (normalized === 'standard' || tokens.includes('standard')) return 'standard';
  if (normalized === 'cent' || tokens.includes('cent')) return 'cent';
  if (normalized === 'micro' || tokens.includes('micro')) return 'micro';

  return undefined;
}

function readFirstTextMatch<T>(
  records: Array<UnknownRecord | null>,
  aliases: readonly string[],
  resolve: (value: unknown) => T | undefined,
): T | undefined {
  for (const record of records) {
    for (const alias of aliases) {
      const resolved = resolve(readField(record, alias));
      if (resolved !== undefined) return resolved;
    }
  }
  return undefined;
}

function readFirstDemoBoolean(
  records: Array<UnknownRecord | null>,
): KnownAccountEnvironment | undefined {
  for (const record of records) {
    for (const alias of DEMO_BOOLEAN_ALIASES) {
      const value = readField(record, alias);
      // Only JSON booleans are authoritative. String/number truthiness is not.
      if (typeof value === 'boolean') return value ? 'demo' : 'real';
    }
  }
  return undefined;
}

function readFirstContestBoolean(
  records: Array<UnknownRecord | null>,
): KnownAccountEnvironment | undefined {
  for (const record of records) {
    for (const alias of CONTEST_BOOLEAN_ALIASES) {
      const value = readField(record, alias);
      // `false` means only "not contest"; it does not prove a Real account.
      if (value === true) return 'contest';
    }
  }
  return undefined;
}

/**
 * Resolves only explicit backend evidence. It never applies a UI fallback.
 *
 * Priority:
 * 1. textual environment aliases;
 * 2. Demo boolean aliases (`false` is explicit Real);
 * 3. legacy Contest boolean aliases (`true` only);
 * 4. group aliases.
 *
 * Each phase uses root -> account -> user -> user.account container priority.
 */
export function resolveAccountEnvironment(payload: unknown): AccountEnvironment;
export function resolveAccountEnvironment(
  payload: unknown,
  includeEvidence: true,
): AccountEnvironmentEvidence;
export function resolveAccountEnvironment(
  payload: unknown,
  includeEvidence = false,
): AccountEnvironment | AccountEnvironmentEvidence {
  const records = readCandidateRecords(payload);
  const result = (
    accountType: AccountEnvironment,
    source: BackendAccountEnvironmentSource,
  ): AccountEnvironment | AccountEnvironmentEvidence => (
    includeEvidence ? Object.freeze({ accountType, source }) : accountType
  );

  const direct = readFirstTextMatch(records, ENVIRONMENT_TEXT_ALIASES, resolveEnvironmentText);
  if (direct) return result(direct, 'backend-explicit');

  const demoBoolean = readFirstDemoBoolean(records);
  if (demoBoolean) return result(demoBoolean, 'backend-explicit');

  const contestBoolean = readFirstContestBoolean(records);
  if (contestBoolean) return result(contestBoolean, 'backend-explicit');

  // A group must identify an environment. Lot-only or custom group names
  // (for example "standard" or "VIP") do not prove that an account is Real.
  const group = readRawAccountGroup(payload);
  if (group) {
    return result(resolveEnvironmentText(group) ?? 'unknown', 'backend-group');
  }
  return result('unknown', 'unknown');
}

/**
 * Returns the first raw server group using the same container and alias order
 * as environment resolution. The returned value is intentionally not trimmed
 * or normalized so display/API consumers retain the backend contract value.
 */
export function readRawAccountGroup(payload: unknown): string | undefined {
  const records = readCandidateRecords(payload);
  for (const record of records) {
    for (const alias of ENVIRONMENT_GROUP_ALIASES) {
      const value = readField(record, alias);
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * Resolves lot denomination independently from Demo/Real/Contest environment.
 */
export function resolveLotType(payload: unknown): LotType {
  const records = readCandidateRecords(payload);
  return readFirstTextMatch(records, LOT_TYPE_ALIASES, resolveLotTypeText) ?? 'unknown';
}

/**
 * Stable account identity for environment state. Broker identity scopes login
 * numbers that may repeat across brokers; neither value influences classifying
 * the account itself.
 */
export function buildAccountEnvironmentKey(
  brokerId: string | null | undefined,
  accountLogin: string | number | null | undefined,
): string {
  const normalizedBrokerId = String(brokerId ?? '').trim().toLowerCase();
  const normalizedAccountLogin = String(accountLogin ?? '').trim();
  return `${encodeURIComponent(normalizedBrokerId)}:${encodeURIComponent(normalizedAccountLogin)}`;
}

function createAccountEnvironmentState(
  accountKey: string,
  accountType: KnownAccountEnvironment,
  accountEnvironmentSource: AccountEnvironmentSource,
): AccountEnvironmentState {
  return Object.freeze({
    accountKey,
    accountType,
    accountEnvironmentSource,
    isDemoAccount: accountType === 'demo',
  });
}

/**
 * Merges fresh evidence for one account without allowing Unknown to erase a
 * known classification or leak a prior account's classification.
 */
export function mergeAccountEnvironment(
  previous: AccountEnvironmentState | null | undefined,
  input: MergeAccountEnvironmentInput,
): AccountEnvironmentState | null {
  const accountKey = input.accountKey.trim();
  const isDifferentActiveAccount = Boolean(previous && previous.accountKey !== accountKey);

  // A refresh/result for another account is stale unless the caller explicitly
  // identifies this operation as initialization of the newly active account.
  if (isDifferentActiveAccount && !input.allowInitialFallback) {
    return previous ?? null;
  }

  // Compatibility fallback is weak initialization evidence. It must never
  // replace a known value already stored for this exact account.
  if (
    previous?.accountKey === accountKey
    && input.source === 'initial-fallback'
    && input.resolved === 'real'
  ) {
    return previous;
  }

  if (input.resolved !== 'unknown') {
    return createAccountEnvironmentState(accountKey, input.resolved, input.source);
  }

  if (previous?.accountKey === accountKey) {
    return previous;
  }

  if (input.allowInitialFallback) {
    return createAccountEnvironmentState(accountKey, 'real', 'initial-fallback');
  }

  return null;
}
