import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { shouldShowInitialQuotesSkeleton } from './quoteInitialLoading';

const settledState = {
  quoteCatalogActive: true,
  quoteWatchlistActive: true,
  hasRenderableQuotes: false,
  catalogIsLoading: false,
  watchlistIsLoading: false,
} as const;

test('shows the Quotes skeleton for the initial catalog request', () => {
  assert.equal(
    shouldShowInitialQuotesSkeleton({
      ...settledState,
      catalogIsLoading: true,
    }),
    true,
  );
});

test('shows the Quotes skeleton for the initial active watchlist request', () => {
  assert.equal(
    shouldShowInitialQuotesSkeleton({
      ...settledState,
      watchlistIsLoading: true,
    }),
    true,
  );
});

test('does not show the Quotes skeleton while the Quotes catalog is inactive', () => {
  assert.equal(
    shouldShowInitialQuotesSkeleton({
      ...settledState,
      quoteCatalogActive: false,
      catalogIsLoading: true,
      watchlistIsLoading: true,
    }),
    false,
  );
});

test('keeps usable local quote rows visible during initial query work', () => {
  assert.equal(
    shouldShowInitialQuotesSkeleton({
      ...settledState,
      hasRenderableQuotes: true,
      catalogIsLoading: true,
      watchlistIsLoading: true,
    }),
    false,
  );
});

test('ignores an inactive watchlist and hides after both initial queries settle', () => {
  assert.equal(
    shouldShowInitialQuotesSkeleton({
      ...settledState,
      quoteWatchlistActive: false,
      watchlistIsLoading: true,
    }),
    false,
  );
  assert.equal(shouldShowInitialQuotesSkeleton(settledState), false);
});

test('QuotesScreen wires the skeleton to initial query loading and preserves real empty states', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/quotes/QuotesScreen.tsx'),
    'utf8',
  );

  assert.match(source, /isLoading: catalogIsLoading/);
  assert.match(source, /isLoading: watchlistIsLoading/);
  assert.match(
    source,
    /const showInitialQuotesSkeleton = shouldShowInitialQuotesSkeleton\(\{[\s\S]*quoteCatalogActive,[\s\S]*quoteWatchlistActive,[\s\S]*hasRenderableQuotes: quoteSymbols\.length > 0,[\s\S]*catalogIsLoading,[\s\S]*watchlistIsLoading,[\s\S]*\}\);/,
  );
  assert.match(
    source,
    /data=\{showInitialQuotesSkeleton \? EMPTY_QUOTE_SYMBOLS : filtered\}/,
  );
  assert.match(
    source,
    /showInitialQuotesSkeleton \? \([\s\S]*<QuoteInitialSkeletonRows[\s\S]*t\('Awaiting live instruments'\)/,
  );
  assert.match(source, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(source, /AccessibilityInfo\.addEventListener\(\s*'reduceMotionChanged'/);
  assert.match(source, /accessibilityState=\{\{ busy: true \}\}/);
  assert.match(source, /importantForAccessibility="no-hide-descendants"/);
  assert.match(
    source,
    /if \(!hasSetInitialSymbols\) \{[\s\S]*if \(!quoteCatalogActive\)[\s\S]*catalogIsLoading \|\| \(quoteWatchlistActive && watchlistIsLoading\)/,
  );
  const publicSeedIndex = source.indexOf(
    'if (isPublicDemoMarket && currentSymbols.length === 0 && feedAwareSymbols.length === 0)',
  );
  const catalogWaitIndex = source.indexOf(
    'if (catalogIsLoading || (quoteWatchlistActive && watchlistIsLoading))',
  );
  assert.ok(publicSeedIndex >= 0 && publicSeedIndex < catalogWaitIndex);
  assert.match(
    source,
    /if \(isPublicDemoMarket && currentSymbols\.length === 0 && feedAwareSymbols\.length === 0\) return/,
  );
  assert.doesNotMatch(source, /isFetching: (catalog|watchlist)IsLoading/);
});
