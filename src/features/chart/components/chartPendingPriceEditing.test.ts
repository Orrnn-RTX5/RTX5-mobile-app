import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { formatBackendPrice } from '../../../utils/backendPrice';
import { parsePositiveDecimalInput } from '../../../utils/decimalInput';
import { sanitizeTradeVolumeDraft } from '../../../utils/tradeVolume';
import { roundOrderTicketPrice } from '../../trade/orderTicketPreviewUtils';

type Element = { type: string; props: Record<string, any>; children: unknown[] };
type EditorKind = 'price' | 'stopLimitPrice' | 'volume' | 'sl' | 'tp';

const controls = ts.createSourceFile('controls.tsx',
  readFileSync('src/features/chart/components/ChartTradeControls.tsx', 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const native = ts.createSourceFile('native.tsx',
  readFileSync('src/features/chart/ChartScreen.native.tsx', 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = controls.statements.find(node =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'ChartStepperModal');
assert.ok(component);
const compiledComponent = ts.transpileModule(`${component.getText(controls)}\nexports.render = ChartStepperModal;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS },
}).outputText;

function evaluate<T>(code: string, scope: Record<string, unknown>): T {
  const exports: { value?: T } = {};
  runInNewContext(ts.transpileModule(`exports.value = (${code});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...scope });
  return exports.value!;
}

function nativeCallback(name: string): string {
  let result = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(native) === name
      && node.initializer && ts.isCallExpression(node.initializer)) {
      result = node.initializer.arguments[0].getText(native);
    }
    ts.forEachChild(node, visit);
  };
  visit(native);
  assert.ok(result, `${name} must be present in the native screen`);
  return result;
}

function nativeEditorProps(kind: EditorKind) {
  const props: Record<string, boolean> = {};
  const visit = (node: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
      && node.tagName.getText(native) === 'ChartStepperModal') {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        const name = attribute.name.getText(native);
        if (name !== 'editable' && name !== 'priceReadout') continue;
        assert.ok(attribute.initializer && ts.isJsxExpression(attribute.initializer)
          && attribute.initializer.expression);
        props[name] = evaluate<boolean>(attribute.initializer.expression.getText(native), {
          chartStepperEditor: { kind },
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(native);
  assert.equal(Object.keys(props).length, 2);
  return props;
}

function descendants(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== 'object' || !('type' in node)) return [];
  const element = node as Element;
  return [element, ...element.children.flatMap(descendants)];
}

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node && typeof node === 'object' && 'children' in node
    ? textContent((node as Element).children) : '';
}

function mount(kind: EditorKind, options: {
  initial?: number; step?: number; decimals?: number; min?: number; max?: number;
  onCommit?: (value: number) => void;
} = {}) {
  const slots: any[] = [];
  const effects: Array<() => void> = [];
  const commits: number[] = [];
  let cursor = 0;
  let changed = false;
  let closes = 0;
  let keyboardDismisses = 0;
  const sameDependencies = (before: unknown[] | undefined, next: unknown[]) =>
    !!before && before.length === next.length && next.every((value, index) => Object.is(value, before[index]));
  const react = {
    createElement: (type: string, props: object, ...children: unknown[]) => ({ type, props: props ?? {}, children }),
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next: unknown) => {
        const value = typeof next === 'function' ? next(slots[index]) : next;
        if (!Object.is(value, slots[index])) changed = true;
        slots[index] = value;
      }];
    },
    useRef: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback: (callback: unknown, dependencies: unknown[]) => {
      const index = cursor++;
      if (!sameDependencies(slots[index]?.dependencies, dependencies)) slots[index] = { callback, dependencies };
      return slots[index].callback;
    },
    useEffect: (effect: () => void, dependencies: unknown[]) => {
      const index = cursor++;
      if (!sameDependencies(slots[index], dependencies)) effects.push(effect);
      slots[index] = dependencies;
    },
  };
  const exports: { render?: (props: object) => Element } = {};
  runInNewContext(compiledComponent, {
    exports, React: react,
    View: 'View', Text: 'Text', TextInput: 'TextInput', Modal: 'Modal', Pressable: 'Pressable',
    PriceScrollWheel: 'PriceScrollWheel',
    StyleSheet: { absoluteFillObject: {} }, OVERLAY_MODAL_PROPS: {},
    Keyboard: { dismiss: () => { keyboardDismisses++; } },
    useTranslation: () => ({ t: (value: string) => value }),
    formatBackendPrice, parsePositiveDecimalInput, sanitizeTradeVolumeDraft,
  });
  const props = {
    visible: true, title: kind === 'price' ? 'Price' : kind,
    initial: options.initial ?? 4011.74, step: options.step ?? 0.01,
    decimals: options.decimals ?? 2, min: options.min, max: options.max,
    ...nativeEditorProps(kind), styles: {},
    onCommit: (value: number) => { commits.push(value); options.onCommit?.(value); },
    onClose: () => { closes++; },
  };
  const render = () => {
    let tree: Element;
    let renders = 0;
    do {
      assert.ok(++renders <= 10, 'component must settle after its effects');
      cursor = 0;
      changed = false;
      tree = exports.render!(props);
      effects.splice(0).forEach(effect => effect());
    } while (changed);
    return tree;
  };
  const input = (tree = render()) => descendants(tree).find(node => node.type === 'TextInput');
  const button = (label: string, tree = render()) => {
    const found = descendants(tree).find(node => node.type === 'Pressable' && textContent(node) === label);
    assert.ok(found, `${label} button must be present`);
    return found;
  };
  return {
    render, input, button, commits,
    wheel: (tree = render()) => descendants(tree).find(node => node.type === 'PriceScrollWheel'),
    updateProps: (next: Partial<{ visible: boolean; initial: number }>) => { Object.assign(props, next); },
    counts: () => ({ closes, keyboardDismisses }),
  };
}

