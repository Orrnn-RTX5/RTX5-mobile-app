import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readTradeScreenSource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/trade/TradeScreen/TradeScreen.tsx'), 'utf8');

const readTradeSummarySource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/trade/TradeScreen/SummaryHeader.tsx'), 'utf8');

test('trade bulk launcher opens through the shared Quotes-style action sheet path', () => {
  const source = readTradeScreenSource();
  const summarySource = readTradeSummarySource();

  assert.match(source, /import \{ runImmediateAction \} from '\.\.\/\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(source, /const bulkActionSheetConfig = useMemo<Parameters<typeof showTradeActionSheet>\[0\]>/);
  assert.doesNotMatch(source, /title: t\('Bulk Operations'\)/);
  assert.match(source, /presentation: 'mt5Plain'/);
  assert.match(source, /showActionIcons: true/);
  assert.match(source, /detent: 'auto'/);
  assert.match(source, /instantOpen: true/);
  assert.match(source, /entryMotion: 'mt5Slide'/);
  assert.match(source, /runActionAfterClose: false/);
  assert.match(source, /const TRADE_BULK_ACTION_ICON_LIGHT = '#4F535C'/);
  assert.match(source, /const TRADE_BULK_ACTION_ICON_DARK = '#EEF1F5'/);
  assert.match(source, /const bulkActionIconColor = isDark \? TRADE_BULK_ACTION_ICON_DARK : TRADE_BULK_ACTION_ICON_LIGHT/);
  const bulkConfigStart = source.indexOf('const bulkActionSheetConfig = useMemo');
  const bulkConfigEnd = source.indexOf('const showBulkSheet = useCallback', bulkConfigStart);
  const bulkConfigSource = source.slice(bulkConfigStart, bulkConfigEnd);

  assert.notEqual(bulkConfigStart, -1);
  assert.notEqual(bulkConfigEnd, -1);
  assert.doesNotMatch(bulkConfigSource, /danger: true/);
  assert.match(bulkConfigSource, /color=\{bulkActionIconColor\}/);
  assert.doesNotMatch(bulkConfigSource, /color=\{T\.trading\.sell\.primary\}/);
  assert.match(source, /label: t\('Close All Positions'\)/);
  assert.match(source, /label: t\('Close Profitable Positions'\)/);
  assert.match(source, /label: t\('Close Losing Positions'\)/);
  assert.match(source, /label: t\('Close Buy Positions'\)/);
  assert.match(source, /label: t\('Close Sell Positions'\),\s*onPress: \(\) => navigateToBulkMode\('sell'\)/);
  assert.doesNotMatch(source, /uniqueBulkSymbols/);
  assert.doesNotMatch(source, /navigateToBulkMode\(`symbol:\$\{symbol\}`\)/);
  assert.match(
    source,
    /const showBulkSheet = useCallback\(\(\) => \{[\s\S]*runImmediateAction\('trade\.bulkSheet\.open', \(\) => showTradeActionSheet\(bulkActionSheetConfig\)\)/,
  );
  assert.match(summarySource, /latencyLabel="trade\.bulk\.open"[\s\S]*activateOnTouchStart/);
  assert.doesNotMatch(source, /requestAnimationFrame\(showBulkSheet\)/);
  assert.doesNotMatch(source, /Close BTCUSD Positions/);
  assert.doesNotMatch(source, /symbol:BTCUSD/);
  assert.doesNotMatch(source, /Close USDJPY Positions/);
  assert.doesNotMatch(source, /symbol:USDJPY/);
});
