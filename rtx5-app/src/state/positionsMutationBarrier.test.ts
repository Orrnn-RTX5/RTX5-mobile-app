import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  beginProtectedPositionsMutation,
  canCommitUncoordinatedPositionsRead,
  capturePositionsMutationBarrier,
  hasProtectedPositionsMutation,
  resetPositionsMutationBarrierForTests,
} from './positionsMutationBarrier';

beforeEach(() => {
  resetPositionsMutationBarrierForTests();
});

test('reads captured before or during a protected mutation stay stale after release', () => {
  const beforeMutation = capturePositionsMutationBarrier();
  assert.equal(canCommitUncoordinatedPositionsRead(beforeMutation), true);

  const release = beginProtectedPositionsMutation();
  assert.equal(hasProtectedPositionsMutation(), true);
  assert.equal(canCommitUncoordinatedPositionsRead(beforeMutation), false);

  const duringMutation = capturePositionsMutationBarrier();
  assert.equal(canCommitUncoordinatedPositionsRead(duringMutation), false);

  release();
  assert.equal(hasProtectedPositionsMutation(), false);
  assert.equal(canCommitUncoordinatedPositionsRead(beforeMutation), false);
  assert.equal(canCommitUncoordinatedPositionsRead(duringMutation), false);

  const afterMutation = capturePositionsMutationBarrier();
  assert.equal(canCommitUncoordinatedPositionsRead(afterMutation), true);

  release();
  assert.equal(
    canCommitUncoordinatedPositionsRead(afterMutation),
    true,
    'release must be idempotent',
  );
});

test('nested protected mutations keep the barrier closed until every job releases', () => {
  const releaseFirst = beginProtectedPositionsMutation();
  const afterFirstBegin = capturePositionsMutationBarrier();
  const releaseSecond = beginProtectedPositionsMutation();
  const afterSecondBegin = capturePositionsMutationBarrier();

  assert.equal(hasProtectedPositionsMutation(), true);
  assert.equal(canCommitUncoordinatedPositionsRead(afterFirstBegin), false);
  assert.equal(canCommitUncoordinatedPositionsRead(afterSecondBegin), false);

  releaseFirst();
  assert.equal(hasProtectedPositionsMutation(), true);
  assert.equal(
    canCommitUncoordinatedPositionsRead(capturePositionsMutationBarrier()),
    false,
  );

  releaseSecond();
  assert.equal(hasProtectedPositionsMutation(), false);
  assert.equal(canCommitUncoordinatedPositionsRead(afterFirstBegin), false);
  assert.equal(canCommitUncoordinatedPositionsRead(afterSecondBegin), false);
  assert.equal(
    canCommitUncoordinatedPositionsRead(capturePositionsMutationBarrier()),
    true,
  );
});