test('native pending price and stop-limit editors expose numeric input while SL/TP keep their existing readout', () => {
  for (const kind of ['price', 'stopLimitPrice', 'volume'] as const) {
    const input = mount(kind).input();
    assert.ok(input, `${kind} must be manually editable`);
    assert.equal(input.props.keyboardType, 'decimal-pad');
    assert.equal(input.props.selectTextOnFocus, true);
  }
  for (const kind of ['sl', 'tp'] as const) assert.equal(mount(kind).input(), undefined);
});

test('pending entry and stop-limit prices commit the latest typed decimal even before React renders again', () => {
  for (const kind of ['price', 'stopLimitPrice'] as const) {
    for (const decimal of ['4009.25', '4009,25']) {
      const modal = mount(kind);
      const tree = modal.render();
      modal.input(tree)!.props.onChangeText(decimal);
      modal.button('OK', tree).props.onPress();
      assert.deepEqual(modal.commits, [4009.25]);
      assert.equal(modal.counts().closes, 1);
    }
  }
});

test('empty, partial and zero pending prices cannot commit or dismiss the editor', () => {
  for (const value of ['', '.', '0', '0.00']) {
    const modal = mount('price');
    const tree = modal.render();
    modal.input(tree)!.props.onChangeText(value);
    modal.button('OK', tree).props.onPress();
    assert.deepEqual(modal.commits, [], value);
    assert.equal(modal.counts().closes, 0, value);
    assert.equal(modal.button('OK').props.disabled, true, value);
    modal.input()!.props.onBlur();
    assert.deepEqual(modal.commits, [], 'blur must not submit an invalid pending price');
  }
});

test('malformed pasted prices are rejected without silently changing their numeric meaning', () => {
  for (const value of ['-4010', '4.010.25', '4010abc', '4,010.25', '1e3', 'Infinity']) {
    const modal = mount('price');
    modal.input()!.props.onChangeText(value);
    assert.equal(modal.input()!.props.value, '4011.74', value);
    assert.deepEqual(modal.commits, []);
  }
});

test('positive prices below display precision cannot become a zero pending entry', () => {
  const modal = mount('price', { decimals: 2 });
  const tree = modal.render();
  modal.input(tree)!.props.onChangeText('0.001');
  modal.button('OK', tree).props.onPress();
  assert.deepEqual(modal.commits, []);
  assert.equal(modal.counts().closes, 0);
});

test('price step buttons apply to the latest typed number and cancel discards that draft', () => {
  const modal = mount('price', { step: 0.25 });
  const tree = modal.render();
  modal.input(tree)!.props.onChangeText('4009.25');
  modal.button('+', tree).props.onPress();
  assert.equal(modal.input()!.props.value, '4009.50');
  modal.button('−').props.onPress();
  assert.equal(modal.input()!.props.value, '4009.25');
  modal.button('Cancel').props.onPress();
  assert.deepEqual(modal.commits, []);
  assert.equal(modal.counts().closes, 1);
});

test('keyboard completion formats the draft but only explicit OK commits it', () => {
  const modal = mount('price');
  modal.input()!.props.onChangeText('4009.2');
  modal.input()!.props.onSubmitEditing();
  assert.equal(modal.input()!.props.value, '4009.20');
  assert.deepEqual(modal.commits, []);
  assert.equal(modal.counts().keyboardDismisses, 1);
  modal.button('OK').props.onPress();
  assert.deepEqual(modal.commits, [4009.2]);
});

test('the scrolling price wheel updates the draft, survives live quotes and requires OK before committing', () => {
  for (const kind of ['price', 'stopLimitPrice'] as const) {
    const modal = mount(kind, { step: 0.25 });
    const tree = modal.render();
    const wheel = modal.wheel(tree)!;
    assert.equal(wheel.props.step, 0.25);
    modal.input(tree)!.props.onChangeText('4009.25');
    wheel.props.onScrollStart();
    wheel.props.onChange(4009.75);
    modal.updateProps({ initial: 4012.5 });
    assert.equal(modal.input()!.props.value, '4009.75');
    assert.deepEqual(modal.commits, [], 'scrolling must not submit any order');
    modal.button('OK', tree).props.onPress();
    assert.deepEqual(modal.commits, [4009.75]);
  }
  assert.equal(mount('volume').wheel(), undefined);
  for (const kind of ['sl', 'tp'] as const) {
    const modal = mount(kind);
    const tree = modal.render();
    modal.wheel(tree)!.props.onScrollStart();
    modal.wheel(tree)!.props.onChange(4010.5);
    modal.button('OK', tree).props.onPress();
    assert.deepEqual(modal.commits, [4010.5], 'SL/TP readouts commit the last scroll even before React renders');
  }
});

