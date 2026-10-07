/**
 * Journal session scope: everything in the Journal (server rows, cache,
 * local trade rows, latency readout) belongs to one scope. It changes only
 * on a committed login/logout, account switch or broker/server switch, and
 * never contains tokens, so token rotation alone keeps the scope.
 */

export type JournalScopeSession = {
  accountLogin?: string | number | null;
  brokerId?: string | null;
  /** The broker REST base, e.g. `https://host/api/v2`. */
  apiBase?: string | null;
};

const normalizePart = (value: unknown): string =>
  String(value ?? '').trim().replace(/\/+$/, '').toLowerCase();

/** The broker backend origin, i.e. the REST base without its `/api/v2` suffix. */
export function journalServerUrlFromApiBase(apiBase: string | null | undefined): string {
  return normalizePart(apiBase).replace(/\/api\/v2$/, '');
}

export function buildJournalSessionScopeKey(session: JournalScopeSession | null | undefined): string {
  const authenticated = Boolean(session);
  return [
    authenticated ? 'authenticated' : 'anonymous',
    session?.accountLogin === undefined || session?.accountLogin === null ? '' : String(session.accountLogin).trim(),
    normalizePart(session?.brokerId),
    journalServerUrlFromApiBase(session?.apiBase),
  ].join('|');
}
