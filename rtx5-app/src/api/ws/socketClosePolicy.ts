const AUTH_FAILURE_CLOSE_CODES = new Set([1008, 4001, 4401, 4403]);

/** Authentication close codes require refreshed credentials or a new login. */
export const isSocketAuthenticationFailure = (code: unknown): boolean =>
  typeof code === 'number' && AUTH_FAILURE_CLOSE_CODES.has(code);
