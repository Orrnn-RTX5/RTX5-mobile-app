import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readQueryModule = (name: string) =>
  readFileSync(resolve(process.cwd(), 'src', 'query', `${name}.ts`), 'utf8');

const assertUsesActiveSessionScope = (source: string) => {
  assert.match(source, /useActiveBrokerQuerySession\(\)/);
  assert.match(source, /getSessionQueryCacheNamespace\(session\)/);
  assert.match(source, /Boolean\(session\)/);
  assert.match(source, /runSessionBoundQuery\(/);
};

test('authenticated polling queries key every request by the active cache namespace', () => {
  const cases = [
    {
      name: 'alerts',
      key: /\[ALERTS_KEY, cacheNamespace\] as const/,
    },
    {
      name: 'watchlist',
      key: /\[WATCHLIST_KEY, cacheNamespace\] as const/,
    },
    {
      name: 'equityHistory',
      key: /\[EQUITY_HISTORY_KEY, cacheNamespace, period\] as const/,
    },
    {
      name: 'transactions',
      key: /\[TRANSACTIONS_KEY, cacheNamespace, type, limit, page, from, to\] as const/,
    },
  ] as const;

  for (const { name, key } of cases) {
    const source = readQueryModule(name);
    assertUsesActiveSessionScope(source);
    assert.match(source, key);
    assert.doesNotMatch(source, /queryKey:\s*\[[A-Z_]+_KEY(?:,|\])/);
  }
});

test('alerts and watchlist mutations remain bound to their captured session namespace', () => {
  for (const name of ['alerts', 'watchlist']) {
    const source = readQueryModule(name);
    assert.match(source, /mutationFn:[\s\S]*runSessionBoundQuery\(/);
    assert.match(source, /invalidateSessionQueryRoots\(queryClient, cacheNamespace,/);
    assert.doesNotMatch(source, /queryClient\.invalidateQueries\(/);
  }
});

test('contract v3: /exposure and /api/mt5/* modules no longer exist', () => {
  for (const dir of ['query', 'api']) {
    for (const name of ['exposure', 'mt5', 'mt5Account']) {
      assert.equal(existsSync(resolve(process.cwd(), 'src', dir, `${name}.ts`)), false, `${dir}/${name}`);
    }
  }
});

test('no invalidation list names the removed exposure or accounts-list query roots', () => {
  for (const path of [
    'src/features/trade/BulkOperationScreen.tsx',
    'src/features/trade/ClosePositionScreen.tsx',
    'src/features/trade/OrderTicketScreen.tsx',
    'src/features/trade/closePositionFlow.ts',
    'src/query/positions.ts',
    'app/login.tsx',
    'app/register.tsx',
    'src/features/settings/BrokerDetailScreen.tsx',
  ]) {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    assert.doesNotMatch(source, /'exposure'|'accountsList'/, path);
  }
});

test('transactions and equity history are scoped to the session account login', () => {
  for (const name of ['transactions', 'equityHistory']) {
    const source = readQueryModule(name);
    assert.match(source, /const login = session\?\.accountLogin/);
    assert.match(source, /Boolean\(session\) && Boolean\(login\)/);
  }
});
