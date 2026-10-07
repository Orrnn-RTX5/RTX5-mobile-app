import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const sliceBetween = (source: string, startMarker: string, endMarker: string): string => {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end === -1 ? undefined : end);
};

test('web chart price header never substitutes an alternate close for the selected side', () => {
  const source = readSource('src/features/chart/ChartScreen.web.tsx');
  const header = sliceBetween(source, 'const LivePriceHeader', 'const LiveTradeButtons');

  assert.match(header, /const currentPrice = selectedQuote/);
  assert.match(header, /DELAYED SNAPSHOT/);
  assert.doesNotMatch(header, /latestTick|candleClose|selectedQuote\s*\?\?/);
});

test('chart trade confirmations never invent tickets or execution prices', () => {
  const web = readSource('src/features/chart/ChartScreen.web.tsx');
  const webButtons = sliceBetween(web, 'const LiveTradeButtons', 'const LiveTvLegend');
  const handler = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts',
  );
  const native = readSource('src/features/chart/ChartScreen.native.tsx');
  const nativePendingSubmit = sliceBetween(
    native,
    'const handleSubmitPendingTradeFromSheet',
    'const handleChartTradeSheet',
  );
  const evidence = readSource('src/api/orders/executionEvidence.ts');

  assert.doesNotMatch(webButtons, /Math\.random|openPrice:\s*data|currentPrice:\s*data/);
  assert.match(webButtons, /data\?\.price_open \?\? data\?\.price/);
  assert.doesNotMatch(webButtons, /data\?\.price\s*(?:\|\||\?\?).*(?:latestBid|latestAsk)/);

  assert.match(evidence, /data\.price \?\? data\.price_open/);
  assert.doesNotMatch(evidence, /data\.position_ticket \?\? data\.order_ticket/);
  assert.match(evidence, /ticket !== undefined && executionPrice !== undefined/);
  assert.match(handler, /resolveBrokerExecutionEvidence\(data\)/);
  assert.match(handler, /executionEvidence\.confirmed/);
  assert.doesNotMatch(handler, /['"]Confirmed['"]|acceptedTrade\.latest(?:Bid|Ask)/);

  assert.match(nativePendingSubmit, /resolveBrokerExecutionEvidence\(data\)/);
  assert.match(nativePendingSubmit, /executionConfirmed:\s*false/);
  assert.match(nativePendingSubmit, /Pending Order (?:Placed|Submitted)/);
  assert.doesNotMatch(nativePendingSubmit, /['"]Confirmed['"]|data\.price[^\n]*(?:\?\?|\|\|)\s*chartTradePrice/);
});

test('shared order mutation never inserts an execution response into the position ledger', () => {
  const source = readSource('src/query/orders.ts');
  const orderSource = readSource('src/api/orders/placeMarketOrder.ts');
  const reconciliationSource = readSource('src/api/orders/marketPositionReconciliation.ts');

  assert.doesNotMatch(source, /canOptimisticallyInsertPosition/);
  assert.doesNotMatch(source, /\.upsertPosition\(/);
  assert.match(source, /handlePlaceOrderSuccess\([\s\S]*queryClient,[\s\S]*data,[\s\S]*variables,[\s\S]*owner/);
  assert.match(reconciliationSource, /response\?\.position_ticket \?\? response\?\.ticket/);
  assert.doesNotMatch(reconciliationSource, /order_ticket/);
  assert.match(orderSource, /getPositionsForReconciliation\(reconciliationAccountLogin\)/);
  assert.match(orderSource, /applyPositionsSnapshot\(/);
  assert.doesNotMatch(orderSource, /\.upsertPosition\(/);
  assert.doesNotMatch(source, /openPrice:\s*data\.price\s*\|\|\s*0/);
  assert.doesNotMatch(source, /currentPrice:\s*data\.price\s*\|\|\s*0/);
});

test('order ticket never fabricates a broker fill from a live quote or random id', () => {
  const source = readSource('src/features/trade/OrderTicketScreen.tsx');
  const handler = sliceBetween(source, 'const handlePlaceOrder', 'const updateVolume');

  assert.match(handler, /resolveBrokerExecutionEvidence\(data\)/);
  assert.doesNotMatch(handler, /canOptimisticallyInsertPosition/);
  assert.doesNotMatch(handler, /\.upsertPosition\(/);
  assert.match(handler, /API-owned captured-session reconciliation is[\s\S]*the only writer/);
  assert.doesNotMatch(handler, /syncMarketPosition|refreshPositions\(/);
  assert.match(handler, /executionConfirmed:\s*false/);
  assert.match(handler, /Confirmation Pending/);
  assert.doesNotMatch(handler, /Math\.random/);
  assert.doesNotMatch(handler, /data\.price[^\n]*(?:\?\?|\|\|)[^\n]*(?:ASK|BID)/);
  assert.doesNotMatch(handler, /openPrice:\s*data\.price|currentPrice:\s*data\.price/);
});

test('market-order surfaces report accepted responses without fill evidence as unconfirmed', () => {
  const orderTicket = readSource('src/features/trade/OrderTicketScreen.tsx');
  const chartHandler = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts',
  );
  const symbolDetails = readSource(
    'src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx',
  );
  const modal = readSource('src/ui/components/TradeFeedbackModal.tsx');
  const presentation = readSource('src/ui/components/tradeFeedbackPresentation.ts');

  for (const source of [orderTicket, chartHandler, symbolDetails]) {
    assert.match(source, /resolveBrokerExecutionEvidence/);
    assert.match(source, /executionEvidence\.confirmed/);
    assert.match(source, /Confirmation Pending/);
  }
  assert.match(modal, /state\.executionConfirmed === false/);
  assert.match(modal, /state\.title \|\|/);
  assert.match(
    modal,
    /const receipt = resolveConfirmedTradeReceipt\(state\)[\s\S]*const isUnconfirmedSubmission = isSuccess && receipt === null[\s\S]*if \(receipt\)/,
  );
  assert.match(presentation, /state\.executionConfirmed !== true/);
  assert.match(presentation, /!ticket[\s\S]*price <= 0[\s\S]*volume <= 0[\s\S]*return null/);
  assert.match(
    modal,
    /name=\{isUnconfirmedSubmission \? 'information-circle' : 'alert-circle'\}[\s\S]*detailedMessage/,
  );
  assert.doesNotMatch(modal, /progressAnim|headerProgress/);
});
