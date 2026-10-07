import {
  resolveAccountEnvironment,
  type AccountEnvironment,
  type AccountEnvironmentSource,
  type BackendAccountEnvironmentSource,
} from '../../../domain/accountType';

// Presentation only: backend type/group evidence supplies the environment.
export const SETTINGS_ACCOUNT_ENVIRONMENT_BADGES = {
  demo: { label: 'Demo', color: '#4ADE80', backgroundColor: '#143D28' },
  real: { label: 'Real', color: '#FACC15', backgroundColor: '#45380B' },
  contest: { label: 'Contest', color: '#60A5FA', backgroundColor: '#162C51' },
  unknown: { label: 'Undefined', color: '#D1D5DB', backgroundColor: '#303030' },
} as const satisfies Record<AccountEnvironment, {
  label: string;
  color: string;
  backgroundColor: string;
}>;

export function resolveSettingsAccountEnvironment(
  account: {
    accountEnvironment: AccountEnvironment;
    accountEnvironmentSource: BackendAccountEnvironmentSource;
  } | undefined,
  session: { accountType: AccountEnvironment; source: AccountEnvironmentSource },
): AccountEnvironment {
  // A supplied but unrecognized group must show Undefined even if the session
  // previously classified this account. A response without evidence can still
  // retain verified session data while account details load or refresh.
  if (account && (
    account.accountEnvironment !== 'unknown'
    || account.accountEnvironmentSource === 'backend-group'
  )) {
    return account.accountEnvironment;
  }
  return session.source === 'backend-explicit' || session.source === 'backend-group'
    ? session.accountType
    : 'unknown';
}

export function resolveSavedAccountEnvironmentForDisplay(account: {
  accountType: AccountEnvironment;
  accountEnvironmentSource: AccountEnvironmentSource;
  rawGroup?: string;
}): AccountEnvironment {
  // Explicit backend types outrank groups. Reclassify saved group evidence
  // so entries written by the old "any group is Real" rule show Undefined.
  if (account.accountEnvironmentSource === 'backend-explicit'
    && account.accountType !== 'unknown') {
    return account.accountType;
  }
  if (account.rawGroup?.trim()) {
    return resolveAccountEnvironment({ group: account.rawGroup });
  }
  return resolveSettingsAccountEnvironment(undefined, {
    accountType: account.accountType,
    source: account.accountEnvironmentSource,
  });
}
