import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { priceAfterVerticalDrag } from './priceDrag';

test('up/down drag changes the price in broker ticks with no cumulative movement error', () => {
  assert.equal(priceAfterVerticalDrag(100, -16, 0.25, 2), 100.5);
  assert.equal(priceAfterVerticalDrag(100, 16, 0.25, 2), 99.5);
  assert.equal(priceAfterVerticalDrag(1.23456, -24, 0.00001, 5), 1.23459);
  assert.equal(priceAfterVerticalDrag(100, -6, 0.25, 2), 100, 'small movement stays a tap');
  assert.equal(priceAfterVerticalDrag(100.13, -8, 0.25, 2), 100.5, 'values stay on the broker tick');
});

test('drag respects positive prices, broker bounds and invalid precision', () => {
  assert.equal(priceAfterVerticalDrag(1, 10000, 0.25, 2), 0.25);
  assert.equal(priceAfterVerticalDrag(100, -1000, 0.25, 2, 99, 101), 101);
  assert.equal(priceAfterVerticalDrag(100, 1000, 0.25, 2, 99.1, 101), 99.25);
  assert.equal(priceAfterVerticalDrag(100, -16, 0, 2), 100);
  assert.equal(priceAfterVerticalDrag(100, NaN, 0.25, 2), 100);
  assert.equal(priceAfterVerticalDrag(0, 16, 0.00001, 2), 0, 'bad precision cannot emit a zero price');
});

function mountDrag() {
  const source = ts.transpileModule(readFileSync('src/features/trade/PriceDragControl.tsx', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const slots: any[] = [];
  let cursor = 0;
  const changes: number[] = [];
  let starts = 0;
  const props = { value: 100, step: 0.25, decimals: 2, label: 'Price', enabled: true,
    onChange: (value: number) => changes.push(value), onDragStart: () => { starts++; } };
  const react = {
    createElement: (type: string, props: any, ...children: unknown[]) => ({ type, props, children }),
    useRef: (initial: unknown) => { const index = cursor++; return slots[index] ?? (slots[index] = { current: initial }); },
    useMemo: (factory: () => unknown) => { const index = cursor++; return slots[index] ?? (slots[index] = factory()); },
  };
  const exports = {} as { PriceDragControl: (props: any) => { props: any } };
  runInNewContext(source, { exports, require: (name: string) => {
    if (name === 'react') return { ...react, default: react };
    if (name === 'react-native') return { View: 'View', PanResponder: { create: (handlers: any) => ({ panHandlers: handlers }) } };
    if (name === './priceDrag') return { priceAfterVerticalDrag };
    assert.fail(`Unexpected dependency ${name}`);
  } });
  return { changes, props, starts: () => starts,
    render: () => { cursor = 0; return exports.PriceDragControl(props).props; } };
}

test('decimal prices and bounds use accessibility text rather than native integer fields', () => {
  const control = mountDrag();
  for (const price of [3999.72, 4001.62, 1.23456, 0.00000001, 3000000000.25]) {
    Object.assign(control.props, { value: price, step: 0.01, min: 3990.25, max: 4010.75 });
    const value = control.render().accessibilityValue;
    assert.equal(value.text, String(price));
    for (const key of ['now', 'min', 'max']) assert.equal(value[key], undefined,
      `${key} is an integer-only Fabric accessibility field`);
  }
});

test('production gesture captures vertical drags, preserves taps and emits only draft prices', () => {
  const control = mountDrag();
  const gestures = control.render();
  assert.equal(gestures.onStartShouldSetPanResponder(), false);
  assert.equal(gestures.onMoveShouldSetPanResponderCapture({}, { dy: 2, dx: 0 }), false);
  assert.equal(gestures.onMoveShouldSetPanResponderCapture({}, { dy: 10, dx: 20 }), false);
  assert.equal(gestures.onMoveShouldSetPanResponderCapture({}, { dy: -16, dx: 1 }), true);
  gestures.onPanResponderGrant();
  gestures.onPanResponderMove({}, { dy: -16 });
  gestures.onPanResponderMove({}, { dy: -16 });
  control.props.value = 200; // A live update cannot change the drag's captured origin.
  control.render();
  gestures.onPanResponderRelease({}, { dy: -24 });
  assert.deepEqual(control.changes, [100.5, 100.75]);
  assert.equal(control.starts(), 1);
  gestures.onPanResponderMove({}, { dy: -32 });
  assert.equal(control.changes.length, 2, 'release revokes the old gesture');
});

test('disabled and interrupted drags cannot change the price, and accessibility uses the same tick rules', () => {
  const control = mountDrag();
  const gestures = control.render();
  gestures.onPanResponderGrant();
  control.props.enabled = false;
  control.render();
  gestures.onPanResponderMove({}, { dy: -16 });
  assert.deepEqual(control.changes, []);
  gestures.onPanResponderTerminate();
  control.props.enabled = true;
  const current = control.render();
  current.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  current.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
  assert.deepEqual(control.changes, [100.25, 99.75]);
});
