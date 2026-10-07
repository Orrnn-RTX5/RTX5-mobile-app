import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as phoneCountries from './phoneCountries';
import { filterActionSheetActions } from '../../ui/components/ActionSheet/search';

type Element = { type: string; props: Record<string, any>; children: unknown[] };
const source = readFileSync(resolve(process.cwd(), 'src/features/auth/DemoAccountScreen.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;

// Execute the screen's handlers and rendered props without a native runtime.
// Native sheet visibility/animation contracts are covered by ActionSheet tests.
function createForm() {
  const slots: unknown[] = [];
  let cursor = 0;
  const react = {
    createElement: (type: string, props: Element['props'], ...children: unknown[]): Element => ({ type, props: props ?? {}, children }),
    useState: (initial: unknown) => {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], (value: unknown) => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useRef: (initial: unknown) => {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useMemo: (factory: () => unknown) => factory(),
    useEffect: () => {},
  };
  const modules: Record<string, unknown> = {
    react: { ...react, default: react },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView', ScrollView: 'ScrollView',
      Text: 'Text', TextInput: 'TextInput', View: 'View', Keyboard: { dismiss() {} },
      Linking: { openURL() {} }, Platform: { OS: 'android' }, useWindowDimensions: () => ({ width: 390, fontScale: 1 }),
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) },
    '../../ui/components/FastPressable': { FastPressable: 'Pressable' },
    '../../ui/theme/useTheme': { useTheme: () => ({ trading: { buy: { primary: '#008000' } } }) },
    '../../state/themeMode': { useThemeMode: () => 'light' },
    '../../i18n/useTranslation': { useTranslation: () => ({ t: (value: string) => value }) },
    './demoAccountStyles': { makeDemoAccountStyles: () => ({}) },
    '../../api/guestAuthentication': { validateDemoForm: () => '' },
    '../../ui/components/ActionSheet': { ActionSheet: 'ActionSheet' },
    './phoneCountries': phoneCountries,
  };
  const exports: { DemoAccountScreen?: (props: Record<string, unknown>) => Element } = {};
  runInNewContext(compiled, {
    exports, require: (name: string) => {
      assert.ok(name in modules, `unmocked native dependency: ${name}`);
      return modules[name];
    },
  });
  let tree: Element;
  const render = () => {
    cursor = 0;
    tree = exports.DemoAccountScreen!({
      name: 'Test Trader', email: 'test@example.com', password: 'Password123', confirmation: '',
      brokerId: 'test', brokerOptions: [], brokerName: 'Test Broker', busy: false, disabled: false,
    });
  };
  const find = (predicate: (element: Element) => boolean): Element => {
    const visit = (value: unknown): Element | undefined => {
      if (Array.isArray(value)) return value.map(visit).find(Boolean);
      if (!value || typeof value !== 'object' || !('children' in value)) return;
      const element = value as Element;
      return predicate(element) ? element : visit(element.children);
    };
    const result = visit(tree);
    assert.ok(result, 'requested form control is missing');
    return result;
  };
  render();
  return {
    render,
    picker: () => find(element => element.type === 'ActionSheet' && element.props.title === 'Select country code').props,
    countryButton: () => find(element => element.type === 'Pressable' && element.props.accessibilityLabel?.startsWith('Select country code:')).props,
    phoneInput: () => find(element => element.type === 'TextInput' && element.props.accessibilityLabel === 'Mobile number').props,
  };
}

test('the country selector stays populated and can change countries repeatedly without losing the mobile number', () => {
  const form = createForm();
  form.phoneInput().onChangeText('9876543210');
  form.render();
  for (const code of ['IN', 'GB', 'US', 'AE', 'IN']) {
    assert.equal(form.picker().visible, false);
    assert.equal(form.picker().actions.length, phoneCountries.PHONE_COUNTRIES.length);
    form.countryButton().onPress();
    form.render();
    const picker = form.picker();
    assert.equal(picker.visible, true);
    assert.equal(picker.immediateHostHideOnClose, true, 'a retained country picker must finish closing before a new open');
    assert.equal(picker.runActionAfterClose, false, 'selection must update in the same interaction');
    const country = phoneCountries.PHONE_COUNTRIES.find(value => value.code === code)!;
    const action = picker.actions.find((value: { subtitle: string }) => value.subtitle.startsWith(`${code} ·`));
    assert.equal(action.disabled, false);
    action.onPress();
    picker.onClose();
    form.render();
    assert.equal(form.countryButton().accessibilityLabel, `Select country code: ${country.name}, ${country.dialCodes[0]}`);
    assert.equal(form.phoneInput().value, '9876543210');
    assert.equal(form.picker().visible, false);
  }
});

test('searching, cancelling and reopening country selection preserves the current choice', () => {
  const form = createForm();
  const initialLabel = form.countryButton().accessibilityLabel;
  form.countryButton().onPress();
  form.render();
  const matches = filterActionSheetActions(form.picker().actions, '+91', value => value);
  assert.equal(matches.length, 1);
  form.picker().onClose();
  form.render();
  form.countryButton().onPress();
  form.render();
  assert.equal(form.picker().visible, true);
  assert.equal(form.picker().actions.length, phoneCountries.PHONE_COUNTRIES.length);
  assert.equal(form.countryButton().accessibilityLabel, initialLabel);
  const antarctica = form.picker().actions.find((value: { subtitle: string }) => value.subtitle.startsWith('AQ ·'));
  assert.equal(antarctica.disabled, true);
});
