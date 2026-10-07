export type PositionsMutationBarrierSnapshot = Readonly<{
  generation: number;
}>;

let generation = 0;
let activeProtectedMutations = 0;

/**
 * Prevents an unrelated positions poll that started before/during a protected
 * mutation from committing after the coordinator's eligible reconciliation.
 */
export const beginProtectedPositionsMutation = (): (() => void) => {
  generation += 1;
  activeProtectedMutations += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeProtectedMutations = Math.max(0, activeProtectedMutations - 1);
    generation += 1;
  };
};

export const capturePositionsMutationBarrier = (): PositionsMutationBarrierSnapshot =>
  Object.freeze({ generation });

export const canCommitUncoordinatedPositionsRead = (
  snapshot: PositionsMutationBarrierSnapshot,
): boolean => (
  activeProtectedMutations === 0 &&
  snapshot.generation === generation
);

export const hasProtectedPositionsMutation = (): boolean =>
  activeProtectedMutations > 0;

export const resetPositionsMutationBarrierForTests = (): void => {
  generation = 0;
  activeProtectedMutations = 0;
};
