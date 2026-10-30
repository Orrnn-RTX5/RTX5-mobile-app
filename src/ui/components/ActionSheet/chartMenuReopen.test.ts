import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { resolveActionSheetVisibilityBarrierOpen } from './layout';

const source = ts.createSourceFile(
  'ActionSheet.tsx',
  readFileSync('src/ui/components/ActionSheet/ActionSheet.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function callbackSource(name: string): string {
  let callback: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      assert.ok(node.initializer && ts.isCallExpression(node.initializer));
      callback = node.initializer.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback, `Production callback ${name} must exist`);
  return callback.getText(source);
}

function variableInitializerSource(name: string): string {
  let initializer: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      initializer = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(initializer, `Production variable ${name} must exist`);
  return initializer.getText(source);
}

function visibilityEffect(): ts.CallExpression {
  let effect: ts.CallExpression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)
      && node.expression.getText(source) === 'useLayoutEffect'
      && node.arguments[0]?.getText(source).includes('const mt5DismissAlreadyCompleted')) {
      effect = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(effect, 'Production visibility layout effect must exist');
  return effect;
}

function createSheet(entryMotion: 'instant' | 'mt5Slide') {
  const ref = <T>(current: T) => ({ current });
  const value = (initial: number) => ({
    value: initial,
    stopAnimation() {},
    setValue(next: number) { this.value = next; },
  });
  const overlay: Record<string, unknown> = { pointerEvents: 'auto', style: { opacity: 1 } };
  const body: Record<string, unknown> = { pointerEvents: 'auto' };
  let barrier = true;
  const environment = {
    visible: true,
    openRevision: 1,
    prevOpenRevisionRef: ref(1),
    visibilityChanged: false,
    activeEntryMotion: entryMotion as 'instant' | 'mt5Slide',
    activeMt5SlideMotionProfile: 'default',
    activeImmediateHostHideOnClose: true,
    activeDeferOffscreenActions: true,
    activeVisualKey: 'chart.drawingTools',
    retainedMt5RevealInFlight: false,
    hostHiddenImperativelyRef: ref(false),
    retainedVisualOwnerRef: ref<unknown>(null),
    retainedAdoptionVisualKeyRef: ref<string | null>(null),
    entryAnimationStartedForOpenRef: ref(false),
    mt5DismissCompletedRef: ref(false),
    mt5ConfigSwapRevealCancelRef: ref<null | (() => void)>(null),
    mt5ConfigSwapAnimationCancelRef: ref<null | (() => void)>(null),
    mt5ConfigSwapAnimationPendingRef: ref(false),
    mt5ConfigSwapHostParkedRef: ref(false),
    reactVisibleRef: ref(true),
    activeVisualKeyRef: ref('chart.drawingTools'),
    prevVisibleRef: ref(true),
    closeAnimationRunningRef: ref(false),
    openedAtRef: ref(1),
    overlayLayerRef: ref({ setNativeProps: (props: object) => Object.assign(overlay, props) }),
    sheetBodyRef: ref({ setNativeProps: (props: object) => Object.assign(body, props) }),
    searchInputRef: ref({ blur() {} }),
    actionListRef: ref({ scrollToOffset() {} }),
    overlayOpacity: value(1),
    sheetTranslateY: value(0),
    mt5HostOpacity: value(1),
    mt5OverlayOpacity: value(1),
    mt5SheetTranslateY: value(0),
    ACTION_SHEET_INSTANT_OPEN_OPACITY: 1,
    ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y: 0,
    ACTION_SHEET_OPEN_TRANSLATE_Y: 28,
    resolveMt5EntryTranslateY: () => 400,
    setVisibilityBarrierNow: (visible: boolean) => { barrier = visible; },
    cancelRetainedActionSheetPreview() {},
    refreshHiddenConfig() {},
    refreshMt5ConfigSwapGuard() {},
    writeMt5ActionSheetValuesOnUI() {},
    startActionSheetEntryAnimation() {},
    scheduleAfterVisualFrame: (action: () => void) => { action(); return () => {}; },
  };
  const context = createContext(environment);
  const evaluateCallback = (text: string) => runInContext(ts.transpileModule(`(${text})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  Object.assign(environment, {
    hideMt5ActionSheetHostNow: evaluateCallback(callbackSource('hideMt5ActionSheetHostNow')),
  });
  const effect = visibilityEffect();
  const commitVisibility = evaluateCallback(effect.arguments[0].getText(source)) as () => void;
  let previousDependencies: unknown[] | undefined;
  const renderVisibility = () => {
    environment.visibilityChanged = evaluateCallback(variableInitializerSource('visibilityChanged'));
    const dependencies = evaluateCallback(effect.arguments[1].getText(source)) as unknown[];
    const changed = !previousDependencies || dependencies.some((value, index) => (
      !Object.is(value, previousDependencies?.[index])
    ));
    previousDependencies = dependencies;
    if (changed) commitVisibility();
    return changed;
  };
  return {
    environment,
    overlay,
    body,
    get barrier() { return barrier; },
    hide: evaluateCallback(callbackSource('hideMt5ActionSheetNow')) as () => boolean,
    applyRetained: evaluateCallback(callbackSource('applyRetainedVisualSnapshot')) as (snapshot: object) => boolean,
    commitVisibility,
    renderVisibility,
  };
}

test('retained Drawing Tools reveal clears an earlier native hide before React adopts it', () => {
  const sheet = createSheet('instant');
  assert.equal(sheet.hide(), true);
  sheet.environment.reactVisibleRef.current = false;
  sheet.environment.visible = false;

  assert.equal(sheet.applyRetained({
    mode: 'committed', visualKey: 'chart.drawingTools', revision: 1,
  }), true);

  assert.equal(sheet.barrier, true);
  assert.equal(sheet.overlay.pointerEvents, 'auto');
  assert.equal(resolveActionSheetVisibilityBarrierOpen({
    visible: false,
    hiddenImperatively: sheet.environment.hostHiddenImperativelyRef.current,
    configSwapParked: sheet.environment.mt5ConfigSwapHostParkedRef.current,
    startingClose: false,
    retainedCommitOwnsHost: true,
  }), true, 'a hidden React render must preserve the accepted retained Drawing Tools reveal');
});

test('Drawing Tools recovers when More close and Drawing Tools open share one React commit', () => {
  const sheet = createSheet('mt5Slide');
  assert.equal(sheet.hide(), true);
  assert.equal(sheet.overlay.pointerEvents, 'none');

  // A close/open can be batched: the new instant configuration commits while
  // React still sees visible=true from the outgoing More menu.
  sheet.environment.activeEntryMotion = 'instant';
  sheet.commitVisibility();

  assert.equal(sheet.barrier, true, 'the incoming Drawing Tools menu must reveal its native parent');
  assert.equal(sheet.overlay.pointerEvents, 'auto');
  assert.equal(sheet.body.pointerEvents, 'auto');
  assert.equal(sheet.environment.hostHiddenImperativelyRef.current, false);
  assert.equal(sheet.environment.sheetTranslateY.value, 0);
});

test('Drawing Tools still restores a hidden host on an ordinary visibility edge', () => {
  const sheet = createSheet('instant');
  sheet.hide();
  sheet.environment.visibilityChanged = true;
  sheet.environment.prevVisibleRef.current = false;
  sheet.commitVisibility();

  assert.equal(sheet.barrier, true);
  assert.equal(sheet.overlay.pointerEvents, 'auto');
  assert.equal(sheet.body.pointerEvents, 'auto');
  assert.equal(sheet.environment.hostHiddenImperativelyRef.current, false);
});

for (const entryMotion of ['instant', 'mt5Slide'] as const) {
  const menuName = entryMotion === 'instant' ? 'Drawing Tools' : 'More';
  test(`${menuName} close and identical reopen reruns the actual visibility effect`, () => {
    const sheet = createSheet(entryMotion);
    sheet.renderVisibility();
    assert.equal(sheet.hide(), true);
    assert.equal(sheet.barrier, false);

    // Both store updates land before React commits. All presentation props,
    // including visible=true, are unchanged; only this explicit open is new.
    sheet.environment.openRevision++;
    assert.equal(sheet.renderVisibility(), true, 'a fresh open must invalidate the real effect dependency list');
    assert.equal(sheet.barrier, true, `${menuName} must not remain invisible after a fresh open`);
    assert.equal(sheet.overlay.pointerEvents, 'auto');
    assert.equal(sheet.body.pointerEvents, 'auto');
    assert.equal(sheet.environment.hostHiddenImperativelyRef.current, false);
  });
}
