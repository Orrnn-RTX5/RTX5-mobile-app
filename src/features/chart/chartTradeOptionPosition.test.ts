import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { CHART_ORDER_TYPES } from './chartTradeOrderUtils';

const parse = (path: string) => ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const native = parse('src/features/chart/ChartScreen.native.tsx');
const ticket = parse('src/features/trade/OrderTicketScreen.tsx');

function callback(file: ts.SourceFile, name: string) {
  let result: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name
      && node.initializer && ts.isCallExpression(node.initializer)) result = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result?.getText(file);
}

function evaluate(code: string, scope: Record<string, any>): any {
  const exports: Record<string, any> = {};
  runInNewContext(ts.transpileModule(`exports.value = (${code});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, { exports, ...scope });
  return exports.value;
}

function centeringEffects(file: ts.SourceFile, scrollName: string) {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect'
      && node.arguments[0]?.getText(file).includes(scrollName)) found.push(node.arguments[0].getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

test('changing chart selection preserves both manually scrolled option rails after queued frames', () => {
  const moves: unknown[] = [];
  const frames: Array<() => void> = [];
  const scope: Record<string, any> = {
    showChartTradeSheet: true,
    chartTradeTypeTabsOverlayScrollRef: { current: { scrollTo: (value: unknown) => moves.push(value) } },
    chartTradeTypeTabsInlineScrollRef: { current: { scrollTo: (value: unknown) => moves.push(value) } },
    chartTradeTypeTabsOverlayLayoutsRef: { current: Object.fromEntries(CHART_ORDER_TYPES.map((type, i) => [type, { x: i * 110, width: 100 }])) },
    chartTradeTypeTabsInlineLayoutsRef: { current: Object.fromEntries(CHART_ORDER_TYPES.map((type, i) => [type, { x: i * 110, width: 100 }])) },
    chartTradeTypeTabsOverlayViewportWidthRef: { current: 300 },
    chartTradeTypeTabsInlineViewportWidthRef: { current: 300 },
    requestAnimationFrame: (frame: () => void) => frames.push(frame),
  };
  const scroll = callback(native, 'scrollChartTradeTypeTabsToOrderType');
  if (scroll) scope.scrollChartTradeTypeTabsToOrderType = evaluate(scroll, scope);
  for (const type of CHART_ORDER_TYPES) {
    scope.chartTradeOrderType = type;
    for (const effect of centeringEffects(native, 'scrollChartTradeTypeTabsToOrderType')) evaluate(effect, scope)();
    frames.splice(0).forEach((frame) => frame());
    assert.deepEqual(moves, [], `${type}: selecting a tab must not scroll its neighbors`);
  }
});

test('ticket option taps update only selection without scrolling the rail', () => {
  let press = '';
  let hitSlop = '';
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.getText(ticket).includes('orderTicket.orderType.')) {
      const attribute = node.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(ticket) === 'onPress');
      if (attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer)) {
        press = attribute.initializer.expression!.getText(ticket);
      }
      const hit = node.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(ticket) === 'hitSlop');
      if (hit && ts.isJsxAttribute(hit) && hit.initializer && ts.isJsxExpression(hit.initializer)) {
        hitSlop = hit.initializer.expression!.getText(ticket);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ticket);
  assert.ok(press);
  assert.ok(hitSlop);
  assert.equal(evaluate(hitSlop, {}).left, 0);
  assert.equal(evaluate(hitSlop, {}).right, 0);
  const moves: unknown[] = [];
  let selected = 'Market Execution';
  const scope: Record<string, any> = {
    isPendingOrderTypeBackendLocked: () => false,
    setOrderType: (type: string) => { selected = type; },
    orderTypeTabsRef: { current: { scrollTo: (value: unknown) => moves.push(value) } },
    orderTypeTabsViewportWidthRef: { current: 300 },
    orderTypeTabLayoutsRef: { current: Object.fromEntries(CHART_ORDER_TYPES.map((type, i) => [type, { x: i * 110, width: 100 }])) },
  };
  const scroll = callback(ticket, 'scrollOrderTypeTabsToSelection');
  if (scroll) scope.scrollOrderTypeTabsToSelection = evaluate(scroll, scope);
  for (const type of CHART_ORDER_TYPES) {
    scope.option = type;
    evaluate(press, scope)();
    scope.orderType = selected;
    for (const effect of centeringEffects(ticket, 'scrollOrderTypeTabsToSelection')) evaluate(effect, scope)();
    assert.equal(selected, type);
    assert.deepEqual(moves, [], `${type}: tapping must leave neighboring options in place`);
  }
});

test('instant SL/TP presentation reaches its final offset without scheduling entrance or exit animation', () => {
  const animations: string[] = [];
  let hidden = 0;
  const scope: Record<string, any> = {
    showChartTradeSheet: false,
    chartTradeSheetHiddenTranslateY: 600,
    chartTradeSheetDragStartY: { value: 600 }, chartTradeSheetTranslateY: { value: 600 },
    chartTradeSheetLastVisibleOffsetRef: { current: 400 },
    resolveChartTradeSheetTranslateY: (mode: string) => mode === 'hidden' ? 600 : mode === 'collapsed' ? 400 : 0,
    setShowChartTradeSheet: () => {}, setChartTradeSheetMode: () => {},
    finalizeChartTradeSheetHide: () => { hidden++; },
    withSpring: () => { animations.push('spring'); return -1; },
    withTiming: () => { animations.push('timing'); return -1; },
  };
  const snap = callback(native, 'snapTradeSheet')!;
  evaluate(snap, scope)('collapsed', true);
  assert.equal(scope.chartTradeSheetTranslateY.value, 400);
  assert.deepEqual(animations, []);
  scope.showChartTradeSheet = true;
  evaluate(snap, scope)('hidden', true);
  assert.equal(hidden, 1);
  assert.deepEqual(animations, []);
  evaluate(snap, scope)('expanded');
  assert.deepEqual(animations, ['spring'], 'existing drag/expand animation remains available');
});

test('the SL/TP toolbar uses first-press activation without an artificial press delay', () => {
  let opening = '';
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.getText(native).includes("routeChartWindowToolbarAction('sltp')")) {
      opening = node.getText(native).replace(/>$/, '/>');
    }
    ts.forEachChild(node, visit);
  };
  visit(native);
  assert.ok(opening);
  const routes: string[] = [];
  const props = evaluate(opening, {
    React: { createElement: (_type: unknown, attributes: unknown) => attributes }, Pressable: 'Pressable',
    styles: {}, chartSlTpBackendLocked: false, chartDirectProtectionActive: false,
    routeChartWindowToolbarAction: (action: string) => routes.push(action),
  });
  assert.equal(props.activateOnPressIn, true);
  assert.equal(props.unstable_pressDelay, 0);
  props.onPress();
  assert.deepEqual(routes, ['sltp']);
});
