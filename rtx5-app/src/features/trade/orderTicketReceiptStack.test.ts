import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createChartTradeReceiptStackController } from '../chart/components/chartTradeReceiptStackController';
import { resolveConfirmedTradeReceipt } from '../../ui/components/tradeFeedbackPresentation';

const file = ts.createSourceFile('OrderTicketScreen.tsx', readFileSync(
  'src/features/trade/OrderTicketScreen.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(predicate: (node: ts.Node) => ts.Node | undefined): string {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => { found ??= predicate(node); if (!found) ts.forEachChild(node, visit); };
  visit(file); assert.ok(found); return found.getText(file);
}
const showModal = callback(node => ts.isVariableDeclaration(node) && node.name.getText(file) === 'showModal'
  && node.initializer && ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : undefined);
const cleanupEffect = callback(node => ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect'
  && node.arguments[0]?.getText(file).includes('let namespace = captureActiveBrokerSessionProvenance')
  ? node.arguments[0] : undefined);
const hidden = { visible: false, type: 'success' };
function harness() {
  const controller = createChartTradeReceiptStackController();
  let modal: any = hidden, namespace = 'account-a', notify = () => {}, unsubscribed = false;
  const scope = {
    orderTicketReceiptController: controller, nextReceiptIdRef: { current: 1 },
    resolveConfirmedTradeReceipt, TRADE_MODAL_INITIAL: hidden,
    setModalState: (value: any) => { modal = typeof value === 'function' ? value(modal) : value; },
    captureActiveBrokerSessionProvenance: () => ({ cacheNamespace: namespace }),
    subscribeActiveBrokerSession: (listener: () => void) => { notify = listener; return () => { unsubscribed = true; }; },
  };
  const evaluate = (code: string) => runInNewContext(ts.transpileModule(`(${code})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, scope);
  return { controller, show: evaluate(showModal), mount: evaluate(cleanupEffect), modal: () => modal,
    changeSession: (value: string) => { namespace = value; notify(); }, unsubscribed: () => unsubscribed };
}
function confirmed(index: number) {
  return { visible: true, type: 'success', executionConfirmed: true, side: index % 2 ? 'buy' : 'sell',
    symbol: 'BTCUSD', ticket: String(1000 + index), price: 81621.851234, volume: 0.01 };
}

test('each confirmed ticket trade gets its own One-Click receipt, with no cap or replacement', () => {
  const h = harness();
  try {
    for (let index = 0; index < 50; index++) h.show(confirmed(index));
    const receipts = h.controller.getSnapshot();
    assert.equal(receipts.length, 50);
    assert.equal(new Set(receipts.map(receipt => receipt.queueId)).size, 50);
    assert.equal(receipts[0].feedback?.ticket, '1000');
    assert.equal(receipts[49].feedback?.ticket, '1049');
    assert.ok(receipts.every(receipt => receipt.status === 'confirmed'));
    assert.equal(h.modal().visible, false, 'confirmed fills must not open a blocking modal');
    h.controller.dismiss(receipts[0].queueId);
    assert.equal(h.controller.getSnapshot().length, 49);
    assert.equal(h.controller.getSnapshot()[0].feedback?.ticket, '1001');
  } finally { h.controller.dispose(); }
});

test('rejections and incomplete evidence retain detailed feedback without creating done receipts', () => {
  const h = harness();
  try {
    h.show(confirmed(0));
    for (const feedback of [
      { visible: true, type: 'error', message: 'Broker rejected order' },
      { ...confirmed(1), executionConfirmed: false },
      { ...confirmed(2), ticket: undefined },
    ]) {
      h.show(feedback); assert.equal(h.modal(), feedback);
      assert.equal(h.controller.getSnapshot().length, 1);
    }
  } finally { h.controller.dispose(); }
});

test('ticket receipt cleanup preserves credential refreshes and clears account changes and unmount timers', () => {
  const h = harness();
  const cleanup = h.mount();
  try {
    h.show(confirmed(0));
    h.changeSession('account-a'); assert.equal(h.controller.getSnapshot().length, 1);
    h.changeSession('account-b'); assert.equal(h.controller.getSnapshot().length, 0);
    assert.equal(h.modal().visible, false);
    h.show(confirmed(1)); cleanup();
    assert.equal(h.controller.getSnapshot().length, 0);
    assert.equal(h.unsubscribed(), true);
  } finally { h.controller.dispose(); }
});


test('an immediate submitted popup settles in place and cannot resurrect after account cleanup', () => {
  const h = harness();
  try {
    h.controller.applyEvent({ queueId: 70, status: 'pending', side: 'buy', symbol: 'BTCUSD', volume: 0.01 });
    h.show(confirmed(1), 70);
    assert.equal(h.controller.getSnapshot().length, 1);
    assert.equal(h.controller.getSnapshot()[0].queueId, 70);
    assert.equal(h.controller.getSnapshot()[0].status, 'confirmed');
    h.controller.applyEvent({ queueId: 71, status: 'pending', side: 'sell', symbol: 'BTCUSD', volume: 0.01 });
    h.show({ visible: true, type: 'error', message: 'Network timed out' }, 71, 'unconfirmed');
    assert.equal(h.controller.getSnapshot().find(row => row.queueId === 71)?.status, 'unconfirmed');
    assert.equal(h.controller.getSnapshot().find(row => row.queueId === 70)?.status, 'confirmed');
    h.controller.clear(); h.show(confirmed(2), 70);
    assert.equal(h.controller.getSnapshot().length, 0);
  } finally { h.controller.dispose(); }
});

test('the ticket renders sent text immediately without a spinner or premature done label', () => {
  const ui = ts.createSourceFile('ChartTradeReceiptStack.tsx', readFileSync(
    'src/features/chart/components/ChartTradeReceiptStack.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let row: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ui) === 'ReceiptRow'
      && node.initializer && ts.isCallExpression(node.initializer)) row = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(ui); assert.ok(row);
  const render = runInNewContext(ts.transpileModule(`(${row.getText(ui)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
  }).outputText, {
    h: (type: string, props: unknown, ...children: any[]) => ({ type, props, children: children.flat(Infinity) }),
    Pressable: 'Pressable', View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', styles: {},
    formatVolume: (volume: number) => volume.toFixed(2), terminalLabel: () => '',
  });
  const nodes = (node: any): any[] => node && typeof node === 'object' ? [node, ...node.children.flatMap(nodes)] : [];
  const props = { event: { queueId: 1, status: 'pending', side: 'buy', symbol: 'BTCUSD', volume: 0.01 },
    isDark: true, buyColor: 'blue', sellColor: 'red', onDismiss() {} };
  const sent = render({ ...props, pendingLabel: 'sent' });
  assert.ok(nodes(sent).some(node => node.type === 'Text' && node.children.includes('sent')));
  assert.equal(nodes(sent).some(node => node.type === 'ActivityIndicator'), false);
  assert.match(sent.props.accessibilityLabel, /sent$/);
  assert.equal(nodes(sent).some(node => node.children.includes('done')), false);
  assert.equal(nodes(render(props)).some(node => node.type === 'ActivityIndicator'), true,
    'existing One-Click pending presentation remains unchanged');
});
