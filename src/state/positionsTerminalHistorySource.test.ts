import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/state/positionsState.ts'), 'utf8');

test('an unseen terminal position invalidates history before open-row lookup', () => {
  const upsertSource = source.slice(
    source.indexOf('  upsertPosition: (dto: any) => {'),
    source.indexOf(
      '  hydrateCachedPositions:',
      source.indexOf('  upsertPosition: (dto: any) => {'),
    ),
  );

  assert.match(
    upsertSource,
    /if \(isTerminalPositionUpdate\(dto\)\) \{[\s\S]*invalidateCurrentSessionQueryRoots\(appQueryClient, \[[\s\S]*'positionHistory'[\s\S]*const existing = findExistingPosition\(state\.positions, dto\);[\s\S]*if \(!existing\) \{\s*return \{\};/,
  );
});

test('a terminal tombstone prevents an older REST positions response from resurrecting its ticket', () => {
  const removeStart = source.indexOf('  removePosition: (positionId) =>');
  const removeEnd = source.indexOf('  beginOptimisticClose:', removeStart);
  const finishStart = source.indexOf('  finishOptimisticClose: (positionId) => {');
  const finishEnd = source.indexOf('  rollbackOptimisticClose:', finishStart);
  const reconcileStart = source.indexOf(
    '  applyPositionReconciliation: (positionId, dto, accountLogin) =>',
  );
  const reconcileEnd = source.indexOf('  upsertPosition:', reconcileStart);
  const refreshStart = source.indexOf('  refreshPositions: async (accountLogin: string) => {');
  const refreshEnd = source.indexOf('\n}));', refreshStart);

  assert.notEqual(removeStart, -1);
  assert.notEqual(removeEnd, -1);
  assert.notEqual(finishStart, -1);
  assert.notEqual(finishEnd, -1);
  assert.notEqual(reconcileStart, -1);
  assert.notEqual(reconcileEnd, -1);
  assert.notEqual(refreshStart, -1);
  assert.notEqual(refreshEnd, -1);

  const removeSource = source.slice(removeStart, removeEnd);
  const finishSource = source.slice(finishStart, finishEnd);
  const reconcileSource = source.slice(reconcileStart, reconcileEnd);
  const refreshSource = source.slice(refreshStart, refreshEnd);
  assert.match(
    removeSource,
    /state\.positions\.filter\(\(position\) => String\(position\.id\) !== String\(positionId\)\)/,
  );
  assert.match(
    finishSource,
    /markPositionOptimisticallyClosing\(positionId\)[\s\S]*get\(\)\.removePosition\(positionId\)/,
  );
  assert.match(
    reconcileSource,
    /if \(isPositionOptimisticallyClosing\(targetId\)\) \{\s*return \{\};\s*\}/,
  );
  assert.match(
    refreshSource,
    /const nextPositions = withoutOptimisticallyClosingPositions\(\s*buildMergedPositions\(latestState\.positions, positionsArray\),\s*\)/,
  );
});