test('Cancel discards a scrolled price and reopening uses the latest initial value', () => {
  const modal = mount('price');
  modal.wheel()!.props.onScrollStart();
  modal.wheel()!.props.onChange(4020.25);
  modal.button('Cancel').props.onPress();
  assert.deepEqual(modal.commits, []);
  modal.updateProps({ visible: false }); modal.render();
  modal.updateProps({ visible: true, initial: 4013.5 });
  assert.equal(modal.input()!.props.value, '4013.50');
  assert.equal(modal.wheel()!.props.value, 4013.5);
});

test('live initial-price updates preserve an edited draft and a new opening receives the current price', () => {
  for (const draft of ['4009.25', '']) {
    const modal = mount('price');
    modal.input()!.props.onChangeText(draft);
    modal.updateProps({ initial: 4012.5 });
    assert.equal(modal.input()!.props.value, draft, 'live quotes must not overwrite manual input');
    assert.deepEqual(modal.commits, []);

    modal.updateProps({ visible: false });
    modal.render();
    modal.updateProps({ visible: true, initial: 4013.5 });
    assert.equal(modal.input()!.props.value, '4013.50', 'reopening must start from the latest initial price');
  }
});

test('native price confirmation snaps to the broker tick and changes only the pending draft', () => {
  for (const kind of ['price', 'stopLimitPrice'] as const) {
    const changes: Array<{ kind: string; value: number }> = [];
    const roundTradePrice = evaluate<(value: number) => number>(nativeCallback('roundTradePrice'), {
      roundOrderTicketPrice, chartProtectionTickSize: 0.25, displayDecimals: 2,
    });
    const onCommit = evaluate<(value: number) => void>(nativeCallback('handleCommitChartStepperValue'), {
      chartStepperEditor: { kind }, roundTradePrice,
      setChartTradePrice: (value: number) => changes.push({ kind: 'price', value }),
      setChartTradeStopLimitPrice: (value: number) => changes.push({ kind: 'stopLimitPrice', value }),
      ordersApi: new Proxy({}, { get: () => { throw new Error('editing a draft must never call a trade API'); } }),
      commitChartTradeSheetStopsForPosition: () => { throw new Error('pending price editing must not modify a position'); },
    });
    const modal = mount(kind, { onCommit });
    modal.input()!.props.onChangeText('4009.38');
    modal.button('OK').props.onPress();
    assert.deepEqual(changes, [{ kind, value: 4009.5 }]);
    onCommit(0.1);
    assert.equal(changes.length, 1, 'a broker tick rounding to zero must not change the draft');
  }
});

test('dragging the pending price cards changes only entry/stop-limit drafts and never submits a trade', () => {
  const changes: Record<string, number> = { entry: 100, stopLimit: 99 };
  const update = (key: string) => (value: number | ((current: number) => number)) => {
    changes[key] = typeof value === 'function' ? value(changes[key]) : value;
  };
  const apply = evaluate<(key: string, value: number) => void>(nativeCallback('applyChartTradePreviewDragPrice'), {
    showChartTradeSheet: true, chartDirectProtectionActive: false,
    isPendingChartOrder: true, isStopLimitChartOrder: true,
    chartTradeSlEnabled: false, chartTradeTpEnabled: false,
    roundTradePrice: (value: number) => Number((Math.round(value / 0.25) * 0.25).toFixed(2)),
    setChartTradePrice: update('entry'), setChartTradeStopLimitPrice: update('stopLimit'),
    setChartTradeSlPrice: () => assert.fail('entry drag must not modify SL'),
    setChartTradeTpPrice: () => assert.fail('entry drag must not modify TP'),
    ordersApi: new Proxy({}, { get: () => { throw new Error('dragging cannot submit any trade'); } }),
  });
  apply('entry', 110.25);
  apply('stopLimit', 109.5);
  assert.deepEqual(changes, { entry: 110.25, stopLimit: 109.5 });
  apply('entry', NaN); apply('entry', -1);
  assert.equal(changes.entry, 110.25);
});

test('volume editing keeps its bounds and existing typed-input behavior', () => {
  const modal = mount('volume', { initial: 0.01, min: 0.01, max: 10, step: 0.01 });
  const tree = modal.render();
  modal.input(tree)!.props.onChangeText('0.42');
  modal.button('OK', tree).props.onPress();
  assert.deepEqual(modal.commits, [0.42]);
  const bounded = mount('volume', { initial: 0.01, min: 0.01, max: 10 });
  bounded.input()!.props.onChangeText('99');
  bounded.button('OK').props.onPress();
  assert.deepEqual(bounded.commits, [10]);
});
