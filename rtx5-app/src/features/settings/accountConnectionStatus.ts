import type { UserPreferencesState } from '../../state/userPreferences/types';

type AccountDetails = UserPreferencesState['accountDetails'];

export function hasAuthenticatedAccountSession(
  isLoggedIn: boolean,
  accountDetails: AccountDetails,
): boolean {
  // A saved account is not enough for the green Connected badge.
  // Show it only after a real login session gives us both login id and token.
  const accountId = accountDetails?.id?.trim();
  const accessToken = accountDetails?.credentials?.accessToken?.trim();

  return isLoggedIn && Boolean(accountId && accessToken);
}
