import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAccountEnvironmentKey,
  mergeAccountEnvironment,
  readRawAccountGroup,
  resolveAccountEnvironment,
  resolveLotType,
  type AccountEnvironment,
  type AccountEnvironmentSource,
  type AccountEnvironmentState,
} from './accountType';

type ResolverCase = Readonly<{
  name: string;
  payload: unknown;
  expected: AccountEnvironment;
}>;

const resolverCases: ResolverCase[] = [
  { name: 'snake-case account type Demo', payload: { account_type: 'demo' }, expected: 'demo' },
  {
    name: 'camel-case account type trims and matches case-insensitively',
    payload: { accountType: '  DeMo_Standard  ' },
    expected: 'demo',
  },
  { name: 'type Real', payload: { type: 'REAL' }, expected: 'real' },
  { name: 'kind Live', payload: { kind: 'live' }, expected: 'real' },
  { name: 'kind Tournament', payload: { kind: 'Tournament' }, expected: 'contest' },
  { name: 'JSON is_demo true', payload: { is_demo: true }, expected: 'demo' },
  { name: 'JSON isDemo false', payload: { isDemo: false }, expected: 'real' },
  {
    name: 'unrecognized lot type does not block Demo boolean',
    payload: { account_type: 'standard', is_demo: true },
    expected: 'demo',
  },
  {
    name: 'recognized higher-priority Real wins over Demo boolean and group',
    payload: { account_type: 'real', is_demo: true, group: 'demo_standard' },
    expected: 'real',
  },
  {
    name: 'explicit false Demo boolean wins over Demo group',
    payload: { is_demo: false, group: 'demo_standard' },
    expected: 'real',
  },
  {
    name: 'blank high-priority text does not block Demo group',
    payload: { account_type: '   ', group: 'DEMO_STANDARD' },
    expected: 'demo',
  },
  { name: 'missing aliases', payload: {}, expected: 'unknown' },
  {
    name: 'null and blank aliases',
    payload: { account_type: null, is_demo: null, group: ' ' },
    expected: 'unknown',
  },
  {
    name: 'string false is not a JSON boolean',
    payload: { is_demo: 'false' },
    expected: 'unknown',
  },
  {
    name: 'string zero is not a JSON boolean',
    payload: { is_demo: '0' },
    expected: 'unknown',
  },
  {
    name: 'array and object aliases are ignored',
    payload: {
      account_type: ['demo'],
      accountType: { value: 'real' },
      is_demo: { value: true },
      group: ['demo_standard'],
    },
    expected: 'unknown',
  },
  { name: 'null payload', payload: null, expected: 'unknown' },
  { name: 'array payload', payload: [{ group: 'demo_standard' }], expected: 'unknown' },
  { name: 'number payload', payload: 42, expected: 'unknown' },
  { name: 'string payload', payload: 'demo', expected: 'unknown' },
  {
    name: 'nested account payload',
    payload: { account: { account_group: 'demo_standard' } },
    expected: 'demo',
  },
  {
    name: 'nested user account payload',
    payload: { user: { account: { group: 'Demo\\STD' } } },
    expected: 'demo',
  },
  {
    name: 'unrecognized root value allows nested recognized evidence',
    payload: { account_type: 'cent', account: { isDemo: true } },
    expected: 'demo',
  },
  {
    name: 'root recognized evidence keeps legacy container priority',
    payload: { kind: 'live', account: { account_type: 'demo' } },
    expected: 'real',
  },
  {
    name: 'legacy account_kind alias remains supported',
    payload: { account_kind: 'competition' },
    expected: 'contest',
  },
  {
    name: 'legacy accountKind alias remains supported',
    payload: { accountKind: 'demo account' },
    expected: 'demo',
  },
  { name: 'legacy mode alias remains supported', payload: { mode: 'live' }, expected: 'real' },
  {
    name: 'legacy is_contest true remains supported',
    payload: { account: { is_contest: true } },
    expected: 'contest',
  },
  {
    name: 'legacy is_contest false does not prove Real',
    payload: { is_contest: false },
    expected: 'unknown',
  },
  { name: 'canonical Orrnn public Demo group', payload: { group: 'orrnn/demo-std' }, expected: 'demo' },
  {
    name: 'capital Group public Demo alias',
    payload: { Group: 'demo\\RTX5-Demo' },
    expected: 'demo',
  },
  { name: 'seeded Demo STD group', payload: { group: 'demo/STD' }, expected: 'demo' },
  { name: 'seeded Demo CENT group', payload: { group: 'demo/CENT' }, expected: 'demo' },
  { name: 'seeded Live STD group', payload: { group: 'live/STD' }, expected: 'real' },
  { name: 'seeded Live CENT group', payload: { group: 'live/CENT' }, expected: 'real' },
  { name: 'lot-only standard group does not identify an environment', payload: { group: 'standard' }, expected: 'unknown' },
  { name: 'unrecognized broker group does not imply Real', payload: { group: 'RTX5-Standard' }, expected: 'unknown' },
  { name: 'custom group has an undefined environment', payload: { group: 'VIP-2026' }, expected: 'unknown' },
  { name: 'explicit Real identifies an otherwise custom group', payload: { account_type: 'real', group: 'VIP-2026' }, expected: 'real' },
  {
    name: 'the first account group wins over a nested conflicting group',
    payload: { group: 'standard', account: { group: 'demo/STD' } },
    expected: 'unknown',
  },
  {
    name: 'Demo boolean is independent of standard lot type',
    payload: { demo: true, accountType: 'standard' },
    expected: 'demo',
  },
  {
    name: 'cent lot type does not block Live group',
    payload: { account_type: 'cent', group: 'live/CENT' },
    expected: 'real',
  },
  {
    name: 'direct login identity alone is Unknown',
    payload: { account_login: 200001, broker_id: 'orrnn' },
    expected: 'unknown',
  },
  { name: 'competition group is Contest', payload: { group: 'competition' }, expected: 'contest' },
];

