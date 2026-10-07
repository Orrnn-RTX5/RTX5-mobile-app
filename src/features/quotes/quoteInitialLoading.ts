export type QuoteInitialLoadingState = Readonly<{
  quoteCatalogActive: boolean;
  quoteWatchlistActive: boolean;
  hasRenderableQuotes: boolean;
  catalogIsLoading: boolean;
  watchlistIsLoading: boolean;
}>;

/**
 * Skeletons belong only to the first, data-less catalog/watchlist request.
 * Callers intentionally pass TanStack Query's `isLoading`, not `isFetching`,
 * and preserve any usable local rows, so refreshes and live-feed reconnects
 * keep the real quote content visible.
 */
export function shouldShowInitialQuotesSkeleton({
  quoteCatalogActive,
  quoteWatchlistActive,
  hasRenderableQuotes,
  catalogIsLoading,
  watchlistIsLoading,
}: QuoteInitialLoadingState): boolean {
  if (!quoteCatalogActive || hasRenderableQuotes) {
    return false;
  }

  return catalogIsLoading || (quoteWatchlistActive && watchlistIsLoading);
}
