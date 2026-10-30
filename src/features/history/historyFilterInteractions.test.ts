import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as dateUtils from './HistoryFilterScreen/dateUtils';
import * as dateRange from './historyDateRange';

// Execute the actual UI handlers and preference actions without loading native
// modules. Setter changes are visible on the next interaction, like a render.
const expressions = new Map<string, string>();
for (const file of ['src/features/history/HistoryFilterScreen/HistoryFilterScreen.tsx', 'src/state/userPreferences/store.ts']) {
  const source = readFileSync(resolve(process.cwd(), file), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if ((ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) && node.initializer) {
      const name = node.name.getText(tree);
      if (['handlePresetPress', 'handleDayPress', 'applyCustomRange', 'setHistoryRange', 'setHistoryDateRange'].includes(name)) {
        expressions.set(name, ts.transpile(`(${node.initializer.getText(tree)})`, { target: ts.ScriptTarget.ES2020 }));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
}

function createFilter() {
  const preferences = { historyRange: 'All time', historyFromMs: null as number | null, historyToMs: null as number | null };
  const writes: typeof preferences[] = [];
  const draft = { isCustom: false, startDate: null as string | null, endDate: null as string | null };
  let backCount = 0;
  const actions = Object.fromEntries(['setHistoryRange', 'setHistoryDateRange'].map(name => [name, runInNewContext(expressions.get(name)!, {
    set: (patch: Partial<typeof preferences>) => { Object.assign(preferences, patch); writes.push({ ...preferences }); },
  })]));
  const invoke = (name: string, ...args: unknown[]) => {
    const callback = runInNewContext(expressions.get(name)!, {
      ...dateUtils, ...dateRange, ...preferences, ...draft, ...actions,
      language: 'en', todayDate: new Date(),
      scrollRef: { current: null }, calendarOffset: { current: 0 }, revealCalendarOnLayout: { current: false },
      setIsCustom: (value: boolean) => { draft.isCustom = value; },
      setStartDate: (value: string | null) => { draft.startDate = value; },
      setEndDate: (value: string | null) => { draft.endDate = value; },
      setCalYear: () => {}, setCalMonth: () => {},
      useCallback: (callback: unknown) => callback,
      handleBack: () => { backCount++; },
    });
    callback(...args);
  };
  return { preferences, writes, draft, invoke, backCount: () => backCount };
}

test('each time-period choice clears previous custom dates atomically and returns to History', () => {
  for (const preset of dateUtils.PRESETS.filter(preset => preset !== 'Custom')) {
    const filter = createFilter();
    Object.assign(filter.preferences, { historyRange: 'Custom', historyFromMs: 1000, historyToMs: 2000 });
    filter.invoke('handlePresetPress', preset);
    assert.equal(filter.writes.length, 1, preset);
    assert.deepEqual(filter.preferences, { historyRange: preset, historyFromMs: null, historyToMs: null });
    assert.equal(filter.backCount(), 1, preset);
  }
});

test('Custom waits for a date, then applies a single full day and returns to History', () => {
  const filter = createFilter();
  filter.invoke('handlePresetPress', 'Custom');
  assert.equal(filter.draft.isCustom, true);
  assert.equal(filter.writes.length, 0);
  filter.invoke('applyCustomRange');
  assert.equal(filter.backCount(), 0);
  filter.invoke('handleDayPress', 2026, 8, 25);
  filter.invoke('applyCustomRange');
  assert.equal(filter.writes.length, 1);
  assert.equal(filter.preferences.historyFromMs, new Date(2026, 8, 25).getTime());
  assert.equal(filter.preferences.historyToMs, new Date(2026, 8, 25, 23, 59, 59, 999).getTime());
  assert.notEqual(filter.preferences.historyRange, 'All time');
  assert.equal(filter.backCount(), 1);
});

test('Custom accepts dates in reverse order and preserves both dates in one update', () => {
  const filter = createFilter();
  filter.invoke('handlePresetPress', 'Custom');
  filter.invoke('handleDayPress', 2026, 8, 25);
  filter.invoke('handleDayPress', 2026, 7, 15);
  filter.invoke('applyCustomRange');
  assert.equal(filter.writes.length, 1);
  assert.equal(filter.preferences.historyFromMs, new Date(2026, 7, 15).getTime());
  assert.equal(filter.preferences.historyToMs, new Date(2026, 8, 25, 23, 59, 59, 999).getTime());
  assert.equal(filter.backCount(), 1);
});

test('History refetches after deferred focus activation and after foreground resume', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/history/HistoryScreen.tsx'), 'utf8');
  const effect = source.slice(source.indexOf('  const wasFocusedRef ='), source.indexOf('  const accountLoginStr ='));
  assert.ok(effect.includes('useEffect'));
  const ref = { current: false };
  const refreshes = { positions: 0, deals: 0, orders: 0 };
  for (const [focused, active] of [[false, false], [true, false], [true, true], [true, true], [true, false], [true, true]]) {
    runInNewContext(effect, {
      isScreenFocused: focused, historyDataActive: active,
      useRef: () => ref, useEffect: (callback: () => void) => callback(),
      refetchPositionHistory: () => { refreshes.positions++; },
      refetchDeals: () => { refreshes.deals++; },
      refetchOrders: () => { refreshes.orders++; },
    });
  }
  assert.deepEqual(refreshes, { positions: 2, deals: 2, orders: 2 });
});
