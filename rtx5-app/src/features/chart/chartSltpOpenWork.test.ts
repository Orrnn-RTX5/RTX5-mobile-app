import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const parse = (path: string) => ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const chart = parse('src/features/chart/ChartScreen.native.tsx');
const windows = parse('src/features/chart/useChartWindowsFeature.ts');

function evaluate(code: string, scope: Record<string, any>): any {
  const exports: Record<string, any> = {};
  runInNewContext(ts.transpileModule(`exports.value = (${code});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...scope });
  return exports.value;
}

function variable(file: ts.SourceFile, name: string) {
  let result: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) result = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}

function overlayField(name: string) {
  let result = '';
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(chart) === 'ChartTradeOverlayLayer') {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || attribute.name.getText(chart) !== 'sheet'
          || !attribute.initializer || !ts.isJsxExpression(attribute.initializer)) continue;
        const object = attribute.initializer.expression;
        if (!object || !ts.isObjectLiteralExpression(object)) continue;
        const property = object.properties.find((item) => item.name?.getText(chart) === name);
        if (property && ts.isPropertyAssignment(property)) result = property.initializer.getText(chart);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(chart);
  assert.ok(result, name);
  return result;
}

test('opening SL/TP does not mount either display-none full editor copy', () => {
  let legacyCondition = '';
  const visit = (node: ts.Node) => {
    if (ts.isJsxExpression(node) && node.expression && ts.isBinaryExpression(node.expression)
      && node.expression.getText(chart).includes('styles.bottomArea')
      && node.expression.getText(chart).includes("display: 'none', paddingBottom: 0")) {
      legacyCondition = node.expression.left.getText(chart);
    }
    ts.forEachChild(node, visit);
  };
  visit(chart);
  assert.ok(legacyCondition);
  const flag = variable(chart, 'mountHiddenInlineTradeSheet');
  for (const isChartExpanded of [false, true]) {
    const scope = {
      isChartExpanded, showChartTradeSheet: true, chartWindows: { isSplit: false },
      mountHiddenInlineTradeSheet: flag ? evaluate(flag.getText(chart), {}) : undefined,
    };
    assert.equal(evaluate(overlayField('showHiddenInlineTradeSheet'), scope), false,
      'opening must not mount the invisible graph/slider/editor inside the overlay');
    assert.equal(evaluate(legacyCondition, scope), false,
      'opening must not mount the second invisible editor inside ChartScreen');
  }
});

test('the visible SL/TP header is pre-mounted in normal and fullscreen chart layouts', () => {
  for (const isChartExpanded of [false, true]) {
    assert.equal(evaluate(overlayField('mountChartTradeSheet'), {
      isChartExpanded, isScreenFocused: true, showChartTradeSheet: false,
    }), true, 'the toolbar must reveal an existing header rather than mount one on its tap');
  }
});

test('the pre-mounted panel remains invisible until it is opened', () => {
  const feature = parse('src/features/chart/components/ChartTradeFeature.tsx');
  let layerStyle = '';
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.getText(feature).includes('styles.chartTradeSheetLayer')) {
      const attribute = node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(feature) === 'style');
      if (attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer)) {
        layerStyle = attribute.initializer.expression!.getText(feature);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(feature);
  assert.ok(layerStyle);
  for (const visible of [false, true]) {
    const styles = evaluate(layerStyle, {
      styles: {}, sheet: { showChartTradeSheet: visible, chartTradeSheetFrozenLayerHeight: 0 },
    });
    assert.equal(styles.find((item: any) => item && typeof item.opacity === 'number')?.opacity, visible ? 1 : 0);
  }
});

test('already-active toolbar ownership confirms immediately without selecting or waiting a frame', () => {
  const initializer = variable(windows, 'runOnToolbarTarget');
  assert.ok(initializer && ts.isCallExpression(initializer));
  const code = initializer.arguments[0].getText(windows);
  const pane = { id: 'one', symbol: 'EURUSD', timeframe: 'M1' };
  const state = { activePaneId: 'one', toolbarTargetPaneId: 'one', panes: [pane] };
  const frames: Array<() => void> = [];
  let selections = 0;
  const confirmations: unknown[] = [];
  const context = { symbol: 'EURUSD', timeframe: 'M1' };
  const scope = {
    stateRef: { current: state }, currentContextRef: { current: context },
    pendingTransitionRef: { current: null }, toolbarConfirmationRevisionRef: { current: 0 },
    cancelPendingTransition() {},
    getActiveChartWindowPane: () => pane,
    chartWindowContextsMatch: (a: typeof context, b: typeof context) => a.symbol === b.symbol && a.timeframe === b.timeframe,
    createToolbarTargetConfirmation: (_state: unknown, target: unknown, confirmed: unknown) => ({ target, confirmed }),
    requestAnimationFrame: (frame: () => void) => frames.push(frame),
    requestPaneSelection: (_target: unknown, confirmed: (target: unknown, context: unknown) => void) => {
      selections++;
      confirmed(pane, context);
    },
  };
  evaluate(code, scope)((confirmed: unknown) => confirmations.push(confirmed));
  assert.equal(confirmations.length, 1, 'the current chart must open its options in this call');
  assert.equal(selections, 0, 'an unchanged pane must not trigger a selection/render cycle');
  assert.equal(frames.length, 0, 'an unchanged pane must not defer opening to requestAnimationFrame');
});

test('a different pane or context still waits for its committed selection before showing options', () => {
  const initializer = variable(windows, 'runOnToolbarTarget');
  assert.ok(initializer && ts.isCallExpression(initializer));
  for (const change of ['pane', 'context']) {
    const target = { id: change === 'pane' ? 'two' : 'one', symbol: 'EURUSD', timeframe: 'M1' };
    const stateRef = { current: { activePaneId: 'one', toolbarTargetPaneId: target.id, panes: [target] } };
    const contextRef = { current: { symbol: change === 'context' ? 'GBPUSD' : 'EURUSD', timeframe: 'M1' } };
    const frames: Array<() => void> = [];
    const confirmations: any[] = [];
    let selection: ((pane: typeof target, context: typeof contextRef.current) => void) | undefined;
    const scope = {
      stateRef, currentContextRef: contextRef, pendingTransitionRef: { current: null },
      toolbarConfirmationRevisionRef: { current: 0 }, cancelPendingTransition() {},
      chartWindowContextsMatch: (a: typeof target, b: typeof contextRef.current) => a.symbol === b.symbol && a.timeframe === b.timeframe,
      createToolbarTargetConfirmation: (_state: unknown, pane: unknown, context: unknown) => ({ pane, context }),
      requestAnimationFrame: (frame: () => void) => frames.push(frame),
      requestPaneSelection: (_pane: unknown, confirmed: NonNullable<typeof selection>) => { selection = confirmed; },
    };
    evaluate(initializer.arguments[0].getText(windows), scope)((value: unknown) => confirmations.push(value));
    assert.equal(confirmations.length, 0, change);
    assert.ok(selection, `${change}: the real context-selection path must remain in use`);
    stateRef.current = { ...stateRef.current, activePaneId: target.id };
    contextRef.current = { symbol: target.symbol, timeframe: target.timeframe };
    selection(target, contextRef.current);
    assert.equal(confirmations.length, 0, 'pane-local restoration still runs before the toolbar callback');
    frames.splice(0).forEach((frame) => frame());
    assert.equal(confirmations.length, 1);
    assert.equal(confirmations[0].pane.id, target.id);
    assert.equal(confirmations[0].context.symbol, target.symbol);
  }
});
