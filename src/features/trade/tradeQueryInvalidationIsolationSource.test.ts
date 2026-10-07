import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readTradeSource = (name: string) => readFileSync(
  resolve(process.cwd(), 'src/features/trade', name),
  'utf8',
);

test('trade completions invalidate only their captured broker/account/epoch namespace', () => {
  const files = [
    'OrderTicketScreen.tsx',
    'ClosePositionScreen.tsx',
    'BulkOperationScreen.tsx',
    'closePositionFlow.ts',
  ];

  for (const file of files) {
    const source = readTradeSource(file);
    assert.match(source, /captureActiveBrokerSession(?:Provenance)?\(/, file);
    assert.match(source, /isActiveBrokerSessionProvenanceCurrent\(/, file);
    assert.match(source, /invalidateSessionQueryRoots\(/, file);
    assert.doesNotMatch(source, /\.invalidateQueries\(/, file);
  }

  const modifyScreenSource = readTradeSource('ModifyPositionScreen.tsx');
  const modifyCoordinatorSource = readTradeSource('modifyPositionCoordinator.ts');
  const modifySessionKeySource = readTradeSource('modifyPositionSessionKey.ts');
  assert.match(modifyScreenSource, /submitModifyPosition\(\{/);
  assert.match(modifyScreenSource, /captureModifyPositionSessionKey\(\)/);
  assert.match(modifyScreenSource, /isModifyPositionSessionKeyCurrent\(/);
  assert.doesNotMatch(
    modifyScreenSource,
    /invalidateSessionQueryRoots|\.invalidateQueries\(|positionsApi\.modifyPosition/,
  );
  assert.match(modifyCoordinatorSource, /captureActiveBrokerSession\(\)/);
  assert.match(modifyCoordinatorSource, /buildModifyPositionSessionKey\(capture\.session\)/);
  assert.match(modifySessionKeySource, /session\.cacheNamespace/);
  assert.match(modifySessionKeySource, /session\.apiBase/);
  assert.match(modifyCoordinatorSource, /handleModifyPositionSessionEvent\(event\.type/);
  assert.match(modifySessionKeySource, /eventType === 'transition'/);
  assert.doesNotMatch(modifySessionKeySource, /eventType === 'credentials_updated'/);
  assert.doesNotMatch(
    `${modifyCoordinatorSource}\n${modifySessionKeySource}`,
    /credentialGeneration|credentialIdentity/,
  );
  assert.match(modifyCoordinatorSource, /positionsApi\.getPositionsForReconciliation/);
  assert.match(
    modifyCoordinatorSource,
    /modify: \(input, signal\)[\s\S]*positionsApi\.modifyPosition\([\s\S]*signal,[\s\S]*timeoutMs: MODIFY_POSITION_REQUEST_TIMEOUT_MS/,
  );
  assert.match(
    modifyCoordinatorSource,
    /readPositions: async \(input, signal\)[\s\S]*getPositionsForReconciliation\([\s\S]*signal,[\s\S]*timeoutMs: MODIFY_POSITION_RECONCILIATION_TIMEOUT_MS/,
  );
  assert.match(modifyCoordinatorSource, /mutationTimeoutMs: MODIFY_POSITION_REQUEST_TIMEOUT_MS/);
  assert.match(
    modifyCoordinatorSource,
    /reconciliationTimeoutMs: MODIFY_POSITION_RECONCILIATION_TIMEOUT_MS/,
  );

  const unsupportedCloseBy = readTradeSource('CloseByScreen.tsx');
  assert.match(unsupportedCloseBy, /Close By is unavailable for this API contract/);
  assert.doesNotMatch(
    unsupportedCloseBy,
    /captureActiveBrokerSession|invalidateSessionQueryRoots|positionsApi|beginOptimisticClose/,
  );
});
