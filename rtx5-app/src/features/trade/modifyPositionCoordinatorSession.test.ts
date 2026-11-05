import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildModifyPositionSessionKey,
  handleModifyPositionSessionEvent,
  shouldResetModifyPositionCoordinator,
} from './modifyPositionSessionKey.ts';
import { ModifyPositionCoordinatorCore } from './modifyPositionCoordinatorCore';

const baseSession = Object.freeze({
  brokerId: 'achiever',
  apiBase: 'https://broker.example/api/v2',
  accountLogin: '14001',
  cacheNamespace: 'achiever:14001:runtime:7',
  sessionEpoch: 7,
});

test('modify-position ownership survives a credential refresh in the same session', () => {
  const beforeRefresh = buildModifyPositionSessionKey(baseSession);
  const afterRefresh = buildModifyPositionSessionKey({ ...baseSession });

  assert.equal(afterRefresh, beforeRefresh);
  assert.equal(shouldResetModifyPositionCoordinator('credentials_updated'), false);
  assert.equal(shouldResetModifyPositionCoordinator('activated'), false);
});

test('modify-position ownership changes at every real session boundary', () => {
  const current = buildModifyPositionSessionKey(baseSession);

  assert.notEqual(
    buildModifyPositionSessionKey({ ...baseSession, brokerId: 'other-broker' }),
    current,
  );
  assert.notEqual(
    buildModifyPositionSessionKey({ ...baseSession, accountLogin: '14002' }),
    current,
  );
  assert.notEqual(
    buildModifyPositionSessionKey({ ...baseSession, apiBase: 'https://other.example/api/v2' }),
    current,
  );
  assert.notEqual(
    buildModifyPositionSessionKey({ ...baseSession, cacheNamespace: 'achiever:14001:runtime:8' }),
    current,
  );
  assert.notEqual(
    buildModifyPositionSessionKey({ ...baseSession, sessionEpoch: 8 }),
    current,
  );
  assert.equal(shouldResetModifyPositionCoordinator('transition'), true);
});

test('credential refresh does not cancel an in-flight modify reconciliation', async () => {
  let releaseModify!: () => void;
  const modifyGate = new Promise<void>((resolve) => {
    releaseModify = resolve;
  });
  let reconciliationReads = 0;
  const core = new ModifyPositionCoordinatorCore({
    modify: () => modifyGate,
    readPositions: async (input) => {
      reconciliationReads += 1;
      return [{
        ticket: input.ticket,
        symbol: input.symbol,
        price_sl: input.request.price_sl,
        price_tp: input.request.price_tp,
      }];
    },
    commitPosition: () => {},
    isSessionCurrent: () => true,
  });
  const resultPromise = core.submit(Object.freeze({
    ticket: 701,
    symbol: 'EURUSD',
    accountLogin: 900001,
    sessionKey: buildModifyPositionSessionKey(baseSession),
    request: Object.freeze({ price_sl: 1.08, price_tp: 1.12 }),
  }));

  handleModifyPositionSessionEvent(
    'credentials_updated',
    () => core.resetSession(),
  );
  releaseModify();

  assert.equal((await resultPromise).status, 'saved');
  assert.equal(reconciliationReads, 1);
});
