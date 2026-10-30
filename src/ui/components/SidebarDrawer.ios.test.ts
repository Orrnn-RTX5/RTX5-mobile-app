import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  invalidateSidebarOpenVisualWork,
  openSidebarDrawerImmediately,
  registerSidebarOpenHandler,
  scheduleAfterSidebarOpenVisual,
} from './sidebarDrawerController';

const source = readFileSync('src/ui/components/SidebarDrawer.tsx', 'utf8').replace(/\r\n/g, '\n');

function mountOpenHandler(platform: 'ios' | 'android') {
  const start = source.indexOf('  const showInteractiveAfterVisualFrame = useCallback');
  const end = source.indexOf('\n  /**', source.indexOf('  useEffect(() => registerSidebarOpenHandler', start));
  let visible = false;
  let interactive = false;
  let sidebarOpen = false;
  let dispose = () => {};
  const cancel = { current: null as null | (() => void) };
  const native: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    Platform: { OS: platform },
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => () => void) => { dispose = effect(); },
    interactiveGenerationRef: { current: 0 },
    animatedVisibleRef: { get current() { return visible; } },
    containerRef: { current: { setNativeProps: (props: object) => Object.assign(native, props) } },
    cancelOpenCommitRef: cancel,
    setInteractive: (value: boolean) => { interactive = value; },
    setSidebarOpen: (value: boolean) => { sidebarOpen = value; },
    revealDrawerImmediately: () => { visible = true; },
    registerSidebarOpenHandler,
    scheduleAfterSidebarOpenVisual,
  });
  return {
    get interactive() { return interactive; },
    get sidebarOpen() { return sidebarOpen; },
    native,
    dispose: () => { cancel.current?.(); dispose(); invalidateSidebarOpenVisualWork(); },
  };
}

test('iOS open commits input ownership in the reveal turn, including repeated hamburger taps', () => {
  const host = mountOpenHandler('ios');
  try {
    openSidebarDrawerImmediately();
    assert.equal(host.interactive, true, 'iOS must not depend on a later paint to keep its revealed menu interactive');
    assert.equal(host.sidebarOpen, true);
    openSidebarDrawerImmediately();
    assert.equal(host.interactive, true);
    assert.equal(host.sidebarOpen, true);
    assert.equal(host.native.pointerEvents, 'auto');
  } finally { host.dispose(); }
});

test('Android keeps deferred bookkeeping and a repeated open still completes', async () => {
  const originalRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  const host = mountOpenHandler('android');
  try {
    openSidebarDrawerImmediately();
    assert.equal(host.interactive, false, 'Android keeps its immediate native reveal and deferred React work');
    openSidebarDrawerImmediately();
    await new Promise(resolve => setTimeout(resolve, 110));
    assert.equal(host.interactive, true, 'another open request must not strand the drawer in native-only state');
    assert.equal(host.sidebarOpen, true);
  } finally {
    host.dispose();
    if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});

test('iOS hamburger and drawer navigation wait for a completed tap; Android retains touch-down activation', () => {
  const headers = [
    'src/ui/components/AppHeader.tsx',
    'src/features/chart/ChartScreen.native.tsx',
    'src/features/settings/AboutScreen.tsx',
    'src/features/settings/HelpScreen.tsx',
    'src/features/settings/UserGuideScreen.tsx',
    'src/features/settings/JournalScreen/JournalScreen.tsx',
    'src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx',
  ];
  for (const path of headers) {
    const header = readFileSync(path, 'utf8');
    assert.match(header, /onPress=\{handleOpen(?:Sidebar|Menu)\}\s+activateOnTouchStart=\{Platform.OS !== 'ios'\}/, path);
  }
  // Evaluate the real drawer row, rather than just assert its attribute text.
  const rowStart = source.indexOf('const SidebarMenuRow = memo(');
  const rowEnd = source.indexOf('\n});', rowStart) + '\n});'.length;
  for (const platform of ['ios', 'android']) {
    const row = runInNewContext(ts.transpileModule(source.slice(rowStart, rowEnd) + '\nSidebarMenuRow;', {
      compilerOptions: { jsx: ts.JsxEmit.React, jsxFactory: 'createElement', target: ts.ScriptTarget.ES2020 },
    }).outputText, {
      memo: (component: unknown) => component,
      createElement: (_type: unknown, props: object) => props,
      Platform: { OS: platform }, Pressable: 'Pressable', Text: 'Text', Ionicons: 'Ionicons',
      SIDEBAR_MENU_ITEM_HIT_SLOP: {},
    }) as (props: object) => { activateOnPressIn: boolean };
    const button = row({ item: { label: 'Settings', icon: 'settings-outline' }, ds: {}, onPressItem() {} });
    assert.equal(button.activateOnPressIn, platform !== 'ios');
  }
  const guestAction = source.slice(source.indexOf("onPress={() => navigateSidebarRoute('/login')}"));
  assert.match(guestAction, /activateOnPressIn=\{Platform.OS !== 'ios'\}/);
});
