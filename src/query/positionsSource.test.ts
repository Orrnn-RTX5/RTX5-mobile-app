import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/query/positions.ts'), 'utf8');

test('positions query mapper preserves swap and commission separately from net pnl', () => {
  const positionsSource = source();

  assert.match(positionsSource, /pnl: dto\.profit \+ \(dto\.swap \|\| 0\) \+ \(dto\.commission \|\| 0\)/);
  assert.match(positionsSource, /swap: dto\.swap \|\| 0/);
  assert.match(positionsSource, /commission: dto\.commission \|\| 0/);
});

test('position history supports an isolated bounded Journal cache and time-window ranges', () => {
  const positionsSource = source();

  assert.match(
    positionsSource,
    /export const getPositionHistoryQueryKey = \([\s\S]*pageLimit\?: number[\s\S]*maxPages\?: number[\s\S]*from\?: number[\s\S]*to\?: number[\s\S]*pageLimit \?\? null,\s*maxPages \?\? null,\s*from \?\? null,\s*to \?\? null/,
  );
  // Contract v3 6.4: the history endpoint ignores limit/offset, so maxPages
  // bounds the number of from/to windows and pageLimit is never sent.
  assert.match(
    positionsSource,
    /positionsApi\.getPositionHistory\(login!, \{[\s\S]*maxWindows: options\.maxPages,[\s\S]*from: options\.from,[\s\S]*to: options\.to,/,
  );
});

test('open positions are fetched without paging', () => {
  assert.match(source(), /positionsApi\.getPositions\(login!\)/);
});
