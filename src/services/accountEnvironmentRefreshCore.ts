export type AccountEnvironmentRefreshOrderToken = Readonly<{
  accountKey: string;
  ownerKey: string;
  generation: number;
}>;

export type AccountEnvironmentRefreshOrder = Readonly<{
  begin: (
    ownerKey: string,
    accountKey: string,
  ) => AccountEnvironmentRefreshOrderToken;
  isCurrent: (
    token: AccountEnvironmentRefreshOrderToken | undefined,
    expectedOwnerKey: string,
    expectedAccountKey: string,
  ) => boolean;
}>;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  try {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

const readExactIdentity = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
};

const readField = (
  record: Record<string, unknown> | null,
  key: string,
): unknown => {
  if (!record) return undefined;
  try {
    return record[key];
  } catch {
    return undefined;
  }
};

/**
 * Creates an isolated last-started-wins guard for account-environment refreshes.
 *
 * Starting work for another owner or account immediately makes the previous
 * token stale. The generation is monotonic across owner changes, and token
 * identity is checked, so switching A -> B -> A cannot revive A's first token.
 */
export function createAccountEnvironmentRefreshOrder():
  AccountEnvironmentRefreshOrder {
  let latestGeneration = 0;
  let currentToken: AccountEnvironmentRefreshOrderToken | null = null;

  return Object.freeze({
    begin(
      ownerKey: string,
      accountKey: string,
    ): AccountEnvironmentRefreshOrderToken {
      latestGeneration += 1;
      currentToken = Object.freeze({
        accountKey,
        ownerKey,
        generation: latestGeneration,
      });
      return currentToken;
    },

    isCurrent(
      token: AccountEnvironmentRefreshOrderToken | undefined,
      expectedOwnerKey: string,
      expectedAccountKey: string,
    ): boolean {
      return (
        token !== undefined &&
        token === currentToken &&
        token.ownerKey === expectedOwnerKey &&
        token.accountKey === expectedAccountKey
      );
    },
  });
}

/**
 * Reads the backend's raw account identity without parseInt/Number coercion.
 *
 * Alias priority is root, account, then data. Invalid or blank values are
 * skipped so a valid lower-priority alias can still establish identity.
 */
export function readRawAccountLogin(payload: unknown): string {
  const root = asRecord(payload);
  if (!root) return '';

  const containers = [
    root,
    asRecord(readField(root, 'account')),
    asRecord(readField(root, 'data')),
  ];

  for (const container of containers) {
    if (!container) continue;
    for (const alias of ['login', 'account_login', 'accountLogin'] as const) {
      const identity = readExactIdentity(readField(container, alias));
      if (identity) return identity;
    }
  }

  return '';
}
