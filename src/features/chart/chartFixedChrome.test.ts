import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const native = ts.createSourceFile('ChartScreen.native.tsx',
  readFileSync('src/features/chart/ChartScreen.native.tsx', 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function scrollProps(ref: string, file = native) {
  let props: ts.JsxAttributes | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === 'ScrollView'
      && node.attributes.properties.some((prop) => ts.isJsxAttribute(prop)
        && prop.name.getText(file) === 'ref' && prop.initializer?.getText(file) === `{${ref}}`)) {
      props = node.attributes;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(props, `missing ${ref} ScrollView`);
  return (name: string, scope: Record<string, unknown>, fallback: unknown) => {
    const prop = props!.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(file) === name);
    if (!prop || !ts.isJsxAttribute(prop)) return fallback;
    if (!prop.initializer) return true;
    if (ts.isStringLiteral(prop.initializer)) return prop.initializer.text;
    assert.ok(ts.isJsxExpression(prop.initializer) && prop.initializer.expression);
    return runInNewContext(`(${prop.initializer.expression.getText(file)})`, scope);
  };
}

test('chart chrome never scrolls or bounces before, during or after a chart gesture in any layout', () => {
  const prop = scrollProps('chartScrollRef');
  for (let state = 0; state < 32; state++) {
    const scope = {
      chartWindows: { isSplit: Boolean(state & 1) },
      shouldCaptureChartGestures: Boolean(state & 2),
      showChartTradeSheet: Boolean(state & 4),
      chartViewportTouchActive: Boolean(state & 8),
      footerLotEditorFocused: Boolean(state & 16),
    };
    assert.equal(prop('scrollEnabled', scope, true), false, `outer scroll enabled in state ${state}`);
    assert.equal(prop('bounces', scope, true), false, `outer bounce enabled in state ${state}`);
    assert.equal(prop('overScrollMode', scope, 'auto'), 'never');
    assert.equal(prop('canCancelContentTouches', scope, true), false);
  }
});

test('locking chart chrome leaves the trade editor scroll container independently scrollable', () => {
  const feature = ts.createSourceFile('ChartTradeFeature.tsx',
    readFileSync('src/features/chart/components/ChartTradeFeature.tsx', 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const prop = scrollProps('sheet.chartTradeSheetScrollRef', feature);
  assert.equal(prop('scrollEnabled', {}, true), true);
});
