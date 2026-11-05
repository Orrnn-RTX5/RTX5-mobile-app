import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldOpenJournalForEquityTransition } from './BlownAccountJournalNavigator';

test('the Journal opens only for a positive-to-nonpositive equity transition', () => {
  assert.equal(shouldOpenJournalForEquityTransition(100, 0), true);
  assert.equal(shouldOpenJournalForEquityTransition(100, -0.01), true);
  assert.equal(shouldOpenJournalForEquityTransition(undefined, 0), false);
  assert.equal(shouldOpenJournalForEquityTransition(0, -1), false);
  assert.equal(shouldOpenJournalForEquityTransition(-1, 100), false);
  assert.equal(shouldOpenJournalForEquityTransition(100, 99), false);
});
