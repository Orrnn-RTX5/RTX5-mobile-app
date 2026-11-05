import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as receiptController from './chartTradeReceiptStackController';

type Element = { type: any; props: any; children: any[] };
const source = ts.transpileModule(readFileSync(
  'src/features/chart/components/ChartTradeReceiptStack.tsx', 'utf8',
), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;

function harness() {
  const controller = receiptController.createChartTradeReceiptStackController();
  const hooks: any[] = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  let scrolls = 0;
  const react = {
    memo: (component: any) => component,
    createElement: (type: any, props: any, ...children: any[]): Element => ({ type, props, children }),
    useMemo: (factory: () => any) => factory(),
    useCallback: (callback: any) => callback,
    useRef: (initial: any) => {
      const index = cursor++;
      hooks[index] ??= { current: initial };
      return hooks[index];
    },
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (next: any) => {
        hooks[index] = typeof next === 'function' ? next(hooks[index]) : next;
      }];
    },
    useLayoutEffect: (effect: () => void) => { effects.push(effect); },
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  };
  const native = {
    View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList',
    Platform: { OS: 'android' },
    StyleSheet: { create: (value: any) => value, hairlineWidth: 0.5 },
    useWindowDimensions: () => ({ width: 400, height: 800 }),
  };
  const module = { exports: {} as any };
  runInNewContext(source, {
    exports: module.exports, module,
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === 'react-native') return native;
      if (name.endsWith('/FastPressable')) return { FastPressable: 'Pressable' };
      if (name === './chartTradeReceiptStackController') return receiptController;
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const render = () => {
    cursor = 0;
    effects = [];
    const host = module.exports.ChartTradeReceiptStack({
      controller, isDark: true, buyColor: 'blue', sellColor: 'red', pendingLabel: 'sent',
    }) as Element | null;
    const list = host?.children.find(child => child?.type === 'FlatList') as Element | undefined;
    if (list) list.props.ref.current = { scrollToEnd: (options: { animated: boolean }) => {
      assert.equal(options.animated, false);
      scrolls++;
    } };
    effects.forEach(effect => effect());
    return { host, list };
  };
  const submit = (queueId: number) => controller.applyEvent({
    queueId, status: 'pending', side: queueId % 2 ? 'buy' : 'sell', symbol: 'BTCUSD', volume: 0.01,
  });
  return { controller, render, submit, scrolls: () => scrolls };
}

function flattenStyle(style: any): any {
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
}

test('receipt cells have distinct top-to-bottom bounds matching virtualized offsets', () => {
  const h = harness();
  try {
    for (let queueId = 1; queueId <= 100; queueId++) h.submit(queueId);
    const { host, list } = h.render();
    assert.ok(host && list);
    assert.equal(flattenStyle(host.props.style).position, 'absolute', 'popup rows cannot push the Buy/Sell buttons');
    assert.equal(flattenStyle(list.props.contentContainerStyle).gap, undefined,
      'spacing belongs to each measured cell, not gaps between virtualized spacer views');
    assert.equal(list.props.data.length, 100);
    const separator = list.props.ItemSeparatorComponent();
    const separatorHeight = flattenStyle(separator.props.style).height;
    assert.ok(separatorHeight > 0);
    let nextTop = 0;
    for (let index = 0; index < list.props.data.length; index++) {
      const item: receiptController.ChartTradeQueueEvent = list.props.data[index];
      assert.equal(item.queueId, index + 1);
      const rowComponent = list.props.renderItem({ item, index });
      const row = rowComponent.type(rowComponent.props);
      const rowStyle = flattenStyle(row.props.style({ pressed: false }));
      assert.equal(rowStyle.position, undefined);
      assert.equal(rowStyle.flexShrink, 0);
      const frame: { offset: number; length: number } = list.props.getItemLayout(list.props.data, index);
      assert.equal(frame.offset, nextTop, `row ${index} must start below the preceding row`);
      const cellHeight: number = rowStyle.height + (index < list.props.data.length - 1 ? separatorHeight : 0);
      assert.equal(frame.length, cellHeight);
      nextTop += cellHeight;
    }
  } finally { h.controller.dispose(); }
});