test('resolveAccountEnvironment follows the explicit backend evidence matrix', async (t) => {
  for (const resolverCase of resolverCases) {
    await t.test(resolverCase.name, () => {
      assert.equal(resolveAccountEnvironment(resolverCase.payload), resolverCase.expected);
    });
  }
});

test('resolveAccountEnvironment never throws for malformed records and throwing getters', () => {
  const payload = Object.defineProperty({}, 'account_type', {
    get() {
      throw new Error('malformed getter');
    },
  });

  assert.doesNotThrow(() => resolveAccountEnvironment(payload));
  assert.equal(resolveAccountEnvironment(payload), 'unknown');

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  assert.doesNotThrow(() => resolveAccountEnvironment(revoked.proxy));
  assert.equal(resolveAccountEnvironment(revoked.proxy), 'unknown');
});

test('resolveAccountEnvironment reports accurate backend evidence source', () => {
  assert.deepEqual(
    resolveAccountEnvironment({ account_type: 'demo', group: 'live/STD' }, true),
    { accountType: 'demo', source: 'backend-explicit' },
  );
  assert.deepEqual(
    resolveAccountEnvironment({ account_type: 'cent', Group: ' demo\\RTX5-Demo ' }, true),
    { accountType: 'demo', source: 'backend-group' },
  );
  assert.deepEqual(
    resolveAccountEnvironment({ group: 'standard' }, true),
    { accountType: 'unknown', source: 'backend-group' },
  );
});

test('readRawAccountGroup preserves supported aliases and original text', () => {
  assert.equal(
    readRawAccountGroup({ user: { account_group: '  demo/STD  ' } }),
    '  demo/STD  ',
  );
  assert.equal(
    readRawAccountGroup({ user: { account: { accountGroup: 'live/CENT' } } }),
    'live/CENT',
  );
  assert.equal(readRawAccountGroup({ Group: 'demo\\RTX5-Demo' }), 'demo\\RTX5-Demo');
  assert.equal(readRawAccountGroup({ group: ' ' }), undefined);
});

test('resolveLotType is independent from account environment', () => {
  const cases: Array<Readonly<{ payload: unknown; expected: ReturnType<typeof resolveLotType> }>> = [
    { payload: { account_type: 'standard' }, expected: 'standard' },
    { payload: { accountType: 'CENT' }, expected: 'cent' },
    { payload: { lot_type: 'micro-account' }, expected: 'micro' },
    { payload: { lotType: '  standard  ' }, expected: 'standard' },
    { payload: { account_type: 'demo', group: 'demo/CENT' }, expected: 'unknown' },
    { payload: { account_type: 'cent', is_demo: true }, expected: 'cent' },
    { payload: null, expected: 'unknown' },
    { payload: [], expected: 'unknown' },
  ];

  for (const entry of cases) {
    assert.equal(resolveLotType(entry.payload), entry.expected);
  }
});

const state = (
  accountKey: string,
  accountType: AccountEnvironmentState['accountType'],
  accountEnvironmentSource: AccountEnvironmentSource,
): AccountEnvironmentState => ({
  accountKey,
  accountType,
  accountEnvironmentSource,
  isDemoAccount: accountType === 'demo',
});

test('mergeAccountEnvironment applies initial fallback only when explicitly allowed', () => {
  const accountKey = buildAccountEnvironmentKey('Broker-A', '1001');

  assert.equal(
    mergeAccountEnvironment(null, {
      accountKey,
      resolved: 'unknown',
      source: 'unknown',
    }),
    null,
  );

  assert.deepEqual(
    mergeAccountEnvironment(null, {
      accountKey,
      resolved: 'unknown',
      source: 'unknown',
      allowInitialFallback: true,
    }),
    state(accountKey, 'real', 'initial-fallback'),
  );
});

