export type BrokerSessionCommitAuthorization = Readonly<{
  attemptId: number;
  startingSessionEpoch: number;
}>;

export class StaleBrokerSessionCommitError extends Error {
  public readonly code = 'STALE_BROKER_SESSION_COMMIT';

  constructor() {
    super('A newer broker session action replaced this sign-in attempt.');
    this.name = 'StaleBrokerSessionCommitError';
  }
}

let authorizationSequence = 0;
let activeAuthorizationId = 0;

/**
 * Authorizes one user-initiated login/switch operation without changing the
 * currently authenticated route. Issuing a newer authorization immediately
 * makes earlier pending auth responses ineligible to commit.
 */
export const issueBrokerSessionCommitAuthorization = (
  startingSessionEpoch: number,
): BrokerSessionCommitAuthorization => {
  authorizationSequence += 1;
  activeAuthorizationId = authorizationSequence;
  return Object.freeze({
    attemptId: activeAuthorizationId,
    startingSessionEpoch,
  });
};

/** Cancels a still-pending authorization, for example when its screen unmounts. */
export const cancelBrokerSessionCommitAuthorization = (
  authorization: BrokerSessionCommitAuthorization | null | undefined,
): void => {
  if (!authorization || authorization.attemptId !== activeAuthorizationId) {
    return;
  }
  authorizationSequence += 1;
  activeAuthorizationId = authorizationSequence;
};

/**
 * Consumes an authorization at coordinator execution time. Both the newest
 * user attempt and the session generation that existed when it started must
 * still match. A successful consume is one-shot.
 */
export const consumeBrokerSessionCommitAuthorization = (
  authorization: BrokerSessionCommitAuthorization,
  currentSessionEpoch: number,
): void => {
  if (
    authorization.attemptId !== activeAuthorizationId ||
    authorization.startingSessionEpoch !== currentSessionEpoch
  ) {
    throw new StaleBrokerSessionCommitError();
  }

  authorizationSequence += 1;
  activeAuthorizationId = authorizationSequence;
};

export const isStaleBrokerSessionCommitError = (
  error: unknown,
): error is StaleBrokerSessionCommitError =>
  error instanceof StaleBrokerSessionCommitError ||
  (
    Boolean(error) &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'STALE_BROKER_SESSION_COMMIT'
  );

export const __resetBrokerSessionCommitAuthorizationForTests = (): void => {
  authorizationSequence = 0;
  activeAuthorizationId = 0;
};