test('a constrained popup area enables scrolling before rows become inaccessible', () => {
  const h = harness();
  try {
    h.submit(1); h.submit(2); h.submit(3);
    const initial = h.render();
    initial.host!.props.onLayout({ nativeEvent: { layout: { height: 65 } } });
    const { list } = h.render();
    assert.ok(list);
    assert.equal(list.props.style.height, 65);
    assert.equal(list.props.scrollEnabled, true);
    assert.equal(list.props.showsVerticalScrollIndicator, true);
    h.controller.dismiss(2); h.controller.dismiss(3);
    const remaining = h.render().list!;
    assert.equal(remaining.props.style.height, 32);
    assert.equal(remaining.props.scrollEnabled, false);
  } finally { h.controller.dispose(); }
});

test('new popups follow the latest row after layout; status changes never reorder or scroll them', () => {
  const h = harness();
  try {
    assert.equal(h.render().host, null);
    h.submit(1); h.submit(2);
    let list = h.render().list!;
    list.props.onContentSizeChange(230, 66);
    const beforeConfirmation = h.scrolls();
    const originalOrder = list.props.data.map((item: any) => item.queueId);
    const second = h.controller.getSnapshot()[1];
    h.controller.applyEvent({ ...second, status: 'confirmed' });
    list = h.render().list!;
    list.props.onContentSizeChange(230, 66);
    assert.deepEqual(list.props.data.map((item: any) => item.queueId), originalOrder);
    assert.equal(h.scrolls(), beforeConfirmation);
    h.submit(3);
    list = h.render().list!;
    const beforeLayout = h.scrolls();
    list.props.onContentSizeChange(230, 100);
    assert.ok(h.scrolls() > beforeLayout, 'new rows must remain visible once native content size is updated');
    assert.deepEqual(list.props.data.map((item: any) => item.queueId), [1, 2, 3]);
    const beforeDismiss = h.scrolls();
    h.controller.dismiss(2);
    list = h.render().list!;
    list.props.onContentSizeChange(230, 66);
    assert.equal(h.scrolls(), beforeDismiss, 'dismissing another row must not force the reader to the end');
  } finally { h.controller.dispose(); }
});

test('equal-height row replacement cannot leave a scroll queued for a later dismissal', () => {
  const h = harness();
  try {
    h.submit(1); h.submit(2);
    h.render().list!.props.onContentSizeChange(230, 66);
    // Native content size does not change when expiry and a new tap are batched.
    h.controller.dismiss(1); h.submit(3);
    h.render();
    const afterReplacement = h.scrolls();
    h.controller.dismiss(2);
    h.render().list!.props.onContentSizeChange(230, 32);
    assert.equal(h.scrolls(), afterReplacement);
    h.submit(4);
    const list = h.render().list!;
    const beforeLayout = h.scrolls();
    list.props.onContentSizeChange(230, 32);
    assert.equal(h.scrolls(), beforeLayout, 'a stale content-size event cannot consume the new-row scroll');
    list.props.onContentSizeChange(230, 66);
    assert.equal(h.scrolls(), beforeLayout + 1);
  } finally { h.controller.dispose(); }
});

test('rapid 20-tap bursts expand initialNumToRender and maxToRenderPerBatch synchronously with zero batching delay', () => {
  const h = harness();
  try {
    for (let queueId = 1; queueId <= 40; queueId++) {
      h.submit(queueId);
      const { list } = h.render();
      assert.ok(list);
      assert.ok(list.props.initialNumToRender >= queueId, 'every appended popup must be within initialNumToRender');
      assert.ok(list.props.maxToRenderPerBatch >= queueId, 'every appended popup must render in the same batch');
      assert.equal(list.props.updateCellsBatchingPeriod, 0);
    }
  } finally { h.controller.dispose(); }
});
