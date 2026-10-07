import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  resolveActionSheetBottomInset,
  resolveActionSheetFloor,
  resolveActionSheetInitialMeasuredHeight,
  resolveActionSheetMeasuredHeight,
  resolveActionSheetMt5EntryTranslateY,
  resolveActionSheetOpenMeasuredHeight,
  resolveActionSheetVisibilityBarrierOpen,
} from './layout';

const readActionSheetSource = () =>
  readFileSync(resolve(process.cwd(), 'src/ui/components/ActionSheet/ActionSheet.tsx'), 'utf8');

const readActionSheetStylesSource = () =>
  readFileSync(resolve(process.cwd(), 'src/ui/components/ActionSheet/styles.ts'), 'utf8');

test('a logically hidden retained host cannot expose stale backdrop pixels', () => {
  assert.equal(resolveActionSheetVisibilityBarrierOpen({
    visible: false,
    hiddenImperatively: false,
    configSwapParked: false,
    startingClose: false,
    retainedCommitOwnsHost: false,
  }), false);
  assert.equal(resolveActionSheetVisibilityBarrierOpen({
    visible: true,
    hiddenImperatively: false,
    configSwapParked: false,
    startingClose: false,
    retainedCommitOwnsHost: false,
  }), true);
  assert.equal(resolveActionSheetVisibilityBarrierOpen({
    visible: true,
    hiddenImperatively: true,
    configSwapParked: false,
    startingClose: false,
    retainedCommitOwnsHost: false,
  }), false);
  assert.equal(resolveActionSheetVisibilityBarrierOpen({
    visible: false,
    hiddenImperatively: true,
    configSwapParked: true,
    startingClose: false,
    retainedCommitOwnsHost: true,
  }), false);
  assert.equal(resolveActionSheetVisibilityBarrierOpen({
    visible: false,
    hiddenImperatively: false,
    configSwapParked: false,
    startingClose: true,
    retainedCommitOwnsHost: false,
  }), true);
  assert.equal(resolveActionSheetVisibilityBarrierOpen({
    visible: false,
    hiddenImperatively: true,
    configSwapParked: false,
    startingClose: true,
    retainedCommitOwnsHost: false,
  }), false);
  assert.equal(resolveActionSheetVisibilityBarrierOpen({
    visible: false,
    hiddenImperatively: false,
    configSwapParked: true,
    startingClose: false,
    retainedCommitOwnsHost: true,
  }), false);
  assert.equal(resolveActionSheetVisibilityBarrierOpen({
    visible: false,
    hiddenImperatively: false,
    configSwapParked: false,
    startingClose: false,
    retainedCommitOwnsHost: true,
  }), true);

  const source = readActionSheetSource();
  const stylesSource = readActionSheetStylesSource();
  assert.match(
    source,
    /<View[\s\S]*ref=\{visibilityBarrierRef\}[\s\S]*opacity: visibilityBarrierOpen \? 1 : 0[\s\S]*<Animated\.View[\s\S]*ref=\{overlayLayerRef\}/,
    'the React-owned barrier must be a plain parent of every animated sheet pixel',
  );
  assert.match(source, /const setVisibilityBarrierNow = useCallback[\s\S]*opacity: nextVisible \? 1 : 0/);
  assert.match(stylesSource, /overlay:\s*\{[\s\S]*backgroundColor: 'transparent'/);
  assert.match(stylesSource, /backdropDefault:\s*\{[\s\S]*rgba\(0,0,0,0\.12\)/);
});

test('instant action sheets start from the visible window height', () => {
  assert.equal(
    resolveActionSheetInitialMeasuredHeight({
      instantOpen: true,
      screenHeight: 1640,
      windowHeight: 1512,
    }),
    1512,
  );
});

test('MT5 entry uses the resolved capped body instead of a stale or full-list measurement', () => {
  assert.equal(
    resolveActionSheetMt5EntryTranslateY({
      estimatedTranslateY: 432,
      measuredSheetBodyHeight: 1640,
    }),
    432,
  );
  assert.equal(
    resolveActionSheetMt5EntryTranslateY({
      estimatedTranslateY: 697,
      measuredSheetBodyHeight: 431,
    }),
    697,
  );
  assert.equal(
    resolveActionSheetMt5EntryTranslateY({
      estimatedTranslateY: 0,
      measuredSheetBodyHeight: 420,
    }),
    421,
  );
});

test('animated action sheets start from the visible window height to match overlay layout', () => {
  assert.equal(
    resolveActionSheetInitialMeasuredHeight({
      instantOpen: false,
      screenHeight: 1640,
      windowHeight: 900,
    }),
    900,
  );
});

test('android action sheets ignore transient oversized bottom safe-area values', () => {
  assert.equal(resolveActionSheetBottomInset(91, 'android'), 24);
  assert.equal(resolveActionSheetBottomInset(21, 'android'), 24);
  assert.equal(resolveActionSheetBottomInset(0, 'android'), 12);
});

test('ios action sheets preserve native bottom safe-area values', () => {
  assert.equal(resolveActionSheetBottomInset(34, 'ios'), 34);
  assert.equal(resolveActionSheetBottomInset(0, 'ios'), 12);
});

test('adaptive action sheets keep a stable minimum height instead of shrinking to short content', () => {
  assert.equal(
    resolveActionSheetFloor({
      detent: 'adaptive',
      searchable: false,
      availableWindowHeight: 1600,
    }),
    736,
  );
  assert.equal(
    resolveActionSheetFloor({
      detent: 'adaptive',
      searchable: false,
      availableWindowHeight: 680,
    }),
    420,
  );
});

test('large and searchable action sheet floors preserve their existing detents', () => {
  assert.equal(
    resolveActionSheetFloor({
      detent: 'large',
      searchable: true,
      availableWindowHeight: 1600,
    }),
    1408,
  );
  assert.equal(
    resolveActionSheetFloor({
      detent: 'adaptive',
      searchable: true,
      availableWindowHeight: 1600,
    }),
    864,
  );
  assert.equal(
    resolveActionSheetFloor({
      detent: 'auto',
      searchable: false,
      availableWindowHeight: 1600,
    }),
    0,
  );
});

test('instant action sheets do not reset downward on reopen', () => {
  assert.equal(
    resolveActionSheetOpenMeasuredHeight({
      previousHeight: 1640,
      instantOpen: true,
      screenHeight: 1640,
      windowHeight: 1512,
    }),
    1640,
  );
});

test('instant action sheet reopen height is capped to the current device height', () => {
  assert.equal(
    resolveActionSheetOpenMeasuredHeight({
      previousHeight: 1640,
      instantOpen: true,
      screenHeight: 720,
      windowHeight: 680,
    }),
    720,
  );
});

test('animated action sheets reset to the visible window height on open', () => {
  assert.equal(
    resolveActionSheetOpenMeasuredHeight({
      previousHeight: 1640,
      instantOpen: false,
      screenHeight: 1640,
      windowHeight: 900,
    }),
    900,
  );
});

test('initial action sheet height falls back to screen height when window height is unavailable', () => {
  assert.equal(
    resolveActionSheetInitialMeasuredHeight({
      instantOpen: false,
      screenHeight: 1784,
      windowHeight: 0,
    }),
    1784,
  );
});

test('instant action sheets keep the first visible height when overlay layout is shorter', () => {
  assert.equal(
    resolveActionSheetMeasuredHeight({
      previousHeight: 1512,
      layoutHeight: 1420,
      instantOpen: true,
      hasMeasuredLayout: false,
    }),
    1512,
  );
});

test('animated action sheets do not shrink when the first overlay layout is shorter than the screen', () => {
  assert.equal(
    resolveActionSheetMeasuredHeight({
      previousHeight: 1784,
      layoutHeight: 1640,
      instantOpen: false,
      hasMeasuredLayout: false,
    }),
    1784,
  );
});

test('after first layout action sheets only ratchet upward', () => {
  assert.equal(
    resolveActionSheetMeasuredHeight({
      previousHeight: 1420,
      layoutHeight: 900,
      instantOpen: true,
      hasMeasuredLayout: true,
    }),
    1420,
  );

  assert.equal(
    resolveActionSheetMeasuredHeight({
      previousHeight: 1420,
      layoutHeight: 1512,
      instantOpen: true,
      hasMeasuredLayout: true,
    }),
    1512,
  );
});

test('MT5 entry stays on the Reanimated UI runtime with capped body geometry', () => {
  const source = readActionSheetSource();

  assert.match(
    source,
    /import Reanimated, \{[\s\S]*executeOnUIRuntimeSync,[\s\S]*useAnimatedStyle,[\s\S]*useSharedValue,[\s\S]*withDelay,[\s\S]*withTiming,[\s\S]*type SharedValue,[\s\S]*\} from 'react-native-reanimated'/,
  );
  assert.match(
    source,
    /const mt5OverlayOpacity = useSharedValue\(0\)[\s\S]*const mt5HostOpacity = useSharedValue\(0\)[\s\S]*const mt5SheetTranslateY = useSharedValue\(28\)/,
  );
  assert.match(
    source,
    /const mt5BackdropAnimatedStyle = useAnimatedStyle\(\(\) => \(\{[\s\S]*opacity: mt5HostOpacity\.value \* mt5OverlayOpacity\.value/,
  );
  assert.match(
    source,
    /const mt5SheetBodyAnimatedStyle = useAnimatedStyle\(\(\) => \(\{[\s\S]*opacity: mt5HostOpacity\.value,[\s\S]*transform: \[\{ translateY: mt5SheetTranslateY\.value \}\]/,
  );

  const uiValueWriterStart = source.indexOf('const writeMt5ActionSheetValuesOnUI');
  const entryAnimationEnd = source.indexOf(
    'const startActionSheetExitAnimation',
    uiValueWriterStart,
  );
  assert.notEqual(uiValueWriterStart, -1);
  assert.notEqual(entryAnimationEnd, -1);
  const uiEntrySource = source.slice(uiValueWriterStart, entryAnimationEnd);

  assert.match(
    uiEntrySource,
    /executeOnUIRuntimeSync\(\([\s\S]*'worklet';[\s\S]*cancelReanimatedAnimation\(nextHostValue\)[\s\S]*cancelReanimatedAnimation\(nextOverlayValue\)[\s\S]*cancelReanimatedAnimation\(nextSheetValue\)[\s\S]*nextHostValue\.value = 0[\s\S]*nextOverlayValue\.value = nextOpacity[\s\S]*nextSheetValue\.value = nextTranslateY/,
  );
  assert.match(
    uiEntrySource,
    /if \(isMt5Slide && mt5HostOpacity && mt5OverlayOpacity && mt5SheetTranslateY\) \{[\s\S]*executeOnUIRuntimeSync\(\([\s\S]*hostValue\.value = 0;[\s\S]*overlayValue\.value = 0;[\s\S]*sheetValue\.value = entryTranslateY;[\s\S]*hostValue\.value = withDelay\([\s\S]*primeDelayMs,[\s\S]*withTiming\(1, \{ duration: 0 \}\)/,
  );
  assert.match(
    uiEntrySource,
    /overlayValue\.value = withDelay\([\s\S]*primeDelayMs,[\s\S]*withTiming\(1, \{[\s\S]*duration: overlayDurationMs,[\s\S]*easing: ReanimatedEasing\.out\(ReanimatedEasing\.cubic\)/,
  );
  assert.match(
    uiEntrySource,
    /sheetValue\.value = withDelay\([\s\S]*primeDelayMs,[\s\S]*withTiming\(0, \{[\s\S]*duration: sheetDurationMs,[\s\S]*easing: ReanimatedEasing\.out\(ReanimatedEasing\.cubic\)/,
  );
  assert.match(
    uiEntrySource,
    /\}\)\(\s*mt5HostOpacity,\s*mt5OverlayOpacity,\s*mt5SheetTranslateY,\s*mt5TranslateY,\s*ACTION_SHEET_MT5_OPEN_PRIME_DELAY_MS,\s*mt5OverlayDurationMs,\s*mt5SheetDurationMs,\s*\)/,
  );
  assert.ok(
    uiEntrySource.indexOf('executeOnUIRuntimeSync') <
      uiEntrySource.indexOf('sheetTranslateY.setValue(isMt5Slide'),
    'MT5 must return through the UI-runtime path before the RN Animated fallback',
  );

  const cappedGeometryStart = source.indexOf('const sheetMaxHeight = Math.min(');
  const cappedGeometryEnd = source.indexOf(
    'const sheetFloorMinHeight',
    cappedGeometryStart,
  );
  assert.notEqual(cappedGeometryStart, -1);
  assert.notEqual(cappedGeometryEnd, -1);
  const cappedGeometrySource = source.slice(cappedGeometryStart, cappedGeometryEnd);
  assert.match(
    cappedGeometrySource,
    /Math\.min\([\s\S]*maxVisibleHeight,[\s\S]*sheetTargetHeight,[\s\S]*reservedChromeHeight \+ maximumActionsViewportHeight/,
  );
  assert.match(
    cappedGeometrySource,
    /mt5EntryTranslateYRef\.current = Math\.max\(160, sheetMaxHeight \+ 1\)/,
  );
  assert.doesNotMatch(
    cappedGeometrySource,
    /activeActions\.reduce|measuredSheetBodyHeightRef\.current/,
    'the capped MT5 entry distance must not be rebuilt from offscreen rows or stale body layout',
  );

  assert.match(
    source,
    /const sheetBodyTranslateY = activeEntryMotion === 'instant' \|\| activeEntryMotion === 'mt5Slide'[\s\S]*\? 0[\s\S]*: sheetTranslateY/,
  );
  assert.doesNotMatch(source, /shouldSeedMt5EntryTransform/);
  assert.match(
    source,
    /const renderedSheetBody = activeEntryMotion === 'mt5Slide' \? \([\s\S]*<Reanimated\.View style=\{\[styles\.sheetContainer, mt5SheetBodyAnimatedStyle\]\}>[\s\S]*\{sheetBody\}/,
  );
  assert.match(
    source,
    /activeEntryMotion === 'mt5Slide' \? \([\s\S]*<Reanimated\.View[\s\S]*styles\.backdropMt5Plain,[\s\S]*mt5BackdropAnimatedStyle/,
  );
});

test('an alternating MT5 config is parked before React can paint replacement rows', () => {
  const source = readActionSheetSource();
  const parkerStart = source.indexOf('const parkRetainedHostForConfigSwap');
  const visibilityEffectStart = source.indexOf(
    'useLayoutEffect(() => {',
    parkerStart,
  );
  const visibilityEffectEnd = source.indexOf(
    'const applyRetainedVisualSnapshot',
    visibilityEffectStart,
  );
  assert.notEqual(parkerStart, -1);
  assert.notEqual(visibilityEffectStart, -1);
  assert.notEqual(visibilityEffectEnd, -1);

  const parkerSource = source.slice(parkerStart, visibilityEffectStart);
  assert.match(
    parkerSource,
    /activeVisualKeyRef\.current !== expectedVisualKey[\s\S]*pendingActionCancelRef\.current\(\)[\s\S]*retainedVisualOwnerRef\.current = null[\s\S]*entryAnimationStartedForOpenRef\.current = false/,
  );
  assert.match(
    parkerSource,
    /mt5ConfigSwapHostParkedRef\.current = true[\s\S]*refreshMt5ConfigSwapGuard[\s\S]*writeMt5ActionSheetValuesOnUI\([\s\S]*mt5HostOpacity,[\s\S]*mt5OverlayOpacity,[\s\S]*mt5SheetTranslateY,[\s\S]*0,[\s\S]*entryTranslateY[\s\S]*style: \{ opacity: 0 \}[\s\S]*hostHiddenImperativelyRef\.current = true/,
  );
  assert.match(
    parkerSource,
    /registerRetainedActionSheetHostParker\(parkRetainedHostForConfigSwap\)/,
  );

  const visibilityEffectSource = source.slice(
    visibilityEffectStart,
    visibilityEffectEnd,
  );
  assert.match(
    visibilityEffectSource,
    /const shouldPrepareParkedMt5Open =[\s\S]*visible &&[\s\S]*activeEntryMotion === 'mt5Slide' &&[\s\S]*hostHiddenImperativelyRef\.current[\s\S]*const shouldReleaseParkedMt5Open =[\s\S]*mt5ConfigSwapAnimationPendingRef\.current &&[\s\S]*!mt5ConfigSwapHostParkedRef\.current[\s\S]*!shouldPrepareParkedMt5Open &&[\s\S]*!shouldReleaseParkedMt5Open/,
  );
  assert.match(
    visibilityEffectSource,
    /if \(shouldPrepareParkedMt5Open\) \{[\s\S]*mt5ConfigSwapHostParkedRef\.current = true;[\s\S]*mt5ConfigSwapAnimationPendingRef\.current = true;[\s\S]*writeMt5ActionSheetValuesOnUI\(/,
  );
  const seedIndex = visibilityEffectSource.indexOf('writeMt5ActionSheetValuesOnUI(');
  const restoreIndex = visibilityEffectSource.indexOf('if (hostHiddenImperativelyRef.current)');
  const startIndex = visibilityEffectSource.indexOf('startActionSheetEntryAnimation({');
  assert.ok(seedIndex >= 0 && seedIndex < restoreIndex);
  assert.ok(restoreIndex >= 0 && restoreIndex < startIndex);
  assert.match(
    visibilityEffectSource.slice(startIndex),
    /startActionSheetEntryAnimation\([\s\S]*entryAnimationStartedForOpenRef\.current = true/,
  );
  assert.match(
    visibilityEffectSource,
    /if \(retainedMt5RevealInFlight\) \{[\s\S]*mt5ConfigSwapAnimationPendingRef\.current = false[\s\S]*scheduleAfterVisualFrame\(\(\) => \{[\s\S]*mt5ConfigSwapHostParkedRef\.current = false[\s\S]*refreshMt5ConfigSwapGuard/,
  );
  assert.match(
    visibilityEffectSource,
    /mt5ConfigSwapHostParkedRef\.current = false[\s\S]*setNativeProps\(\{ style: \{ opacity: 1 \} \}\)[\s\S]*mt5ConfigSwapAnimationCancelRef\.current = scheduleAfterVisualFrame\(\(\) => \{[\s\S]*startActionSheetEntryAnimation\(\{[\s\S]*mt5ConfigSwapAnimationPendingRef\.current = false/,
  );
  assert.match(
    source,
    /activeEntryMotion === 'mt5Slide'[\s\S]*&& mt5ConfigSwapAnimationPendingRef\.current[\s\S]*A parked config swap owns its two-phase release[\s\S]*return;[\s\S]*if \(entryAnimationStartedForOpenRef\.current\)/,
  );
});

test('android instant sheets keep final-frame opening while MT5 sheets snap the whole host closed', () => {
  const source = readActionSheetSource();

  assert.match(
    source,
    /activeConfig\.instantOpen \?\? true/,
  );
  assert.match(
    source,
    /instant sheets start from the visible window/,
  );
  assert.match(
    source,
    /ACTION_SHEET_INSTANT_OPEN_OPACITY = 1/,
  );
  assert.match(
    source,
    /ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y = 0/,
  );
  assert.match(
    source,
    /if \(mode === 'instant'\) \{/,
  );
  assert.match(
    source,
    /if \(mode === 'instant'\) \{[\s\S]*overlayOpacity\.setValue\(ACTION_SHEET_INSTANT_OPEN_OPACITY\);[\s\S]*sheetTranslateY\.setValue\(ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y\);[\s\S]*return;/,
  );
  assert.match(
    source,
    /ACTION_SHEET_OPEN_OVERLAY_DURATION_MS = 50/,
  );
  assert.match(
    source,
    /ACTION_SHEET_OPEN_SHEET_DURATION_MS = 50/,
  );
  assert.match(source, /ACTION_SHEET_MT5_OPEN_OVERLAY_DURATION_MS = 180/);
  assert.match(source, /ACTION_SHEET_MT5_OPEN_SHEET_DURATION_MS = 210/);
  assert.match(source, /ACTION_SHEET_MT5_OPEN_PRIME_DELAY_MS = 18/);
  assert.doesNotMatch(source, /ACTION_SHEET_MT5_CLOSE_OVERLAY_DURATION_MS/);
  assert.doesNotMatch(source, /ACTION_SHEET_MT5_CLOSE_SHEET_DURATION_MS/);
  assert.match(source, /const isMt5Slide = mode === 'mt5Slide'/);
  assert.match(source, /sheetTranslateY\.setValue\(isMt5Slide \? mt5TranslateY : ACTION_SHEET_OPEN_TRANSLATE_Y\)/);
  assert.match(source, /activeConfig\.entryMotion \?\? \([\s\S]*activeInstantOpen \? 'instant' : 'standard'/);
  assert.match(source, /const resolveMt5EntryTranslateY = useCallback\([\s\S]*resolveActionSheetMt5EntryTranslateY\([\s\S]*measuredSheetBodyHeight: measuredSheetBodyHeightRef\.current/);
  assert.match(source, /mt5EntryTranslateYRef\.current = Math\.max\(160, sheetMaxHeight \+ 1\)/);
  assert.doesNotMatch(
    source,
    /72 \+ activeActions\.reduce/,
    'virtualized MT5 entry distance must not use every offscreen action row',
  );
  assert.match(source, /ref=\{sheetBodyRef\}[\s\S]*onLayout=\{handleSheetBodyLayout\}/);
  assert.match(source, /startActionSheetEntryAnimation\(\{[\s\S]*mode: activeEntryMotion,[\s\S]*mt5TranslateY: resolveMt5EntryTranslateY\(\)/);
  assert.match(source, /retainedMt5RevealInFlight/);
  assert.match(source, /retainedAdoptionVisualKeyRef\.current === activeVisualKey/);
  assert.match(source, /runEntryAnimation\(activeEntryMotion\)/);
  assert.match(
    source,
    /easing: Easing\.out\(Easing\.cubic\)/,
  );
  assert.match(
    source,
    /pointerEvents=\{visible \? 'auto' : 'none'\}/,
  );
  assert.match(source, /ref=\{overlayLayerRef\}[\s\S]*collapsable=\{false\}/);
  assert.match(source, /ref=\{sheetBodyRef\}[\s\S]*collapsable=\{false\}/);
  assert.match(source, /getRetainedActionSheetVisualSnapshot\(\)/);
  assert.match(source, /const reactVisibleRef = useRef\(visible\)/);
  assert.match(source, /if \(wantsVisible && reactVisibleRef\.current\) \{[\s\S]*return false;/);
  assert.match(source, /retainedSnapshot\.mode === 'committed'/);
  assert.match(source, /retainedSnapshot\.visualKey === activeVisualKey/);
  assert.match(source, /applyRetainedVisualSnapshot\(retainedSnapshot\)/);
  assert.match(
    source,
    /if \(!visible && !mounted\) \{/,
  );
  assert.match(source, /ACTION_SHEET_CLOSE_SHEET_DURATION_MS = 50/);
  assert.match(source, /const closeSheetTranslateY = instantOpen \? 80 : ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y/);
  assert.match(source, /toValue: closeSheetTranslateY/);
  assert.match(
    source,
    /const sheetBodyTranslateY = activeEntryMotion === 'instant' \|\| activeEntryMotion === 'mt5Slide'[\s\S]*\? 0[\s\S]*: sheetTranslateY/,
  );
  assert.doesNotMatch(source, /shouldSeedMt5EntryTransform/);
  assert.match(source, /transform: \[\{ translateY: sheetBodyTranslateY \}\]/);
  assert.match(
    source,
    /const hideMt5ActionSheetHostNow = useCallback\(\(\) => \{[\s\S]*activeEntryMotion !== 'mt5Slide' && !activeImmediateHostHideOnClose[\s\S]*overlayLayerRef\.current\?\.setNativeProps\(\{[\s\S]*style: \{ opacity: 0 \}[\s\S]*accessibilityElementsHidden: true[\s\S]*importantForAccessibility: 'no-hide-descendants'[\s\S]*pointerEvents: 'none'[\s\S]*return true;/,
  );
  assert.match(
    source,
    /const hideMt5ActionSheetNow = useCallback\(\(\) => \{[\s\S]*hideMt5ActionSheetHostNow\(\)[\s\S]*cancelRetainedActionSheetPreview\(\);[\s\S]*retainedVisualOwnerRef\.current = null;[\s\S]*retainedAdoptionVisualKeyRef\.current = null;[\s\S]*overlayOpacity\.stopAnimation\(\);[\s\S]*sheetTranslateY\.stopAnimation\(\);[\s\S]*overlayOpacity\.setValue\(0\);[\s\S]*sheetTranslateY\.setValue\(resolveMt5EntryTranslateY\(\)\);[\s\S]*closeAnimationRunningRef\.current = false;[\s\S]*mt5DismissCompletedRef\.current = true;[\s\S]*sheetBodyRef\.current\?\.setNativeProps\(\{ pointerEvents: 'none' \}\);/,
  );
  assert.match(
    source,
    /const hideMt5ActionSheetNow = useCallback\(\(\) => \{[\s\S]*hideMt5ActionSheetHostNow\(\)[\s\S]*searchInputRef\.current\?\.blur\(\);/,
  );
  assert.match(
    source,
    /const hideMt5ActionSheetNow = useCallback\(\(\) => \{[\s\S]*mt5ConfigSwapRevealCancelRef\.current\(\)[\s\S]*mt5ConfigSwapAnimationCancelRef\.current\(\)[\s\S]*mt5ConfigSwapAnimationPendingRef\.current = false;[\s\S]*writeMt5ActionSheetValuesOnUI\(/,
  );
  assert.match(
    source,
    /if \(wantsVisible && activeEntryMotion === 'mt5Slide'\) \{[\s\S]*mt5ConfigSwapRevealCancelRef\.current\(\)[\s\S]*mt5ConfigSwapAnimationCancelRef\.current\(\)[\s\S]*mt5ConfigSwapAnimationPendingRef\.current = false;[\s\S]*mt5ConfigSwapHostParkedRef\.current = false;[\s\S]*writeMt5ActionSheetValuesOnUI\([\s\S]*style: \{ opacity: interactive \? 1 : 0 \}[\s\S]*hostHiddenImperativelyRef\.current = !interactive;[\s\S]*startActionSheetEntryAnimation\(/,
  );
  assert.match(
    source,
    /const dismissActionSheet = useCallback\(\(\) => \{\s*hideMt5ActionSheetNow\(\);\s*onClose\(\);/,
  );
  assert.match(source, /const mt5DismissAlreadyCompleted = !visible && mt5DismissCompletedRef\.current/);
  assert.match(source, /handleBackdropPress[\s\S]*dismissActionSheet\(\)/);
  const passiveVisibilityEffectStart = source.indexOf(
    '// A hidden-render passive effect can be queued before retained adoption',
  );
  const passiveVisibilityEffectEnd = source.indexOf(
    'if (visible || !pendingActionRef.current)',
    passiveVisibilityEffectStart,
  );
  assert.notEqual(passiveVisibilityEffectStart, -1);
  assert.notEqual(passiveVisibilityEffectEnd, -1);
  const passiveVisibilityEffectSource = source.slice(
    passiveVisibilityEffectStart,
    passiveVisibilityEffectEnd,
  );
  assert.match(
    passiveVisibilityEffectSource,
    /if \(activeEntryMotion === 'mt5Slide' \|\| activeImmediateHostHideOnClose\) \{[\s\S]*setKeyboardHeight\(0\);[\s\S]*hasMeasuredOverlayRef\.current = false;[\s\S]*return;/,
  );
  assert.doesNotMatch(
    passiveVisibilityEffectSource,
    /hideMt5ActionSheetNow\(\)/,
    'a stale passive close must not hide a newly opening native host',
  );
  assert.match(
    passiveVisibilityEffectSource,
    /if \(!reactVisibleRef\.current\) \{\s*return;\s*\}[\s\S]*setMounted\(true\);[\s\S]*runEntryAnimation\(activeEntryMotion\)/,
    'a stale visible passive effect must not reveal a sheet React already closed',
  );
  assert.match(
    source,
    /if \(!activeRunActionAfterClose\) \{[\s\S]*pendingActionRef\.current = null;[\s\S]*hideMt5ActionSheetHostNow\(\);[\s\S]*try \{[\s\S]*actionPress\?\.\(\);[\s\S]*finally \{[\s\S]*hideMt5ActionSheetNow\(\);[\s\S]*onClose\(\);/,
  );
  assert.match(source, /const hostHiddenImperativelyRef = useRef\(false\)/);
  assert.match(
    source,
    /if \(visible\) \{[\s\S]*if \(hostHiddenImperativelyRef\.current\) \{[\s\S]*activeEntryMotion === 'mt5Slide' \? \{\} : \{ style: \{ opacity: 1 \} \}[\s\S]*pointerEvents: 'auto'[\s\S]*hostHiddenImperativelyRef\.current = false/,
  );
  assert.match(source, /overlayLayerRef\.current\?\.setNativeProps\(\{\s*style: \{ opacity: 0 \},[\s\S]*hostHiddenImperativelyRef\.current = true/);
  assert.match(source, /const maximumVisibleActionRowCount = activeMaximumVisibleActionRows[\s\S]*Math\.floor\(activeMaximumVisibleActionRows\)/);
  assert.match(source, /const maximumActionsViewportHeight = maximumVisibleActionRowCount[\s\S]*activeActions[\s\S]*slice\(0, maximumVisibleActionRowCount\)[\s\S]*ACTION_SHEET_SUBTITLE_ROW_MIN_HEIGHT[\s\S]*reservedChromeHeight \+ maximumActionsViewportHeight/);
  assert.match(source, /const hasVariableActionRowHeights = \(hasSubtitleActionRows && hasPlainActionRows\) \|\| wrapActionText[\s\S]*uniformActionRowHeight = hasSubtitleActionRows[\s\S]*ACTION_SHEET_SUBTITLE_ROW_MIN_HEIGHT/);
  assert.match(source, /const estimatedVisibleActionRows = Math\.max\(1,[\s\S]*usableViewportHeight[\s\S]*ACTION_SHEET_SUBTITLE_ROW_MIN_HEIGHT[\s\S]*occupiedHeight >= usableViewportHeight/);
  assert.match(source, /deferredInitialActionRows = maximumVisibleActionRowCount[\s\S]*Math\.min\(maximumVisibleActionRowCount, estimatedVisibleActionRows\)[\s\S]*progressiveOpenCap = activeDeferOffscreenActions[\s\S]*\? Math\.max\(deferredInitialActionRows/);
  assert.match(
    source,
    /initialNumToRender=\{initialActionRowsToRender\}[\s\S]*windowSize=\{actionListWindowSize\}[\s\S]*getItemLayout=\{hasVariableActionRowHeights/,
  );
  assert.match(source, /const actionListWindowSize = activeDeferOffscreenActions \? 7 : 3/);
  assert.match(source, /const actionListNeedsScroll = scrollSheetChrome \|\| estimatedFilteredActionsHeight > actionsMaxHeight/);
  assert.match(source, /actionListNeedsScroll\s*\? \{ height: actionsMaxHeight \}/);
  assert.match(
    source,
    /activeDetent === 'large'\s*\?\s*Number\.POSITIVE_INFINITY\s*:\s*reservedChromeHeight \+ maximumActionsViewportHeight/,
  );
  assert.match(source, /length: uniformActionRowHeight,[\s\S]*offset: uniformActionRowHeight \* index/);
  assert.match(source, /const deferredActionListKey = activeDeferOffscreenActions[\s\S]*activeVisualKey \?\? 'deferred-action-list'/);
  assert.match(source, /key=\{deferredActionListKey\}/);
  assert.match(source, /const handleSearchQueryChange = useCallback[\s\S]*activeDeferOffscreenActions[\s\S]*scrollToOffset\(\{ offset: 0, animated: false \}\)[\s\S]*setQuery\(nextQuery\)/);
  assert.match(source, /if \(!visible\)[\s\S]*activeDeferOffscreenActions[\s\S]*scrollToOffset\(\{ offset: 0, animated: false \}\)[\s\S]*activeSearchable && query\.length > 0[\s\S]*setQuery\(''\)/);
  assert.match(source, /if \(activeDeferOffscreenActions\)[\s\S]*actionListRef\.current\?\.scrollToOffset\(\{ offset: 0, animated: false \}\)[\s\S]*return true/);
  assert.match(source, /onChangeText=\{handleSearchQueryChange\}/);
  assert.match(source, /removeClippedSubviews=\{[\s\S]*Platform\.OS === 'android'[\s\S]*&& !activeDeferOffscreenActions[\s\S]*&& !hasVariableActionRowHeights/);
  assert.match(source, /isMt5StylePresentation \? styles\.overlayMt5Plain : null/);
  assert.match(source, /isMt5StylePresentation[\s\S]*opacity: activeEntryMotion === 'mt5Slide'[\s\S]*mt5ConfigSwapHostParkedRef\.current \|\| hostHiddenImperativelyRef\.current[\s\S]*\? 0[\s\S]*: 1[\s\S]*visible \? 1 : 0[\s\S]*\{ opacity: overlayOpacity \}/);
  assert.match(source, /styles\.backdropMt5Plain[\s\S]*mt5BackdropAnimatedStyle/);
  assert.match(source, /closeAnimationRunningRef\.current = false[\s\S]*refreshHiddenConfig/);
  assert.match(
    source,
    /sheetTranslateY\.setValue\(resolveMt5EntryTranslateY\(\)\);[\s\S]*closeAnimationRunningRef\.current = false;[\s\S]*refreshHiddenConfig\(\(revision\) => revision \+ 1\);/,
  );
  assert.doesNotMatch(source, /<Modal/);
  assert.doesNotMatch(source, /OVERLAY_MODAL_PROPS/);
  assert.doesNotMatch(source, /ACTION_SHEET_ANDROID_GEOMETRY_SETTLE_MS/);
  assert.doesNotMatch(source, /canPaintSheet/);
  assert.doesNotMatch(source, /shouldHideSheetForInitialLayout/);
  assert.doesNotMatch(source, /instantLayoutReady/);
});

test('android searchable sheets clamp to live overlay height during keyboard focus', () => {
  const source = readActionSheetSource();

  assert.match(source, /useWindowDimensions/);
  assert.match(source, /const \[currentOverlayHeight, setCurrentOverlayHeight\] = useState\(initialMeasuredHeight\)/);
  assert.match(source, /const \[keyboardHeight, setKeyboardHeight\] = useState\(0\)/);
  assert.match(source, /const activeAndroidKeyboardAvoidance = activeConfig\.androidKeyboardAvoidance \?\? 'event'/);
  assert.match(source, /const androidSearchableSheet\s*=\s*\n?\s*Platform\.OS === 'android' && activeSearchable/);
  assert.match(
    source,
    /const shouldLockSheetHeight = activeDetent === 'large' \|\| contentSizedAutoSheet/,
  );
  assert.match(source, /\? \{ height: sheetMaxHeight \}/);
  assert.match(source, /const contentSizedAutoSheet =[\s\S]*activeDetent === 'auto'[\s\S]*!activeSearchable/);
  assert.match(source, /const iosKeyboardAvoidanceEnabled =[\s\S]*Platform\.OS === 'ios' && activeSearchable && !keepFullHeightSheet/);
  assert.match(source, /iosKeyboardAvoidanceEnabled \? \([\s\S]*KeyboardAvoidingView/);
  assert.match(source, /sheetBottomSafePad > 0 \? \{ paddingBottom: sheetBottomSafePad \}/);
  assert.match(
    source,
    /const overlayKeyboardLift = androidSearchableSheet[\s\S]*measuredHeight - \(currentOverlayHeight \|\| measuredHeight\)/,
  );
  assert.match(
    source,
    /const windowKeyboardLift = androidSearchableSheet[\s\S]*measuredHeight - \(windowHeight \|\| measuredHeight\)/,
  );
  assert.match(source, /const eventKeyboardLift = androidSearchableSheet[\s\S]*activeAndroidKeyboardAvoidance === 'resize' \? 0 : Math\.max\(0, keyboardHeight\)/);
  assert.match(source, /const resizeKeyboardLift = Math\.max\(overlayKeyboardLift, windowKeyboardLift\)/);
  assert.match(source, /const effectiveKeyboardLift = Math\.max\(resizeKeyboardLift, eventKeyboardLift\)/);
  assert.match(source, /const unhandledKeyboardLift = Math\.max\(0, eventKeyboardLift - resizeKeyboardLift\)/);
  assert.match(source, /Keyboard\.addListener\('keyboardDidShow', handleKeyboardShow\)/);
  assert.match(source, /Keyboard\.addListener\('keyboardDidHide', handleKeyboardHide\)/);
  assert.match(
    source,
    /const syncOverlayHeightFromWindow = \(\) => \{[\s\S]*Dimensions\.get\('window'\)\.height[\s\S]*setCurrentOverlayHeight\(nextWindowHeight\)/,
  );
  assert.match(source, /syncOverlayHeightFromWindow\(\);\s*setKeyboardHeight\(nextKeyboardHeight\)/);
  assert.match(source, /setKeyboardHeight\(nextKeyboardHeight\)/);
  assert.match(
    source,
    /const measuredVisibleHeight = androidSearchableSheet[\s\S]*measuredHeight - effectiveKeyboardLift/,
  );
  assert.match(source, /const bottomSpacerHeight = unhandledKeyboardLift/);
  assert.match(source, /setCurrentOverlayHeight\(h\)/);
  assert.match(source, /const availableWindowHeight = Math\.max\(0, measuredVisibleHeight\)/);
  assert.match(source, /sheetHeightStyle/);
  assert.match(source, /height: bottomSpacerHeight/);
  assert.doesNotMatch(source, /height: bottomInset \+ keyboardLift/);
});

test('backdrop ignores the opening tap that created the action sheet', () => {
  const source = readActionSheetSource();

  assert.match(source, /const ACTION_SHEET_BACKDROP_OPEN_GUARD_MS = 60/);
  assert.match(source, /const openedAtRef = useRef\(visible \? Date\.now\(\) : 0\)/);
  assert.match(source, /openedAtRef\.current = Date\.now\(\)/);
  assert.match(source, /const handleBackdropPress = useCallback/);
  assert.match(source, /Date\.now\(\) - openedAtRef\.current < ACTION_SHEET_BACKDROP_OPEN_GUARD_MS/);
  assert.match(source, /onPress=\{handleBackdropPress\}/);
});

test('action sheet can center opt-in MT5 plain sheet titles', () => {
  const source = readActionSheetSource();

  assert.match(source, /titleAlign\?: 'left' \| 'center'/);
  assert.match(source, /const activeTitleAlign = activeConfig\.titleAlign/);
  assert.match(source, /const isTitleCentered = activeTitleAlign === 'center'/);
  assert.match(source, /isTitleCentered && styles\.titleContainerCentered/);
  assert.match(source, /isTitleCentered && styles\.titleTextCentered/);
});

test('muted action sheet rows look disabled while remaining tappable', () => {
  const source = readActionSheetSource();

  assert.match(source, /muted\?: boolean/);
  assert.match(source, /const isVisuallyMuted = isActiveDisabled \|\| action\.muted === true/);
  assert.match(
    source,
    /onPress=\{isActiveDisabled \? undefined : \(\) => handleActionRowPress\([\s\S]*action\.onPress,[\s\S]*action\.deferCloseCommitForVisualHandoff/,
  );
  assert.match(source, /disabled=\{isActiveDisabled\}/);
  assert.match(source, /isVisuallyMuted && \([\s\S]*styles\.actionTextDisabledMt5Plain : styles\.actionTextDisabled/);
});
