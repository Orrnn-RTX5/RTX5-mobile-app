import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('radial menu keeps every slot on the smaller derived ring', () => {
  const source = readSource('src/features/chart/components/ChartTapRadialMenu.tsx');

  assert.match(source, /const CHART_TAP_MENU_SIZE = 224/);
  assert.match(source, /const CHART_TAP_RING_WIDTH = 36/);
  assert.match(
    source,
    /const CHART_TAP_OUTER_ITEM_RADIUS = CHART_TAP_MENU_SIZE \/ 2 - CHART_TAP_RING_WIDTH \/ 2/,
  );
  assert.match(source, /const CHART_TAP_ACTION_RADIUS = CHART_TAP_OUTER_ITEM_RADIUS/);
  assert.match(source, /TIMEFRAME_ITEMS\.map/);
  assert.match(source, /actionItems\.map/);
});

test('radial menu clamps safe-area edge taps without collapsing every anchor to one center', () => {
  const source = readSource('src/features/chart/components/ChartTapRadialMenu.tsx');

  assert.match(
    source,
    /const clampMenuCenter = \(value: number, containerSize: number\) =>\s*clampValue\(\s*value,\s*CHART_TAP_MENU_PADDING \+ CHART_TAP_MENU_SIZE \/ 2,[\s\S]*containerSize - CHART_TAP_MENU_SIZE \/ 2 - CHART_TAP_MENU_PADDING/,
  );
  assert.match(
    source,
    /const clampedCenterX = clampMenuCenter\(centerX, containerWidth\);[\s\S]*left: Math\.round\(clampedCenterX - CHART_TAP_MENU_SIZE \/ 2\)/,
  );
  assert.match(
    source,
    /const computeAnchorPosition = React\.useCallback\(\(\) => \(\s*resolveMenuPosition\(anchorX, anchorY\)\s*\)/,
  );

  // A 393dp safe-area width is representative of the connected phone. Edge
  // taps clamp inward, while the center tap stays centered; none may be
  // replaced with one hard-coded screen center.
  const menuSize = 224;
  const padding = 10;
  const safeAreaWidth = 393;
  const clampCenter = (value: number) => Math.min(
    Math.max(value, padding + menuSize / 2),
    Math.max(padding + menuSize / 2, safeAreaWidth - menuSize / 2 - padding),
  );
  const centers = [24, safeAreaWidth / 2, safeAreaWidth - 24].map(clampCenter);
  const leftOffsets = centers.map((center) => Math.round(center - menuSize / 2));

  assert.deepEqual(centers, [122, 196.5, 271]);
  assert.deepEqual(leftOffsets, [10, 85, 159]);
  assert.equal(new Set(leftOffsets).size, 3);
});

test('radial menu reproduces the measured MT5 scale-and-turn entrance', () => {
  const source = readSource('src/features/chart/components/ChartTapRadialMenu.tsx');

  assert.match(source, /const CHART_TAP_MENU_OPEN_DURATION_MS = 165/);
  assert.match(source, /const CHART_TAP_MENU_OPEN_SCALE_FROM = 0\.5/);
  assert.match(source, /const CHART_TAP_MENU_OPEN_ROTATION_FROM_DEG = -90/);
  assert.match(
    source,
    /const CHART_TAP_MENU_OPEN_SCALE_TIMESTAMPS_MS = \[\s*0,\s*16,\s*33,\s*50,\s*67,\s*84,\s*100,\s*115,\s*CHART_TAP_MENU_OPEN_DURATION_MS,\s*\];/,
  );
  assert.match(
    source,
    /const CHART_TAP_MENU_OPEN_SCALE_PROGRESS_STOPS = CHART_TAP_MENU_OPEN_SCALE_TIMESTAMPS_MS\.map\(\s*\(timestampMs\) => timestampMs \/ CHART_TAP_MENU_OPEN_DURATION_MS,\s*\);/,
  );
  assert.match(
    source,
    /const CHART_TAP_MENU_OPEN_SCALE_STOPS = \[\s*CHART_TAP_MENU_OPEN_SCALE_FROM,\s*0\.6,\s*0\.7,\s*0\.79,\s*0\.875,\s*0\.94,\s*0\.985,\s*1,\s*1,\s*\];/,
  );
  assert.match(
    source,
    /const CHART_TAP_MENU_OPEN_ROTATION_TIMESTAMPS_MS = \[\s*0,\s*16,\s*33,\s*50,\s*67,\s*84,\s*100,\s*116,\s*133,\s*CHART_TAP_MENU_OPEN_DURATION_MS,\s*\];/,
  );
  assert.match(
    source,
    /const CHART_TAP_MENU_OPEN_ROTATION_PROGRESS_STOPS = CHART_TAP_MENU_OPEN_ROTATION_TIMESTAMPS_MS\.map\(\s*\(timestampMs\) => timestampMs \/ CHART_TAP_MENU_OPEN_DURATION_MS,\s*\);/,
  );
  assert.match(
    source,
    /const CHART_TAP_MENU_OPEN_ROTATION_STOPS = \[\s*`\$\{CHART_TAP_MENU_OPEN_ROTATION_FROM_DEG\}deg`,\s*'-51deg',\s*'-40deg',\s*'-30deg',\s*'-23deg',\s*'-16deg',\s*'-10deg',\s*'-6deg',\s*'-2deg',\s*'0deg',\s*\];/,
  );
  assert.match(source, /const entranceProgress = React\.useRef\(new Animated\.Value\(0\)\)\.current/);
  assert.equal(
    source.match(/const entranceProgress = React\.useRef\(new Animated\.Value\(0\)\)\.current/g)?.length,
    1,
  );
  assert.match(
    source,
    /const entranceScale = React\.useMemo\([\s\S]*entranceProgress\.interpolate\(\{[\s\S]*inputRange: CHART_TAP_MENU_OPEN_SCALE_PROGRESS_STOPS,[\s\S]*outputRange: CHART_TAP_MENU_OPEN_SCALE_STOPS/,
  );
  assert.match(
    source,
    /const entranceRotation = React\.useMemo\([\s\S]*entranceProgress\.interpolate\(\{[\s\S]*inputRange: CHART_TAP_MENU_OPEN_ROTATION_PROGRESS_STOPS,[\s\S]*outputRange: CHART_TAP_MENU_OPEN_ROTATION_STOPS/,
  );
  assert.match(
    source,
    /const startEntranceAnimation = React\.useCallback\(\(\) => \{\s*Animated\.timing\(entranceProgress, \{[\s\S]*toValue: 1,[\s\S]*duration: CHART_TAP_MENU_OPEN_DURATION_MS,[\s\S]*easing: Easing\.linear,[\s\S]*useNativeDriver: true,[\s\S]*\}\)\.start\(\)/,
  );
  assert.equal(source.match(/Animated\.timing\(entranceProgress,/g)?.length, 1);
  assert.match(
    source,
    /<Animated\.View[\s\S]*renderToHardwareTextureAndroid[\s\S]*transform: \[[\s\S]*\{ scale: entranceScale \},[\s\S]*\{ rotate: entranceRotation \}/,
  );
  assert.doesNotMatch(
    source,
    /Reanimated|useSharedValue|executeOnUIRuntimeSync|withDelay|withTiming|CHART_TAP_MENU_OPEN_OPACITY_FROM|Animated\.parallel/,
  );
});

test('radial menu stays pre-mounted but hidden and non-interactive between chart taps', () => {
  const source = readSource('src/features/chart/components/ChartTapRadialMenu.tsx');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');

  assert.match(source, /function ChartTapRadialMenuComponent\(/);
  assert.match(
    source,
    /export const ChartTapRadialMenu = React\.memo\(ChartTapRadialMenuComponent\);\s*ChartTapRadialMenu\.displayName = 'ChartTapRadialMenu';/,
  );
  assert.match(source, /anchor: ChartTapMenuAnchor \| null/);
  assert.match(source, /visible: boolean/);
  assert.match(
    source,
    /<View[\s\S]*style=\{\[styles\.layer, !visible && styles\.layerHidden\]\}[\s\S]*pointerEvents=\{visible \? 'box-none' : 'none'\}/,
  );
  assert.match(source, /layerHidden: \{\s*opacity: 0,[\s\S]*\}/);

  const hiddenBranchStart = source.indexOf('if (!visible) {', source.indexOf('const renderedMenuPosition'));
  const visibleReopenStart = source.indexOf('cancelHiddenResetFrame();', hiddenBranchStart);
  const hiddenResetEffectStart = source.indexOf('React.useEffect(() => {', visibleReopenStart);
  const hiddenResetEffectEnd = source.indexOf('const panResponder = React.useMemo', hiddenResetEffectStart);
  assert.notEqual(hiddenBranchStart, -1);
  assert.notEqual(visibleReopenStart, -1);
  assert.notEqual(hiddenResetEffectStart, -1);
  assert.notEqual(hiddenResetEffectEnd, -1);
  const hiddenLayoutBranch = source.slice(hiddenBranchStart, visibleReopenStart);
  const openingLayoutBranch = source.slice(visibleReopenStart, hiddenResetEffectStart);
  const hiddenResetEffect = source.slice(hiddenResetEffectStart, hiddenResetEffectEnd);

  assert.match(
    hiddenLayoutBranch,
    /if \(!visible\) \{\s*wasVisibleRef\.current = false;\s*lastAnchorKeyRef\.current = 'hidden';\s*return;\s*\}/,
  );
  assert.doesNotMatch(hiddenLayoutBranch, /entranceProgress\.(?:stopAnimation|setValue)/);
  assert.match(
    openingLayoutBranch,
    /cancelHiddenResetFrame\(\);\s*const isOpening = !wasVisibleRef\.current;[\s\S]*if \(!isOpening\) \{\s*return;\s*\}[\s\S]*entranceProgress\.setValue\(0\);[\s\S]*startEntranceAnimation\(\);/,
  );
  assert.equal(openingLayoutBranch.match(/entranceProgress\.setValue\(0\)/g)?.length, 1);
  assert.equal(openingLayoutBranch.match(/startEntranceAnimation\(\)/g)?.length, 1);
  assert.doesNotMatch(openingLayoutBranch, /entranceProgress\.stopAnimation|setNativeProps/);

  assert.match(
    source,
    /const cancelHiddenResetFrame = React\.useCallback\(\(\) => \{[\s\S]*cancelAnimationFrame\(hiddenResetFrameRef\.current\);[\s\S]*hiddenResetFrameRef\.current = null;[\s\S]*\}, \[\]\);/,
  );
  assert.match(
    source,
    /React\.useLayoutEffect\(\(\) => \{\s*return \(\) => \{\s*entranceProgress\.stopAnimation\(\);\s*cancelHiddenResetFrame\(\);/,
  );
  assert.match(
    hiddenResetEffect,
    /React\.useEffect\(\(\) => \{\s*if \(visible\) \{\s*cancelHiddenResetFrame\(\);\s*return;\s*\}\s*cancelHiddenResetFrame\(\);\s*hiddenResetFrameRef\.current = requestAnimationFrame\(\(\) => \{\s*hiddenResetFrameRef\.current = null;\s*if \(!wasVisibleRef\.current\) \{\s*entranceProgress\.setValue\(0\);\s*\}\s*\}\);\s*return cancelHiddenResetFrame;/,
  );
  assert.doesNotMatch(
    source,
    /entranceStartFrameRef|cancelPendingEntranceStart/,
  );
  assert.match(
    source,
    /const renderedMenuPosition = visible && lastAnchorKeyRef\.current !== anchorKey[\s\S]*\? computeAnchorPosition\(\)[\s\S]*: menuPositionRef\.current;/,
  );
  assert.match(
    source,
    /style=\{\[[\s\S]*styles\.menu,[\s\S]*top: renderedMenuPosition\.top,[\s\S]*left: renderedMenuPosition\.left/,
  );
  const applyMenuPositionStart = source.indexOf('const applyMenuPosition = React.useCallback');
  const firstLayoutEffectStart = source.indexOf('React.useLayoutEffect(() => {', applyMenuPositionStart);
  const applyMenuPosition = source.slice(applyMenuPositionStart, firstLayoutEffectStart);
  assert.match(applyMenuPosition, /menuViewRef\.current\?\.setNativeProps\(/);
  assert.equal(source.match(/menuViewRef\.current\?\.setNativeProps\(/g)?.length, 1);
  assert.match(
    chartSource,
    /<ChartTapRadialMenu\s+anchor=\{chartTapMenuAnchor\}\s+visible=\{chartTapMenuAnchor !== null\}/,
  );
  assert.doesNotMatch(chartSource, /\{chartTapMenuAnchor \? \(\s*<ChartTapRadialMenu/);
});

test('chart tap coalesces its pending touch release into the radial-open commit', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const settleStart = source.indexOf('const settleChartViewportTouchForRadialOpen = useCallback');
  const settleEnd = source.indexOf('useEffect(() => {', settleStart);
  assert.notEqual(settleStart, -1);
  assert.notEqual(settleEnd, -1);
  const settleTouch = source.slice(settleStart, settleEnd);

  assert.match(
    settleTouch,
    /chartViewportTouchReleaseFrameRef\.current !== null[\s\S]*cancelAnimationFrame\(chartViewportTouchReleaseFrameRef\.current\);[\s\S]*chartViewportTouchReleaseFrameRef\.current = null;/,
  );
  assert.match(
    settleTouch,
    /clearTimeout\(chartViewportTouchFailsafeTimerRef\.current\);[\s\S]*chartViewportTouchFailsafeTimerRef\.current = null;[\s\S]*chartViewportTouchActiveRef\.current = false;[\s\S]*setChartViewportTouchActive\(false\);/,
  );
  assert.doesNotMatch(settleTouch, /requestAnimationFrame\(/);

  const chartTapStart = source.indexOf("} else if (msg.type === 'CHART_TAP')");
  const chartTapEnd = source.indexOf("} else if (msg.type === 'CHART_DOUBLE_TAP')", chartTapStart);
  assert.notEqual(chartTapStart, -1);
  assert.notEqual(chartTapEnd, -1);
  const chartTapBranch = source.slice(chartTapStart, chartTapEnd);

  assert.match(
    chartTapBranch,
    /if \(chartTapMenuAnchor === null\) \{[\s\S]*settleChartViewportTouchForRadialOpen\(\);[\s\S]*\}\s*setChartTapMenuAnchor\(\(currentAnchor\) => \(\s*currentAnchor \? null : nextAnchor\s*\)\)/,
  );
  assert.doesNotMatch(chartTapBranch, /requestAnimationFrame|syncChartViewportFrame|measureInWindow/);
});

test('duplicate chart touch release returns before cancelling the armed release frame', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const touchEndStart = source.indexOf('const handleChartViewportTouchEnd = useCallback');
  const touchEndEnd = source.indexOf(
    'const settleChartViewportTouchForRadialOpen = useCallback',
    touchEndStart,
  );
  assert.notEqual(touchEndStart, -1);
  assert.notEqual(touchEndEnd, -1);
  const touchEnd = source.slice(touchEndStart, touchEndEnd);
  const inactiveReturn = touchEnd.match(
    /if \(!chartViewportTouchActiveRef\.current\) \{\s*return;\s*\}/,
  );
  assert.ok(inactiveReturn?.index !== undefined);
  const firstCancelFrame = touchEnd.indexOf('cancelAnimationFrame(');
  assert.notEqual(firstCancelFrame, -1);
  assert.ok(
    inactiveReturn.index < firstCancelFrame,
    'a duplicate release must return before it can cancel the first release frame',
  );
});

test('radial menu timeframe and action items use the same reliable fast-press path', () => {
  const source = readSource('src/features/chart/components/ChartTapRadialMenu.tsx');

  // Timeframes (M1…MN) must not rely on plain onPress alone — WebView + Android
  // drop release events unless activateOnPressIn/TouchStart are set.
  assert.match(source, /TIMEFRAME_ITEMS\.map\(\(item\) => \{[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/);
  assert.match(
    source,
    /onPress=\{\(event\) => handleActionItemPress\(event, \(\) => onSelectTimeframe\(item\.key\)\)\}/,
  );
  assert.match(source, /hitSlop=\{CHART_TAP_TIMEFRAME_HIT_SLOP\}/);
  assert.match(source, /pointerEvents: 'none'/);

  // Action ring (tile windows, objects, draw, scale, symbol, indicators)
  assert.match(
    source,
    /actionItems\.map\(\(item\) => \{[\s\S]*onPress=\{\(event\) => handleActionItemPress\(event, item\.onPress\)\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/,
  );
});

test('tile windows occupies the radial slot immediately before M1', () => {
  const source = readSource('src/features/chart/components/ChartTapRadialMenu.tsx');
  const iconSource = readSource('src/features/chart/components/ChartToolbarIcons.tsx');

  assert.match(source, /onOpenChartWindows: \(\) => void/);
  assert.match(
    source,
    /key: 'windows',[\s\S]*angle: 288,[\s\S]*accessibilityLabel: t\('Tile windows'\)[\s\S]*<TvTileWindows color=\{color\} \/>[\s\S]*onPress: onOpenChartWindows/,
  );
  assert.match(source, /key: 'objects',[\s\S]*angle: 264/);
  assert.match(source, /key: 'draw',[\s\S]*angle: 240/);
  assert.match(source, /key: 'scale',[\s\S]*angle: 216/);
  assert.match(source, /key: 'symbol',[\s\S]*angle: 192/);
  assert.match(source, /key: 'indicators',[\s\S]*angle: 168/);
  assert.match(source, /\{ key: 'M1', angle: 312/);
  assert.match(iconSource, /export const TvTileWindows[\s\S]*<Path[\s\S]*<Rect/);
});

test('radial menu pan responder does not capture taps from timeframe and action pressables', () => {
  const source = readSource('src/features/chart/components/ChartTapRadialMenu.tsx');

  assert.match(source, /onStartShouldSetPanResponder: \(\) => false/);
  assert.match(source, /onStartShouldSetPanResponderCapture: \(\) => false/);
  assert.match(source, /onMoveShouldSetPanResponderCapture: \(\) => false/);
  assert.match(source, /CHART_TAP_MENU_DRAG_CLAIM_PX = 12/);
  assert.match(source, /onPanResponderTerminationRequest: \(\) => true/);
  assert.doesNotMatch(
    source,
    /onMoveShouldSetPanResponderCapture: \(_event, gestureState\) =>/,
    'must not capture move gestures away from Pressable children',
  );
});

test('chart screen wires every radial option to a concrete action', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');
  const radialStart = source.indexOf('<ChartTapRadialMenu');
  assert.notEqual(radialStart, -1);
  const radialEnd = source.indexOf('/>', radialStart);
  assert.notEqual(radialEnd, -1);
  const radialMount = source.slice(radialStart, radialEnd + 2);

  assert.match(radialMount, /onSelectTimeframe=\{handleTimeframeSelect\}/);
  assert.match(radialMount, /onOpenChartWindows=\{handleOpenChartWindows\}/);
  assert.match(radialMount, /onOpenObjects=\{handleRadialOpenObjects\}/);
  assert.match(radialMount, /onOpenDrawingTools=\{handleRadialOpenDrawingTools\}/);
  assert.match(radialMount, /onOpenIndicators=\{handleRadialOpenIndicators\}/);
  assert.match(radialMount, /onOpenSymbolPicker=\{handleRadialOpenSymbolPicker\}/);
  assert.match(radialMount, /onOpenScaleControls=\{handleRadialOpenChartScaleMenu\}/);
  assert.doesNotMatch(
    radialMount,
    /onOpen(?:Objects|DrawingTools|Indicators|SymbolPicker)=\{\(\) =>/,
  );

  assert.match(
    source,
    /const handleRadialOpenObjects = useCallback\(\(\) => \{\s*closeChartTapMenu\(\);\s*handleOpenObjectsScreen\(\);\s*\}, \[closeChartTapMenu, handleOpenObjectsScreen\]\);/,
  );
  assert.match(
    source,
    /const handleRadialOpenDrawingTools = useCallback\(\(\) => \{\s*closeChartTapMenu\(\);\s*routeChartWindowToolbarAction\('drawings'\);\s*\}, \[closeChartTapMenu, routeChartWindowToolbarAction\]\);/,
  );
  assert.match(
    source,
    /const handleRadialOpenIndicators = useCallback\(\(\) => \{[\s\S]*closeChartTapMenu\(\);[\s\S]*router\.push\('\/chart\/indicators'\)[\s\S]*\}, \[closeChartTapMenu, router\]\);/,
  );
  assert.match(
    source,
    /const handleRadialOpenSymbolPicker = useCallback\(\(\) => \{\s*closeChartTapMenu\(\);\s*handleOpenSymbolPicker\(\);\s*\}, \[closeChartTapMenu, handleOpenSymbolPicker\]\);/,
  );
  assert.match(
    source,
    /const latestHandleOpenChartScaleMenuRef = useRef\(handleOpenChartScaleMenu\);\s*latestHandleOpenChartScaleMenuRef\.current = handleOpenChartScaleMenu;\s*const handleRadialOpenChartScaleMenu = useCallback\(\(\) => \{\s*latestHandleOpenChartScaleMenuRef\.current\(\);\s*\}, \[\]\);/,
  );

  assert.match(
    source,
    /const handleTimeframeSelect = useCallback[\s\S]*closeChartTapMenu\(\)[\s\S]*chartWindows\.updateToolbarTargetContext\(\{ timeframe: nextTimeframe \}\)/,
  );
  assert.match(
    source,
    /const chartWindows = useChartWindowsFeature\(\{[\s\S]*onCommitContext: commitChartWindowContext[\s\S]*chartWindowCommitContextImplementationRef\.current = warmChartContextAndCommit/,
  );
  assert.match(
    source,
    /const handleOpenChartScaleMenu = useCallback[\s\S]*closeChartTapMenu\(\)[\s\S]*showChartActionSheet\(\{/,
  );
});
