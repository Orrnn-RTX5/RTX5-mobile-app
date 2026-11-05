import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createLogoutConfirmationController } from './logoutConfirmationController';

type Element = { type: string; props: Record<string, any>; children: Element[] };
const source = ts.createSourceFile('LogoutConfirmation.tsx', readFileSync('src/features/settings/SettingsScreen/LogoutConfirmation.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'PresentedLogoutConfirmation');
assert.ok(component);
const compiled = ts.transpileModule(`${component.getText(source)}\nexports.render = PresentedLogoutConfirmation;`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function mount(platform: string, onConfirm: () => void = () => {}) {
  const slots: any[] = [];
  const cleanups: Array<() => void> = [];
  let cursor = 0;
  let confirms = 0;
  let cancels = 0;
  const exports: { render?: (props: object) => Element } = {};
  runInNewContext(compiled, {
    exports,
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (next: unknown) => { slots[index] = next; }];
    },
    useRef: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useLayoutEffect: (effect: () => () => void) => {
      const index = cursor++;
      if (!(index in slots)) { slots[index] = true; cleanups.push(effect()); }
    },
    useTranslation: () => ({ t: (value: string) => value }),
    React: { createElement: (type: string, props: object, ...children: Element[]) => ({ type, props, children }) },
    Platform: { OS: platform }, Modal: 'Modal', View: 'View', ScrollView: 'ScrollView', Text: 'Text',
    FastPressable: 'Button', Ionicons: 'Icon', StyleSheet: { absoluteFillObject: {} },
    OVERLAY_MODAL_PROPS: {}, styles: {},
  });
  const render = () => {
    cursor = 0;
    return exports.render!({ layout: {}, T: { trading: { sell: {} } }, onConfirm: () => { confirms++; onConfirm(); }, onCancel: () => { cancels++; } });
  };
  const find = (tree: Element, id: string): Element | undefined => {
    if (tree.props?.testID === id) return tree;
    return tree.children?.map(child => child && typeof child === 'object' ? find(child, id) : undefined).find(Boolean);
  };
  return {
    render,
    confirm: () => find(render(), 'logout-confirmation-confirm')!.props.onPress(),
    cancel: () => find(render(), 'logout-confirmation-cancel')!.props.onPress(),
    unmount: () => cleanups.forEach(cleanup => cleanup()),
    counts: () => ({ confirms, cancels }),
  };
}

test('iOS closes its native logout Modal before authorizing Login and consumes callbacks once', () => {
  const dialog = mount('ios');
  assert.equal(dialog.render().props.visible, true);
  dialog.confirm();
  dialog.confirm();
  const dismissing = dialog.render();
  assert.equal(dismissing.type, 'Modal', 'retain the mounted Modal to receive native dismissal');
  assert.equal(dismissing.props.visible, false);
  assert.deepEqual(dialog.counts(), { confirms: 0, cancels: 0 });
  dismissing.props.onDismiss();
  dismissing.props.onDismiss();
  dialog.confirm();
  assert.deepEqual(dialog.counts(), { confirms: 1, cancels: 0 });
});

test('cancellation or unmount revokes a pending native logout acknowledgement', () => {
  for (const cancel of ['cancel', 'unmount'] as const) {
    const dialog = mount('ios');
    dialog.confirm();
    const staleDismiss = dialog.render().props.onDismiss;
    dialog[cancel]();
    staleDismiss();
    assert.equal(dialog.counts().confirms, 0);
  }
  const cancelled = mount('ios');
  cancelled.cancel();
  cancelled.render().props.onDismiss();
  assert.deepEqual(cancelled.counts(), { confirms: 0, cancels: 1 });
});

test('Android confirms immediately without waiting for an iOS-only dismissal event', () => {
  const dialog = mount('android');
  dialog.confirm();
  dialog.confirm();
  dialog.render().props.onDismiss();
  assert.deepEqual(dialog.counts(), { confirms: 1, cancels: 0 });
});

test('a replacement session cannot be logged out by a delayed confirmation', () => {
  const sessionGuard = createLogoutConfirmationController();
  sessionGuard.open('session-1');
  let activeSession = 'session-1';
  let logouts = 0;
  const dialog = mount('ios', () => { if (sessionGuard.consume(activeSession)) logouts++; });
  dialog.confirm();
  activeSession = 'session-2';
  sessionGuard.reconcileSession(activeSession);
  dialog.render().props.onDismiss();
  assert.equal(logouts, 0);
});
