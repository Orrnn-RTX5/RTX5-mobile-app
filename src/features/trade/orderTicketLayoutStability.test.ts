import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { resolveConfirmedTradeReceipt } from '../../ui/components/tradeFeedbackPresentation';

const source = ts.createSourceFile('OrderTicketScreen.tsx', readFileSync(
  'src/features/trade/OrderTicketScreen.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNode(predicate: (node: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (!found && predicate(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(found); return found;
}
function view(style: string): string {
  return findNode(node => ts.isJsxElement(node) && node.openingElement.attributes.properties.some(
    prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === 'style'
      && prop.initializer?.getText(source) === `{styles.${style}}`,
  )).getText(source);
}
const makeStyles = findNode(node => ts.isFunctionDeclaration(node) && node.name?.text === 'makeStyles').getText(source);
const anchor = view('tradeFeedbackAnchor'), actions = view('execRow');
const availability = source.text.slice(source.text.indexOf('const tradeActionDisabled ='), source.text.indexOf('const tradeButtonActions:'));
type Element = { type: string; props: any; children: any[] };
function render(markup: string, receipt: unknown, pending: string | null, isDark: boolean) {
  let snapshot = receipt ? [receipt] : [];
  const controller = { getSnapshot: () => snapshot, dismiss: () => { snapshot = []; } };
  const code = `${makeStyles}; const styles = makeStyles(theme, isDark); ${availability} (${markup});`;
  const tree = runInNewContext(ts.transpileModule(code, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'h',
  } }).outputText, {
    h: (type: string, props: any, ...children: any[]) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    View: 'View', Text: 'Text', FastPressable: 'FastPressable', ActivityIndicator: 'ActivityIndicator', InfoRow: 'InfoRow',
    ChartTradeReceiptStack: 'ChartTradeReceiptStack', OrderTicketAnchoredReceipts: 'OrderTicketAnchoredReceipts', LiveOrderTickExecutionGraph: 'LiveOrderTickExecutionGraph',
    heavyContentReady: true, symbol: 'BTCUSD', BID: 1, ASK: 2, tickTimestamp: 123, priceDecimals: 2,
    orderTicketReceiptAnchor: {}, insets: { top: 0, bottom: 0 }, orderTicketReceiptController: controller, Ionicons: 'Ionicons', StyleSheet: { create: (styles: any) => styles, absoluteFillObject: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    } },
    theme: { trading: { buy: { primary: 'blue' }, sell: { primary: 'red' } } }, isDark,
    confirmedTradeReceipt: receipt, quoteIsUnavailable: false,
    spread: 500, marginDisplay: '-$8.16', marginError: null, accountSummaryError: null,
    leverageDisplay: '1:100', backendLeverage: 100, t: (value: string) => value,
    BUY_C: 'blue', SELL_C: 'red', T: { text: 'white' },
    handleModalClose() {},
    tradeButtonActions: ['sell', 'buy'].map(side => ({ side, marketLabel: side.toUpperCase(), execTestID: side })),
    isMarketExecution: true, oneClickAccepted: true, pendingSide: pending, tradeActionLocked: pending !== null,
    marketPendingCounts: { buy: pending === 'buy' ? 1 : 0, sell: pending === 'sell' ? 1 : 0 },
    tradePolicyErrors: { buy: null, sell: null }, tradeActionUnavailable: false,
    handlePlaceOrder() {}, volume: 0.01, CRITICAL_TRADE_ACTION_MAX_LATENCY_MS: 50,
  }) as Element;
  return { tree, controller };
}
function style(node: Element, pressed = false): any {
  const value = typeof node.props.style === 'function' ? node.props.style({ pressed }) : node.props.style;
  return JSON.parse(JSON.stringify(Object.assign({}, ...[value].flat(Infinity).filter(Boolean))));
}
function elements(node: any): Element[] {
  return !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(elements)];
}
// Compare the rendered content that participates in native layout. Absolute
// feedback and opacity cannot change sibling positions or dimensions.
function flow(node: any): any {
  if (!node || typeof node !== 'object') return node || null;
  const styles = style(node);
  if (styles.position === 'absolute') return null;
  const { opacity, backgroundColor, shadowColor, color, ...layout } = styles;
  return { type: node.type, layout: JSON.parse(JSON.stringify(layout)), children: node.children.map(flow).filter((child: any) => child !== null) };
}

