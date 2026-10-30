import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { PRICE_WHEEL_ROW_HEIGHT, priceAtWheelOffset, priceWheelRange } from './priceWheel';

test('wheel rows select higher and lower prices in exact broker ticks', () => {
  const range = priceWheelRange(100, 0.25, 2)!;
  assert.equal(priceAtWheelOffset(range, (range.index + 3) * PRICE_WHEEL_ROW_HEIGHT).value, 100.75);
  assert.equal(priceAtWheelOffset(range, (range.index - 2) * PRICE_WHEEL_ROW_HEIGHT).value, 99.5);
  const fx = priceWheelRange(1.23456, 0.00001, 5)!;
  assert.equal(priceAtWheelOffset(fx, (fx.index + 1) * PRICE_WHEEL_ROW_HEIGHT).value, 1.23457);
});

test('the wheel contains only positive valid ticks within bounds', () => {
  const low = priceWheelRange(0.01, 0.01, 2)!;
  assert.equal(priceAtWheelOffset(low, -100).value, 0.01);
  const bounded = priceWheelRange(10.3, 0.25, 2, 10.1, 10.6)!;
  assert.equal(priceAtWheelOffset(bounded, -100).value, 10.25);
  assert.equal(priceAtWheelOffset(bounded, 10000).value, 10.5);
  assert.equal(priceWheelRange(100, 0, 2), null);
  assert.equal(priceWheelRange(100, 0.00001, 2), null);
});

function mountWheel() {
  const compiled = ts.transpileModule(readFileSync('src/features/trade/PriceScrollWheel.tsx', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const slots: any[] = [];
  let cursor = 0;
  let dirty = false;
  const effects: Array<() => void> = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const changes: number[] = [];
  const resets: number[] = [];
  let starts = 0;
  const props = { value: 100, step: 0.25, decimals: 2, label: 'Price',
    onChange: (value: number) => { changes.push(value); props.value = value; },
    onScrollStart: () => { starts++; } };
  const react = {
    createElement: (type: string, props: any, ...children: unknown[]) => {
      if (type === 'ScrollView' && props.ref) props.ref.current = { scrollTo: (options: { y: number }) => resets.push(options.y) };
      return { type, props: props ?? {}, children };
    },
    useRef: (value: unknown) => { const index = cursor++; return slots[index] ?? (slots[index] = { current: value }); },
    useState: (value: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
      return [slots[index], (next: unknown) => { if (!Object.is(slots[index], next)) dirty = true; slots[index] = next; }];
    },
    useEffect: (effect: () => void, dependencies: unknown[]) => {
      const index = cursor++;
      if (!slots[index] || dependencies.some((value, i) => !Object.is(value, slots[index][i]))) effects.push(effect);
      slots[index] = dependencies;
    },
  };
  const exports = {} as { PriceScrollWheel: (props: any) => any };
  runInNewContext(compiled, { exports,
    setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    require: (name: string) => {
      if (name === 'react') return { ...react, default: react };
      if (name === 'react-native') return { Platform: { OS: 'ios' }, View: 'View', Text: 'Text', ScrollView: 'ScrollView', StyleSheet: { create: (value: unknown) => value } };
      if (name === './priceWheel') return { PRICE_WHEEL_ROW_HEIGHT, priceAtWheelOffset, priceWheelRange };
      assert.fail(`Unexpected dependency ${name}`);
    },
  });
  return { props, changes, resets, starts: () => starts, timerCount: () => timers.size,
    settle: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
    render: () => {
      let tree: any;
      let renders = 0;
      do {
        assert.ok(++renders < 10, 'wheel effects must settle');
        cursor = 0; dirty = false; tree = exports.PriceScrollWheel(props);
        effects.splice(0).forEach(effect => effect());
      } while (dirty);
      return { root: tree.props, scroll: tree.children.find((child: any) => child?.type === 'ScrollView').props };
    } };
}

const event = (y: number) => ({ nativeEvent: { contentOffset: { y } } });

test('decimal wheel prices and bounds never enter Fabric integer accessibility fields', () => {
  const wheel = mountWheel();
  for (const price of [3999.72, 4001.62, 1.23456, 0.00000001, 3000000000.25]) {
    Object.assign(wheel.props, { value: price, step: 0.01, min: 3990.25, max: 4010.75 });
    const value = wheel.render().root.accessibilityValue;
    assert.equal(value.text, String(price));
    for (const key of ['now', 'min', 'max']) assert.equal(value[key], undefined,
      `${key} is an integer-only Fabric accessibility field`);
  }
});

test('native scrolling edits the draft immediately, ignores programmatic events and recenters after settling', () => {
  const wheel = mountWheel();
  const { scroll } = wheel.render();
  const center = scroll.contentOffset.y;
  assert.equal(scroll.snapToInterval, PRICE_WHEEL_ROW_HEIGHT);
  scroll.onScroll(event(center + 36));
  assert.deepEqual(wheel.changes, [], 'initial positioning cannot select a new price');
  scroll.onScrollBeginDrag();
  scroll.onScroll(event(center + 108));
  assert.deepEqual(wheel.changes, [100.75]);
  wheel.render();
  assert.deepEqual(wheel.resets, [], 'a draft update must not interrupt the finger scroll');
  scroll.onScrollEndDrag(event(center + 108));
  wheel.settle();
  assert.equal(wheel.starts(), 1);
  assert.equal(wheel.resets.at(-1), center);
  scroll.onScroll(event(center));
  assert.deepEqual(wheel.changes, [100.75], 'recentering must not overwrite the selected draft');
});

test('momentum continues selecting prices and repeated scrolls can pass the original window', () => {
  const wheel = mountWheel();
  for (let iteration = 1; iteration <= 3; iteration++) {
    const { scroll } = wheel.render();
    const offset = scroll.contentOffset.y + 50 * PRICE_WHEEL_ROW_HEIGHT;
    scroll.onScrollBeginDrag();
    scroll.onScrollEndDrag(event(offset - 36));
    scroll.onMomentumScrollBegin();
    assert.equal(wheel.timerCount(), 0);
    scroll.onScroll(event(offset));
    scroll.onMomentumScrollEnd(event(offset));
    assert.equal(wheel.props.value, 100 + iteration * 12.5);
  }
});

test('typing, step buttons and accessibility can reposition a stopped wheel', () => {
  const wheel = mountWheel();
  wheel.render();
  wheel.props.value = 250;
  const next = wheel.render();
  assert.ok(wheel.resets.length > 0);
  next.root.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  assert.equal(wheel.props.value, 250.25);
  wheel.render().root.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
  assert.equal(wheel.props.value, 250);
});
