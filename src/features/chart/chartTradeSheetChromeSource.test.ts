import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const stylesSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartScreen.styles.ts'),
  'utf8',
);

const styleBlock = (name: string, nextName: string) => {
  const start = stylesSource.indexOf(`${name}: {`);
  const end = stylesSource.indexOf(`${nextName}: {`, start);

  assert.ok(start >= 0, `${name} style must exist`);
  assert.ok(end > start, `${nextName} style must follow ${name}`);

  return stylesSource.slice(start, end);
};

test('chart trade sheet removes the full-width dividers around the symbol header', () => {
  const sheet = styleBlock('chartTradeSheet', 'chartTradeSheetPending');
  const symbolHeader = styleBlock('chartTradeSheetHeader', 'chartTradeSheetHeaderPending');
  const dragRegion = styleBlock('chartTradeSheetDragRegion', 'chartTradeSheetDragRegionPending');
  const handle = styleBlock('chartTradeSheetHandle', 'chartTradeSheetHandleCompact');

  assert.doesNotMatch(symbolHeader, /borderBottomWidth/);
  assert.doesNotMatch(symbolHeader, /borderBottomColor/);
  assert.doesNotMatch(dragRegion, /borderBottomWidth/);
  assert.doesNotMatch(dragRegion, /borderBottomColor/);
  assert.match(sheet, /borderTopWidth:\s*1/);
  assert.match(sheet, /borderColor:\s*TRADE_SHEET_BORDER/);
  assert.match(handle, /width:\s*52/);
  assert.match(handle, /height:\s*5/);
});
