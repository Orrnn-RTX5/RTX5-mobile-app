/** Proof used only to skip redundant logout when selecting another guest broker. */
export function createGuestSessionReadiness() {
  let secureAuthorityEmpty = false;
  let pendingMutations = 0;
  return {
    beginMutation() {
      pendingMutations += 1;
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        pendingMutations -= 1;
      };
    },
    markSecureAuthorityEmpty() { secureAuthorityEmpty = true; },
    markSecureAuthorityPresent() { secureAuthorityEmpty = false; },
    tryPrepare(input: { hasActiveSession: boolean; hasAuthenticatedPreferences: boolean; invalidate: () => void }) {
      if (!secureAuthorityEmpty || pendingMutations !== 0 || input.hasActiveSession || input.hasAuthenticatedPreferences) return false;
      // Invalidates even an unqueued login authorized while already logged out.
      input.invalidate();
      return true;
    },
  };
}
