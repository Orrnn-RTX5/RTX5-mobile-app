/**
 * Investor (read-only) sessions: login with `login_type:"investor"`, or a
 * refresh/me response with `investor:true`. Every non-GET call returns
 * `403 INVESTOR_READ_ONLY`, so trading buttons must be hidden.
 *
 * Kept dependency-free so auth/refresh code can use it without import cycles.
 */
export function isInvestorReadOnlySession(
  payload: Readonly<{ login_type?: unknown; loginType?: unknown; investor?: unknown }> | null | undefined,
): boolean {
  if (!payload) return false;
  if (payload.investor === true) return true;
  const loginType = String(payload.login_type ?? payload.loginType ?? '').trim().toLowerCase();
  return loginType === 'investor';
}

/**
 * Reads an explicit investor verdict from a refresh/me response. Returns
 * undefined when the payload carries neither `investor` nor `login_type`, so a
 * caller keeps the flag it already has.
 */
export function readInvestorSessionFlag(payload: unknown): boolean | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const root = payload as Record<string, unknown>;
  if (typeof root.investor === 'boolean') return root.investor;
  const loginType = root.login_type ?? root.loginType;
  if (typeof loginType === 'string' && loginType.trim()) {
    return isInvestorReadOnlySession(root);
  }
  return undefined;
}
