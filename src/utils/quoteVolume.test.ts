import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeQuoteVolume, resolveBackendQuoteVolume } from './quoteVolume';

test('normalizeQuoteVolume accepts non-negative numeric backend volume', () => {
  assert.equal(normalizeQuoteVolume(0), 0);
  assert.equal(normalizeQuoteVolume('1234'), 1234);
});

test('normalizeQuoteVolume rejects negative or non-finite volume', () => {
  assert.equal(normalizeQuoteVolume(-1), undefined);
  assert.equal(normalizeQuoteVolume(Number.NaN), undefined);
  assert.equal(normalizeQuoteVolume(''), undefined);
});

test('resolveBackendQuoteVolume carries only previously backend-sourced volume', () => {
  assert.equal(resolveBackendQuoteVolume({ incoming: undefined, previous: { volume: 4407 } }), undefined);
  assert.equal(
    resolveBackendQuoteVolume({
      incoming: undefined,
      previous: { volume: 4407, volumeSource: 'backend' },
    }),
    4407,
  );
});