test('mergeAccountEnvironment preserves known state on Unknown refresh', () => {
  const accountKey = buildAccountEnvironmentKey('broker-a', 1001);

  for (const priorType of ['demo', 'real', 'contest'] as const) {
    const previous = state(accountKey, priorType, 'backend-group');
    const merged = mergeAccountEnvironment(previous, {
      accountKey,
      resolved: 'unknown',
      source: 'backend-group',
    });
    assert.equal(merged, previous);
  }
});

test('initial compatibility fallback never replaces known evidence for the same account', () => {
  const accountKey = buildAccountEnvironmentKey('broker-a', '1001');
  const knownDemo = state(accountKey, 'demo', 'backend-group');

  const merged = mergeAccountEnvironment(knownDemo, {
    accountKey,
    resolved: 'real',
    source: 'initial-fallback',
  });

  assert.equal(merged, knownDemo);
});

test('mergeAccountEnvironment allows fresh known evidence to replace prior evidence atomically', () => {
  const accountKey = buildAccountEnvironmentKey('broker-a', 1001);
  const transitions: Array<Readonly<{
    previous: AccountEnvironmentState;
    resolved: Exclude<AccountEnvironment, 'unknown'>;
    expectedSource: AccountEnvironmentSource;
  }>> = [
    {
      previous: state(accountKey, 'demo', 'demo-registration'),
      resolved: 'real',
      expectedSource: 'backend-explicit',
    },
    {
      previous: state(accountKey, 'real', 'initial-fallback'),
      resolved: 'demo',
      expectedSource: 'backend-group',
    },
    {
      previous: state(accountKey, 'demo', 'demo-registration'),
      resolved: 'contest',
      expectedSource: 'backend-group',
    },
  ];

  for (const transition of transitions) {
    const merged = mergeAccountEnvironment(transition.previous, {
      accountKey,
      resolved: transition.resolved,
      source: transition.expectedSource,
    });
    assert.deepEqual(
      merged,
      state(accountKey, transition.resolved, transition.expectedSource),
    );
    assert.equal(merged?.isDemoAccount, transition.resolved === 'demo');
  }
});

test('recognized Live group corrects a stale Demo registration seed', () => {
  const accountKey = buildAccountEnvironmentKey('orrnn-demo', 200001);
  const seeded = mergeAccountEnvironment(null, {
    accountKey,
    resolved: 'demo',
    source: 'demo-registration',
  });
  assert.ok(seeded);

  const refreshed = mergeAccountEnvironment(seeded, {
    accountKey,
    resolved: resolveAccountEnvironment({ group: 'live/standard' }),
    source: 'backend-group',
  });
  assert.equal(refreshed?.accountType, 'real');
  assert.equal(refreshed?.accountEnvironmentSource, 'backend-group');
  assert.equal(refreshed?.isDemoAccount, false);
});

test('account switch never inherits the previous account environment', () => {
  const accountA = buildAccountEnvironmentKey('broker-a', 1001);
  const accountB = buildAccountEnvironmentKey('broker-b', 1001);
  const previousA = state(accountA, 'demo', 'backend-group');

  const unknownB = mergeAccountEnvironment(previousA, {
    accountKey: accountB,
    resolved: 'unknown',
    source: 'unknown',
  });
  assert.equal(unknownB, previousA);

  const fallbackB = mergeAccountEnvironment(previousA, {
    accountKey: accountB,
    resolved: 'unknown',
    source: 'unknown',
    allowInitialFallback: true,
  });
  assert.deepEqual(fallbackB, state(accountB, 'real', 'initial-fallback'));

  const lateA = mergeAccountEnvironment(fallbackB, {
    accountKey: accountA,
    resolved: 'demo',
    source: 'backend-group',
  });
  assert.equal(lateA, fallbackB);

  const explicitSwitchToA = mergeAccountEnvironment(fallbackB, {
    accountKey: accountA,
    resolved: 'demo',
    source: 'backend-explicit',
    allowInitialFallback: true,
  });
  assert.deepEqual(explicitSwitchToA, state(accountA, 'demo', 'backend-explicit'));
});

test('buildAccountEnvironmentKey scopes repeated login numbers by normalized broker identity', () => {
  assert.equal(
    buildAccountEnvironmentKey(' Broker-A ', ' 1001 '),
    buildAccountEnvironmentKey('broker-a', 1001),
  );
  assert.notEqual(
    buildAccountEnvironmentKey('broker-a', 1001),
    buildAccountEnvironmentKey('broker-b', 1001),
  );
});
