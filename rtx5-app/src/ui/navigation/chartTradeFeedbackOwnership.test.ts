import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createChartTradeSheetPortalController } from './chartTradeSheetPortalController';
import * as feedbackPresentation from '../components/tradeFeedbackPresentation';

function loadComponent(path: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  const source = readFileSync(resolve(process.cwd(), path), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, { exports, require: (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

const createElement = (type: unknown, props: any, ...children: unknown[]) => ({
  type, props: { ...props, children },
});

test('feedback releases the global host on blur even while the chart trade sheet remains enabled', () => {
  const controller = createChartTradeSheetPortalController();
  let focused = true; let refIndex = 0; let effectIndex = 0;
  const refs: { current: unknown }[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  let pending: (() => void)[] = [];
  const react = {
    createElement, Fragment: 'Fragment', memo: (component: unknown) => component,
    createContext: () => ({}), useContext: () => controller,
    useRef: (value: unknown) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: value }),
    useCallback: (callback: unknown) => callback,
    useLayoutEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
      const index = effectIndex++; const previous = effects[index];
      if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      previous?.cleanup?.();
      effects[index] = { deps };
      pending.push(() => { effects[index].cleanup = effect(); });
    },
  };
  const { ChartTradeFeedbackPortal } = loadComponent('src/ui/navigation/ChartTradeSheetPortal.tsx', {
    react, 'react-native': { StyleSheet: { create: (styles: unknown) => styles }, View: 'View' },
    '@react-navigation/native': { useIsFocused: () => focused },
    './chartTradeSheetPortalController': { createChartTradeSheetPortalController },
  });
  const render = (enabled: boolean, children: unknown) => {
    refIndex = 0; effectIndex = 0; pending = [];
    const output = ChartTradeFeedbackPortal({ enabled, children });
    pending.forEach(effect => effect());
    return output;
  };
  assert.equal(render(true, 'Chart error'), null);
  assert.equal(controller.getSnapshot().visible, true);
  assert.equal(controller.getSnapshot().renderCurrent?.(), 'Chart error');
  focused = false;
  assert.equal(render(true, 'Chart error'), null);
  assert.equal(controller.getSnapshot().renderCurrent, null);
  assert.equal(controller.getSnapshot().visible, false);
  render(true, 'Late async error');
  assert.equal(controller.getSnapshot().renderCurrent, null, 'background results cannot recreate the host');
  focused = true;
  assert.deepEqual(render(false, 'inline feedback').props.children, ['inline feedback']);
  assert.equal(controller.getSnapshot().renderCurrent, null);
  render(true, 'new Chart error');
  assert.equal(controller.getSnapshot().renderCurrent?.(), 'new Chart error');
  effects.forEach(effect => effect.cleanup?.());
  assert.equal(controller.getSnapshot().renderCurrent, null, 'unmount releases its owner');
});

test('Trade Failed backdrop, close icon and Dismiss invoke only the close callback', () => {
  const palette = { trading: { buy: { primary: 'blue' }, sell: { primary: 'red' }, profit: 'green', loss: 'red' } };
  const { TradeFeedbackModal, TRADE_MODAL_INITIAL } = loadComponent('src/ui/components/TradeFeedbackModal.tsx', {
    react: { createElement, memo: (component: unknown) => component },
    'react-native': { Platform: { OS: 'android' }, ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: (styles: unknown) => styles } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    './FastPressable': { FastPressable: 'Pressable' },
    '../theme/glass': { GDark: palette, GLight: palette },
    './tradeFeedbackPresentation': feedbackPresentation,
  });
  const state = { visible: true, type: 'error', title: 'Trade Failed', message: 'A fresh executable quote is required.' };
  let closes = 0;
  const tree = TradeFeedbackModal({ state, onClose: () => closes++ });
  const pressables: any[] = []; const texts: string[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node.type === 'Pressable') pressables.push(node);
    if (node.type === 'Text') texts.push(node.props.children.join(''));
    visit(node.props?.children);
  };
  visit(tree);
  assert.ok(texts.includes('Trade Failed'));
  assert.ok(texts.includes(state.message), 'genuine quote failures remain visible');
  assert.ok(texts.includes('Dismiss'));
  assert.equal(pressables.length, 3);
  pressables.forEach((button, i) => {
    button.props.onPress();
    assert.equal(closes, i + 1);
  });
  assert.equal(TradeFeedbackModal({ state: TRADE_MODAL_INITIAL, onClose: () => closes++ }), null);
});

test('Chart suppresses only background popup presentation and clears it on blur', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'), 'utf8');
  assert.match(source, /if \(isTradeExecutionFocused\(\)\) setTradeFeedbackState\(feedback\)/);
  assert.match(source, /handleTradeFeedbackClose = useCallback\(\(\) => setTradeFeedbackState\(TRADE_MODAL_INITIAL\), \[\]\)/);
  assert.match(source, /if \(!isScreenFocused\) handleTradeFeedbackClose\(\)/);
  assert.match(source, /chartTradeResultRefreshScheduler\.schedule\(/, 'order reconciliation remains active');
});
