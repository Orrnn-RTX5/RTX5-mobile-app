import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

test('position query retains its selected rows on unrelated renders and remaps changed data', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/query/positions.ts'), 'utf8');
  const exports: Record<string, any> = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports,
    require: (name: string) => {
      if (name === '@tanstack/react-query') return { useQuery: (options: unknown) => options };
      if (name === '../api/positions') return { positionsApi: {} };
      if (name === './authenticatedQueryScope') return {
        useActiveBrokerQuerySession: () => ({ cacheNamespace: 'session-a' }),
        getSessionQueryCacheNamespace: () => 'session-a',
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const queryClient = new QueryClient();
  const firstOptions = exports.usePositionsQuery(10001, { enabled: false });
  let mappedRows = 0;
  const row = {
    get ticket() { mappedRows += 1; return 101; },
    symbol: 'EURUSD.pro', side: 'buy', volume: 1, price_open: 1, price_current: 2,
    profit: 10, swap: -1, commission: -2, time_create: 1_700_000_000, price_sl: 0, price_tp: 0,
  };
  queryClient.setQueryData(firstOptions.queryKey, [row]);
  const observer = new QueryObserver(queryClient, firstOptions);
  try {
    const first = observer.getCurrentResult().data as any[];
    assert.equal(first[0].pnl, 7);
    const initialMappedRows = mappedRows;
    for (let render = 0; render < 100; render += 1) {
      observer.setOptions(exports.usePositionsQuery(10001, { enabled: false }));
      assert.strictEqual(observer.getCurrentResult().data, first);
    }
    assert.equal(mappedRows, initialMappedRows, 'stable query data must not be mapped again on parent renders');
    queryClient.setQueryData(firstOptions.queryKey, [{ ...row, profit: 20 }]);
    observer.setOptions(exports.usePositionsQuery(10001, { enabled: false }));
    const changed = observer.getCurrentResult().data as any[];
    assert.notStrictEqual(changed, first);
    assert.equal(changed[0].pnl, 17);
  } finally {
    observer.destroy();
    queryClient.clear();
  }
});
