import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/services/accountEnvironmentSession.ts'),
  'utf8',
);

test('account environment refresh uses the singular active-broker account route and Bearer client', () => {
  assert.match(source, /import \{ getAccountByIdResult \} from '\.\.\/api\/accounts'/);
  assert.match(source, /await getAccountByIdResult\(provenance\.identity\.accountLogin\)/);
  assert.match(source, /commitActiveAccountEnvironmentPayload\(raw, provenance, refreshToken\)/);
  assert.doesNotMatch(source, /GroupList|GroupGet|balance|leverage|currency/);
});

test('account environment commits are scoped, ordered, and unknown preserving', () => {
  assert.match(source, /isActiveBrokerSessionProvenanceCurrent\(expectedProvenance\)/);
  assert.match(source, /payloadAccountLogin !== cleanIdentityPart\(expectedProvenance\.identity\.accountLogin\)/);
  assert.match(source, /accountEnvironmentRefreshOrder\.isCurrent\(/);
  assert.match(source, /const environmentEvidence = resolveAccountEnvironment\(record, true\)/);
  assert.match(source, /if \(resolved === 'unknown'\) \{\s*return \{ status: 'unknown' \};\s*\}/);
  assert.match(
    source,
    /mergeAccountEnvironmentForAccount\(\s*accountKey,\s*resolved,\s*environmentEvidence\.source/,
  );
  assert.match(source, /readRawAccountLogin\(record\)/);
  assert.doesNotMatch(source, /resolved === 'demo' \? true : false/);
});

test('recognized account evidence updates only the matching saved account metadata', () => {
  assert.match(
    source,
    /buildAccountEnvironmentKey\(account\.brokerId, account\.login\) === accountKey/,
  );
  assert.match(source, /accountEnvironmentSource: environmentEvidence\.source/);
  assert.match(source, /readRawAccountGroup\(record\)/);
});
