import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('Economic Calendar opens its retained filter sheet without rebuilding the calendar screen', () => {
  const screen = readSource(
    'src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx',
  );

  assert.doesNotMatch(screen, /filterModalOpen|setFilterModalOpen/);
  assert.match(screen, /useRef<EconomicEventFiltersSheetHandle>\(null\)/);
  assert.match(
    screen,
    /const openEventFilters = useCallback[\s\S]*runImmediateAction\('economicCalendar\.filters\.open'[\s\S]*eventFiltersSheetRef\.current\?\.open\(\)/,
  );
  assert.match(
    screen,
    /onPress=\{openEventFilters\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*unstable_pressDelay=\{0\}/,
  );
  assert.match(
    screen,
    /<EconomicEventFiltersSheet[\s\S]*ref=\{eventFiltersSheetRef\}[\s\S]*selectedImpacts=\{selectedImpacts\}[\s\S]*onApply=\{applyEventFilters\}/,
  );
  assert.match(
    screen,
    /const applyEventFilters = useCallback[\s\S]*React\.startTransition[\s\S]*setSelectedImpacts\(nextImpacts\)/,
  );
});

test('Economic Calendar filter sheet reveals its retained layout without animation or dismissal timers', () => {
  const sheet = readSource(
    'src/features/settings/EconomicCalendarScreen/EconomicEventFiltersSheet.tsx',
  );
  const styles = readSource(
    'src/features/settings/EconomicCalendarScreen/styles.ts',
  );

  assert.match(sheet, /React\.memo\(React\.forwardRef/);
  assert.match(sheet, /const \[visible, setVisible\] = useState\(false\)/);
  assert.match(sheet, /const \[draftImpacts, setDraftImpacts\] = useState/);
  assert.match(sheet, /useImperativeHandle\(ref, \(\) => \(\{ open, close: hideNow \}\)/);
  // The native Modal window was the source of the cold-first-open compositor
  // hitch and system-bar geometry jump. Keep this host retained in-tree.
  assert.doesNotMatch(sheet, /<Modal|OVERLAY_MODAL_PROPS|navigationBarTranslucent/);
  assert.match(
    sheet,
    /pointerEvents=\{visible \? 'box-none' : 'none'\}[\s\S]*styles\.filterSheetHost[\s\S]*visible \? null : styles\.filterSheetHostHidden/,
    'Economic Calendar filter host must remain mounted behind a React visibility barrier',
  );
  assert.match(sheet, /backdropColor = isDark \? 'rgba\(0,0,0,0\.72\)' : 'rgba\(0,0,0,0\.3\)'/);
  assert.doesNotMatch(sheet, /rgba\(0,0,0,0\.6\)/);
  assert.doesNotMatch(sheet, /Animated\.timing|Animated\.View|setTimeout|reduceMotionChanged/);
  assert.match(sheet, /const open = useCallback[\s\S]*if \(visibleRef\.current\) return;[\s\S]*setDraftImpacts\(new Set\(selectedImpactsRef\.current\)\)[\s\S]*setVisible\(true\)/);
  assert.match(sheet, /const hideNow = useCallback[\s\S]*visibleRef\.current = false;[\s\S]*setVisible\(false\)/);
  assert.match(sheet, /'hardwareBackPress'[\s\S]*hideNow\(\)/);
  assert.match(sheet, /Date\.now\(\) - openedAtRef\.current < EVENT_FILTER_OPEN_GUARD_MS/);
  assert.doesNotMatch(sheet, /scale:|scaleY:|opacity: sheetOpacity/);
  assert.match(
    sheet,
    /const handleApply = useCallback[\s\S]*const nextImpacts = new Set\(draftImpacts\);[\s\S]*hideNow\(\);[\s\S]*onApply\(nextImpacts\)/,
  );
  assert.match(styles, /filterSheetHost: \{[\s\S]*\.\.\.StyleSheet\.absoluteFillObject[\s\S]*zIndex: 10000/);
  assert.match(styles, /filterSheetHostHidden: \{[\s\S]*opacity: 0/);
  assert.match(styles, /modalOverlay: \{[\s\S]*flex: 1[\s\S]*alignItems: 'stretch'[\s\S]*overflow: 'hidden'/);
  assert.match(styles, /modalCard: \{[\s\S]*width: '100%'[\s\S]*alignSelf: 'stretch'/);
  assert.match(styles, /elevation: 0/);
  assert.doesNotMatch(styles, /maxWidth: 480/);
});