test('confirmed receipt appears and dismisses without changing the ticket content in normal layout', () => {
  for (const isDark of [false, true]) for (const side of ['buy', 'sell'] as const) {
    const receipt = resolveConfirmedTradeReceipt({ visible: true, type: 'success', executionConfirmed: true,
      side, symbol: 'BTCUSD', ticket: '123', price: 81621.85, volume: 0.01 });
    assert.ok(receipt);
    const idle = render(anchor, null, null, isDark);
    const confirmed = render(anchor, receipt, null, isDark);
    assert.deepEqual(flow(confirmed.tree), flow(idle.tree));
    const receiptOverlay = render(view('tradeReceiptHost'), receipt, null, isDark);
    const overlay = receiptOverlay.tree;
    assert.ok(overlay);
    assert.equal(style(overlay).bottom, 0);
    assert.equal(overlay.props.pointerEvents, 'box-none');
    const stack = elements(overlay).find(node => node.type === 'OrderTicketAnchoredReceipts');
    assert.ok(stack);
    assert.ok(stack.props.anchor);
    assert.equal(stack.props.bottomOffset, undefined, 'placement must use the button row rather than a fixed bottom offset');
    assert.equal(stack.props.controller, receiptOverlay.controller);
    assert.equal(stack.props.controller.getSnapshot().length, 1);
    stack.props.controller.dismiss();
    assert.equal(stack.props.controller.getSnapshot().length, 0);
    assert.deepEqual(flow(render(anchor, null, null, isDark).tree), flow(idle.tree));
  }
});

test('Buy/Sell labels remain visible without spinners and preserve layout throughout submission', () => {
  for (const isDark of [false, true]) {
    const idle = render(actions, null, null, isDark).tree;
    for (const side of ['buy', 'sell']) {
      const pending = render(actions, null, side, isDark).tree;
      assert.deepEqual(flow(pending), flow(idle));
      const spinners = elements(pending).filter(node => node.type === 'ActivityIndicator');
      assert.equal(spinners.length, 0);
      const buttons = elements(pending).filter(node => node.type === 'FastPressable');
      for (const button of buttons) {
        assert.equal(elements(button).some(node => node.type === 'ActivityIndicator'), false);
        const label = elements(button).find(node => node.type === 'Text');
        assert.ok(label);
        assert.notEqual(style(label).opacity, 0);
        const content = button.children.find((node: any) => node?.type === 'View');
        assert.notEqual(style(content).opacity, 0);
        assert.equal(button.props.unstable_pressDelay, 0);
        assert.equal(button.props.activateOnTouchStart, true);
      }
      assert.deepEqual(flow(render(actions, null, null, isDark).tree), flow(idle));
    }
  }
});


test('Buy/Sell appearance stays steady and new clicks remain enabled while other orders are pending', () => {
  for (const isDark of [false, true]) {
    const buttons = (pending: string | null) => elements(render(actions, null, pending, isDark).tree)
      .filter(node => node.type === 'FastPressable');
    const idle = buttons(null);
    for (const side of ['buy', 'sell']) {
      const pending = buttons(side);
      for (let index = 0; index < idle.length; index++) {
        assert.deepEqual(style(idle[index], true), style(idle[index], false), 'pressing must not flash opacity');
        assert.deepEqual(style(pending[index], false), style(idle[index], false), 'pending must not dim either button');
        assert.deepEqual(style(pending[index], true), style(idle[index], false));
        assert.equal(pending[index].props.disabled, false, 'pending requests must not swallow a new physical click');
        assert.equal(pending[index].props.accessibilityState.busy, pending[index].props.testID === side);
      }
      assert.deepEqual(buttons(null).map(button => style(button)), idle.map(button => style(button)));
    }
  }
});


test('the shared receipt list stays outside ScrollViews so all rows remain independently scrollable', () => {
  const host = findNode(node => ts.isJsxElement(node) && node.openingElement.attributes.properties.some(
    prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === 'style'
      && prop.initializer?.getText(source) === '{styles.tradeReceiptHost}',
  ));
  for (let ancestor = host.parent; ancestor; ancestor = ancestor.parent) {
    if (ts.isJsxElement(ancestor)) assert.notEqual(ancestor.openingElement.tagName.getText(source), 'ScrollView');
  }
});

test('the receipt overlay passes the measured button anchor into the shared vertical stack', () => {
  const component = findNode(node => ts.isFunctionExpression(node) && node.name?.text === 'OrderTicketAnchoredReceipts');
  let placement: { top: number; bottom: number } | null = { top: 68, bottom: 108 };
  const renderOverlay = runInNewContext(ts.transpileModule(`(${component.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
  }).outputText, {
    useSyncExternalStore: () => placement,
    h: (type: string, props: any) => ({ type, props }), ChartTradeReceiptStack: 'ChartTradeReceiptStack',
  });
  const props = { anchor: {}, controller: {}, isDark: true, buyColor: 'blue', sellColor: 'red' };
  const overlay = renderOverlay(props);
  assert.equal(overlay.props.pendingLabel, 'sent');
  assert.equal(overlay.props.topOffset, 68);
  assert.equal(overlay.props.bottomOffset, 108);
  assert.equal(overlay.props.controller, props.controller);
  placement = null;
  assert.equal(renderOverlay(props), null, 'unmeasured/offscreen anchors cannot flash in the wrong position');
});
