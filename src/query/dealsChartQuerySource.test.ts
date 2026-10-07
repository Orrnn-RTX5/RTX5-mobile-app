import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/query/deals.ts'), 'utf8');

const sliceBetween = (start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
};

test('chart deals use an unfiltered, broker-session-scoped accountDeals cache entry', () => {
  assert.match(
    source,
    /getChartDealsQueryKey[\s\S]*\[ACCOUNT_DEALS_KEY, cacheNamespace, login \?\? 'session', 'chart-unfiltered'\] as const/,
  );

  const hook = sliceBetween('export function useChartDealsQuery', 'export function useDealsQuery');
  assert.match(hook, /useActiveBrokerQuerySession\(\)/);
  assert.match(hook, /getSessionQueryCacheNamespace\(session\)/);
  assert.match(hook, /runSessionBoundQuery\(\s*cacheNamespace,/);
  assert.match(hook, /fetchAccountDealsWithLoginFallback\(login\)/);
  assert.match(hook, /resolvePollingRefetchInterval\(enabled, 5_000, options\.refetchInterval\)/);
  assert.doesNotMatch(hook, /useUserPreferences|resolveEffectiveHistoryDateRange|options\.(?:from|to)/);
});

test('deals use paged /account/deals first and /deals/{login} only as a fallback', () => {
  // Contract v3 6.4: /account/deals is the primary source (offset paging,
  // 1000 rows per page); /deals/{login} ignores paging and has no
  // position_ticket, so the two are no longer merged.
  const fetcher = sliceBetween(
    'const fetchAccountDealsWithLoginFallback',
    'export function useAccountDealsQuery',
  );

  assert.match(fetcher, /await fetchAllAccountDeals\(\{ from, to \}\)/);
  assert.match(fetcher, /catch \(accountError\)[\s\S]*getLoginDealsWithRangeFallback\(login, from, to\)/);
  assert.doesNotMatch(fetcher, /Promise\.all\(|mergeDealHistorySources\(/);

  const journalHook = sliceBetween('export function useDealsQuery', '\n}\n');
  assert.match(journalHook, /fetchAccountDealsWithLoginFallback\(login, from, to\)/);
});
