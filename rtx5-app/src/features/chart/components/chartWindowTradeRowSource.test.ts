import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const componentDirectory = __dirname;
const tradeRowSource = readFileSync(
  path.join(componentDirectory, 'ChartWindowTradeRow.tsx'),
  'utf8',
);
const tradeButtonsSource = readFileSync(
  path.join(componentDirectory, 'ChartTradeButtonsFeature', 'ChartTradeButtonsFeature.tsx'),
  'utf8',
);
const tradeHandlerSource = readFileSync(
  path.join(componentDirectory, 'ChartTradeButtonsFeature', 'useTradeHandler.ts'),
  'utf8',
);

test('secondary windows reuse the production chart trade controls', () => {
  assert.match(tradeRowSource, /<ChartTradeButtons/);
  assert.match(tradeRowSource, /symbol=\{context\.symbol\}/);
  assert.match(tradeRowSource, /chartWindowPaneId=\{context\.paneId\}/);
  assert.match(tradeRowSource, /onTradeResult=\{onTradeResult\}/);
  assert.match(tradeRowSource, /onTradeQueueEvent=\{onTradeQueueEvent\}/);
  assert.match(tradeRowSource, /onDecreaseLot=\{onDecreaseLot\}/);
  assert.match(tradeRowSource, /onIncreaseLot=\{onIncreaseLot\}/);
  assert.match(tradeRowSource, /volumeBounds=\{context\.volumeBounds\}/);
  assert.match(
    tradeRowSource,
    /const paneLotInvalid = lotInvalid[\s\S]*!isValidTradeVolume\(lotSize, context\.volumeBounds\)/,
  );
  assert.match(tradeRowSource, /lotInvalid=\{paneLotInvalid\}/);
  assert.doesNotMatch(tradeRowSource, /stopLossPrice|takeProfitPrice|protectionDraftId/);
});

test('secondary trade execution has a fail-closed tap-time pane ownership gate', () => {
  assert.match(tradeButtonsSource, /isSymbolExecutionOwner/);
  assert.match(tradeButtonsSource, /isSymbolExecutionOwner,/);
  assert.match(tradeHandlerSource, /resolveSymbolExecutionOwnership/);
  assert.match(tradeHandlerSource, /customOwnershipCheck\(\) === true/);
  assert.match(
    tradeHandlerSource,
    /const executeTrade = \(side: TradeSide\) => \{[\s\S]*if \(!resolveSymbolExecutionOwnership\(\)\)/,
  );
  assert.match(tradeHandlerSource, /resolveSymbolExecutionOwnership\(\)[\s\S]*dispatchChartTradeImmediately\(\{/);
  assert.doesNotMatch(tradeHandlerSource, /tradeQueueRef|processNextQueuedTrade|clearQueuedTrades/);
  assert.match(tradeHandlerSource, /reason: isSymbolExecutionOwner \? 'stale-chart-window' : 'stale-symbol'/);
});

test('compact chart-window lot controls preserve a readable center value', () => {
  const stylesSource = readFileSync(
    path.join(componentDirectory, 'ChartTradeButtonsFeature', 'styles.ts'),
    'utf8',
  );

  assert.match(stylesSource, /actionLotSlotCompact:\s*\{[\s\S]*width: 82/);
  assert.match(stylesSource, /actionLotAdjustButtonCompact:\s*\{[\s\S]*width: 22/);
  assert.match(stylesSource, /actionLotCommittedIconBoxCompact:\s*\{[\s\S]*width: 22/);
  assert.match(tradeButtonsSource, /compactPane && baseStyles\.actionLotAdjustButtonCompact/);
  assert.match(tradeButtonsSource, /compactPane && baseStyles\.actionLotCommittedIconBoxCompact/);
});
