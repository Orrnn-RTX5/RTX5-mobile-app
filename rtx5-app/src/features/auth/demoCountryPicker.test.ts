import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as phoneCountries from './phoneCountries';
import { filterActionSheetActions } from '../../ui/components/ActionSheet/search';
import { demoRegistrationBody, validateDemoForm } from '../../api/guestAuthentication';

type Element = { type: string; props: Record<string, any>; children: unknown[] };
const source = readFileSync(resolve(process.cwd(), 'src/features/auth/DemoAccountScreen.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;

// Execute the screen's handlers and rendered props without a native runtime.
// Native sheet visibility/animation contracts are covered by ActionSheet tests.
function createForm(platform: 'android' | 'ios' = 'android') {
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
      Linking: { openURL() {} }, Platform: { OS: platform }, useWindowDimensions: () => ({ width: 390, fontScale: 1 }),
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) },
    '../../ui/components/FastPressable': { FastPressable: 'Pressable' },
    '../../ui/theme/useTheme': { useTheme: () => ({ trading: { buy: { primary: '#008000' } } }) },
    '../../state/themeMode': { useThemeMode: () => 'light' },
    '../../i18n/useTranslation': { useTranslation: () => ({ t: (value: string) => value }) },
    './demoAccountStyles': { makeDemoAccountStyles: () => ({}) },
    '../../api/guestAuthentication': { validateDemoForm },
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
  const submitted: ReturnType<typeof demoRegistrationBody>[] = [];
  const props = {
    name: 'Test Trader', email: 'test@example.com', investorPassword: 'Investor123', password: 'Password123', confirmation: '',
    brokerId: 'test', brokerOptions: [], brokerName: 'Test Broker', busy: false, disabled: false,
    onNameChange: (value: string) => { props.name = value; },
    onEmailChange: (value: string) => { props.email = value; },
    onPasswordChange: (value: string) => { props.password = value; },
    onInvestorPasswordChange: (value: string) => { props.investorPassword = value; },
    onConfirmationChange: (value: string) => { props.confirmation = value; },
    onSubmit: () => { submitted.push(demoRegistrationBody(props, props.brokerId)); },
  };
  const render = () => {
    cursor = 0;
    tree = exports.DemoAccountScreen!({ ...props });
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
    find,
    submitted,
    props,
    labels: () => {
      const labels: string[] = [];
      const visit = (value: unknown) => {
        if (Array.isArray(value)) { value.forEach(visit); return; }
        if (!value || typeof value !== 'object' || !('children' in value)) return;
        const element = value as Element;
        if (element.type === 'Text') labels.push(element.children.filter(child => typeof child === 'string').join(''));
        visit(element.children);
      };
      visit(tree); return labels;
    },
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

for (const platform of ['android', 'ios'] as const) {
  test(`${platform}: country searches select the matching record and preserve the typed number`, () => {
    const form = createForm(platform);
    form.phoneInput().onChangeText('9876543210'); form.render();
    for (const [query, code] of [['ind', 'IN'], ['91', 'ER'], ['29', 'ER'], ['+291', 'ER'], ['id', 'ID'], ['', 'US']]) {
      form.countryButton().onPress(); form.render();
      const matches = filterActionSheetActions<{ key: string; label: string; onPress: () => void }>(form.picker().actions, query, value => value);
      if (query === 'ind') assert.equal(matches.some(action => action.key === 'AR'), false);
      const action = matches.find(value => value.key === code);
      assert.ok(action, `${query} must include ${code}`);
      action.onPress(); form.picker().onClose(); form.render();
      const country = phoneCountries.PHONE_COUNTRIES.find(value => value.code === code)!;
      assert.equal(form.countryButton().accessibilityLabel, `Select country code: ${country.name}, ${country.dialCodes[0]}`);
      assert.equal(form.phoneInput().value, '9876543210');
      assert.equal(form.picker().actions.filter((value: any) => value.selected).length, 1);
    }
  });

  test(`${platform}: one Master Password follows Investor Password and validates, toggles and submits exactly`, () => {
    const form = createForm(platform);
    const input = (label: string) => form.find(element => element.type === 'TextInput' && element.props.accessibilityLabel === label).props;
    const register = () => form.find(element => element.props.accessibilityLabel === 'Register demo account').props.onPress();
    assert.equal(form.labels().filter(label => label === 'Master password').length, 1);
    assert.ok(form.labels().indexOf('Investor password') < form.labels().indexOf('Master password'));
    assert.equal(input('Investor password').editable, true);
    assert.equal(input('Investor password').secureTextEntry, true);
    assert.equal(input('Investor password').autoComplete, 'new-password');
    assert.equal(input('Investor password').textContentType, 'newPassword');
    assert.equal(input('Investor password').autoCapitalize, 'none');
    assert.equal(input('Investor password').autoCorrect, false);
    form.find(element => element.props.accessibilityLabel === 'Show investor password').props.onPress(); form.render();
    assert.equal(input('Investor password').secureTextEntry, false);
    assert.equal(input('Master password').secureTextEntry, true);
    form.find(element => element.props.accessibilityLabel === 'Hide investor password').props.onPress(); form.render();
    assert.equal(input('Master password').secureTextEntry, true);
    assert.equal(input('Master password').autoComplete, 'new-password');
    form.find(element => element.props.accessibilityLabel === 'Show password').props.onPress(); form.render();
    assert.equal(input('Master password').secureTextEntry, false);
    assert.equal(input('Investor password').secureTextEntry, true);
    form.find(element => element.props.accessibilityLabel === 'Hide password').props.onPress(); form.render();
    assert.equal(input('Master password').secureTextEntry, true);
    form.find(element => element.props.accessibilityRole === 'checkbox').props.onPress();
    input('Investor password').onChangeText(''); form.render(); register(); form.render();
    assert.equal(form.submitted.length, 0);
    assert.ok(form.labels().includes('Enter an investor password.'));
    for (const invalid of ['short', 'abcdefgh', '12345678']) {
      input('Investor password').onChangeText(invalid); register(); form.render();
      assert.equal(form.submitted.length, 0);
      assert.ok(form.labels().includes('Investor password: use at least 8 characters, including a letter and a number.'));
    }
    input('Investor password').onChangeText('Investor123'); form.render();
    input('Master password').onChangeText('short'); form.render(); register(); form.render();
    assert.equal(form.submitted.length, 0);
    assert.ok(form.labels().includes('Use at least 8 characters, including a letter and a number.'));
    input('Master password').onChangeText(' Secret123! '); register(); form.render();
    input('Confirm password').onChangeText('Secret123!'); form.render(); register(); form.render();
    assert.equal(form.submitted.length, 0);
    assert.ok(form.labels().includes('Passwords must match exactly.'));
    input('Investor password').onChangeText(' Investor456! ');
    input('Confirm password').onChangeText(' Secret123! '); register();
    assert.deepEqual(form.submitted, [{ name: 'Test Trader', email: 'test@example.com', username: 'test@example.com', investor_pass: ' Investor456! ', password: ' Secret123! ', broker_id: 'test' }]);
    form.props.busy = true; form.render();
    assert.equal(input('Master password').editable, false);
    assert.equal(input('Investor password').editable, false);
    assert.equal(form.find(element => element.props.accessibilityLabel === 'Show investor password').props.disabled, true);
    assert.equal(input('Confirm password').editable, false);
    register(); assert.equal(form.submitted.length, 1);
  });
}

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
