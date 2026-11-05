/**
 * Contract v3: the trader's account is the session `account_login`; read it
 * with `GET /account/{login}`. `GET /accounts` returns 403 for traders and
 * must not be called, so no list path is exported.
 */
export function buildAccountDetailPath(login: number | string): string {
  return `/account/${encodeURIComponent(String(login))}`;
}
