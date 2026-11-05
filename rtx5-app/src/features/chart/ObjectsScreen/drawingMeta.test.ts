import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('add object menu exposes important drawing tools', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/chart/ObjectsScreen/drawingMeta.ts'), 'utf8');
  const addObjectTools = source.slice(
    source.indexOf('export const ADD_OBJECT_TOOLS'),
    source.indexOf('export function buildLegacyDrawingDescription'),
  );

  assert.match(addObjectTools, /'brush'/);
  assert.match(addObjectTools, /'text'/);
  assert.match(addObjectTools, /'patterns'/);
  assert.match(addObjectTools, /'pitchfork'/);
  assert.match(addObjectTools, /'smiley'/);
});
