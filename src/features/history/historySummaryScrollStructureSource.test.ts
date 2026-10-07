import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const DETAILS_LABELS = ['Account ID', 'Symbol', 'Deposit', 'Closed P/L', 'Swap', 'Commission', 'Range'];

/**
 * Splits the History screen render into the pinned region (siblings of the
 * FlatList, which never move) and the scrolling list header, so we can assert
 * exactly which parts of the account summary participate in the scroll.
 */
function historyScreenRegions() {
  const source = readSource('src/features/history/HistoryScreen.tsx');
  const screenStart = source.indexOf('<Screen noBottomInset');
  const flatListStart = source.indexOf('<FlatList', screenStart);
  const headerStart = source.indexOf('ListHeaderComponent={', flatListStart);
  const headerEnd = source.indexOf('renderItem={', headerStart);

  assert.notEqual(screenStart, -1);
  assert.notEqual(flatListStart, -1);
  assert.notEqual(headerStart, -1);
  assert.notEqual(headerEnd, -1);

  return {
    source,
    summaryHeader: source.slice(source.indexOf('const historySummaryHeader = ('), screenStart),
    pinned: source.slice(screenStart, flatListStart),
    listHeader: source.slice(headerStart, headerEnd),
  };
}

test('history pins the balance when space permits and scrolls its details grid', () => {
  const { pinned, listHeader, summaryHeader, source } = historyScreenRegions();

  // The balance header (and its expand/collapse toggle) stays outside the list.
  assert.match(summaryHeader, /styles\.summaryTop/);
  assert.match(summaryHeader, /styles\.summaryBlock/);
  assert.match(summaryHeader, /\{fmt\.decimal\(balance\)\}/);
  assert.match(summaryHeader, /toggleHistorySummaryDetails/);
  assert.match(source, /shouldScrollTradingSummary\(useResponsiveLayout\(\)\)/);
  assert.match(pinned, /\{!scrollSummary \? historySummaryHeader : null\}/);
  assert.match(listHeader, /\{scrollSummary \? historySummaryHeader : null\}/);
  assert.match(listHeader, /scrollSummary && styles\.summaryDetailsCardScrolling/);

  // Nothing from the details grid may remain pinned.
  assert.doesNotMatch(pinned, /summaryDetailsCard/);
  assert.doesNotMatch(pinned, /styles\.gridRow/);
  for (const label of DETAILS_LABELS) {
    assert.doesNotMatch(pinned, new RegExp(`t\\('${label}'\\)`), `${label} must not be pinned`);
  }

  // The whole grid now lives in the scrolling list header, still collapsible.
  assert.match(listHeader, /historySummaryDetailsVisible \? \(/);
  assert.match(listHeader, /styles\.summaryDetailsCard/);
  for (const label of DETAILS_LABELS) {
    assert.match(listHeader, new RegExp(`t\\('${label}'\\)`), `${label} must scroll with the list`);
  }
});

test('history list header orders details grid, then tabs, then trade records', () => {
  const { listHeader } = historyScreenRegions();
  const detailsIndex = listHeader.indexOf('styles.summaryDetailsCard');
  const controlsIndex = listHeader.indexOf('styles.topBlock');
  const recordsIndex = listHeader.indexOf('styles.sectionHeader');

  assert.notEqual(detailsIndex, -1);
  assert.notEqual(controlsIndex, -1);
  assert.notEqual(recordsIndex, -1);
  assert.ok(
    detailsIndex < controlsIndex,
    'summary details must scroll away before the Orders/Positions/Deals controls',
  );
  assert.ok(controlsIndex < recordsIndex, 'controls card must precede the Trade Records header');
});

test('history summary details stay reachable from the scrolling grid', () => {
  const { listHeader } = historyScreenRegions();
  const detailsStart = listHeader.indexOf('styles.summaryDetailsCard');
  const detailsEnd = listHeader.indexOf('styles.topBlock', detailsStart);
  const detailsGrid = listHeader.slice(detailsStart, detailsEnd);

  // The Range cell keeps opening the filter host after the move.
  assert.match(detailsGrid, /onPress=\{openHistoryFilter\}/);
  assert.match(detailsGrid, /latencyLabel="history\.filter\.open"/);
});

test('history balance header and scrolling details still render as one card', () => {
  const source = readSource('src/features/history/HistoryScreen.tsx');
  const { summaryHeader } = historyScreenRegions();

  // The pinned card squares its bottom edge only while the grid is expanded.
  assert.match(
    summaryHeader,
    /\[styles\.summaryBlock, historySummaryDetailsVisible && styles\.summaryBlockFused\]/,
  );

  const fusedStart = source.indexOf('summaryBlockFused: {');
  const detailsStart = source.indexOf('summaryDetailsCard: {');
  const detailsEnd = source.indexOf('gridRow:', detailsStart);
  assert.notEqual(fusedStart, -1);
  assert.notEqual(detailsStart, -1);
  assert.notEqual(detailsEnd, -1);
  assert.ok(fusedStart < detailsStart, 'summaryBlockFused must stay outside the details card shell slice');

  const fusedStyle = source.slice(fusedStart, detailsStart);
  assert.match(fusedStyle, /borderBottomLeftRadius: 0/);
  assert.match(fusedStyle, /borderBottomRightRadius: 0/);

  const detailsStyle = source.slice(detailsStart, detailsEnd);
  // Flush against the balance card: no top edge, square top corners, while the
  // outer shell keeps the shared 16px radius on the bottom.
  assert.match(detailsStyle, /borderTopWidth: 0/);
  assert.match(detailsStyle, /borderTopLeftRadius: 0/);
  assert.match(detailsStyle, /borderTopRightRadius: 0/);
  assert.match(detailsStyle, /borderRadius: 16/);
});

test('history summary details bleed past the clip boundary so a fast fling cannot open a seam', () => {
  const source = readSource('src/features/history/HistoryScreen.tsx');

  const bleed = Number(/const SUMMARY_DETAILS_OVERSCROLL_BLEED = (\d+);/.exec(source)?.[1]);
  assert.ok(Number.isFinite(bleed), 'SUMMARY_DETAILS_OVERSCROLL_BLEED must be a numeric constant');
  assert.ok(bleed >= 48, `bleed of ${bleed}px is too small to cover a fast-fling overscroll`);

  const detailsStart = source.indexOf('summaryDetailsCard: {');
  const detailsEnd = source.indexOf('gridRow:', detailsStart);
  const detailsStyle = source.slice(detailsStart, detailsEnd);

  // Pulled up by the bleed and padded back down by the same amount: the grid keeps
  // its position and the content height is unchanged, but card background + side
  // borders now cover the boundary instead of screen background.
  assert.match(detailsStyle, /marginTop: -SUMMARY_DETAILS_OVERSCROLL_BLEED/);
  assert.match(detailsStyle, /paddingTop: SUMMARY_DETAILS_OVERSCROLL_BLEED/);
  assert.match(detailsStyle, /summaryDetailsCardScrolling: \{ marginTop: 0, paddingTop: 0 \}/);
});

test('history list carries no pull-to-refresh surface but still refetches on focus', () => {
  const source = readSource('src/features/history/HistoryScreen.tsx');

  assert.doesNotMatch(source, /RefreshControl/);
  assert.doesNotMatch(source, /refreshControl=/);

  // Removing the spinner must not leave the screen with no way to pick up trades
  // closed elsewhere — the tab-focus refetch is what covers that now.
  assert.match(source, /refetchPositionHistory\(\);\s*refetchDeals\(\);\s*refetchOrders\(\);/);
});
