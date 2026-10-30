import assert from 'node:assert/strict';
import test from 'node:test';

import { useUIState, type ActionSheetConfig } from './uiState';

const initialState = useUIState.getInitialState();

test.afterEach(() => {
  useUIState.setState(initialState, true);
});

test('the accepted Quotes tap atomically outranks hidden preloaded content', () => {
  const firstSymbolConfig: ActionSheetConfig = {
    title: 'EURUSD: Euro / US Dollar',
    presentation: 'mt5Plain',
    instantOpen: true,
    entryMotion: 'mt5Slide',
    actions: [{ label: 'Chart' }],
  };
  const tappedSymbolConfig: ActionSheetConfig = {
    title: 'ETHUSD: Ethereum / US Dollar',
    presentation: 'mt5Plain',
    instantOpen: true,
    entryMotion: 'mt5Slide',
    actions: [{ label: 'New Order' }, { label: 'Chart' }],
  };

  useUIState.getState().preloadQuotesActionSheet(firstSymbolConfig);

  let snapshot = useUIState.getState();
  assert.equal(snapshot.actionSheetScope, 'quotes');
  assert.equal(snapshot.scopedActionSheets.quotes, null);
  assert.equal(snapshot.preloadedScopedActionSheets.quotes?.title, firstSymbolConfig.title);
  assert.equal(snapshot.preloadedScopedActionSheets.quotes?.instantOpen, true);
  assert.strictEqual(snapshot.preloadedScopedActionSheets.quotes, firstSymbolConfig);

  useUIState.getState().showQuotesActionSheet(tappedSymbolConfig);

  snapshot = useUIState.getState();
  assert.equal(snapshot.actionSheet, null);
  assert.equal(snapshot.actionSheetScope, 'quotes');
  assert.equal(snapshot.scopedActionSheets.quotes?.title, tappedSymbolConfig.title);
  assert.equal(snapshot.scopedActionSheets.quotes?.instantOpen, true);
  assert.equal(snapshot.scopedActionSheets.quotes?.entryMotion, 'mt5Slide');
  assert.strictEqual(snapshot.scopedActionSheets.quotes, tappedSymbolConfig);
  assert.equal(snapshot.preloadedScopedActionSheets.quotes?.title, firstSymbolConfig.title);

  useUIState.getState().preloadScopedActionSheet('chart', {
    title: 'Symbols',
    actions: [{ label: 'BTCUSD' }],
  });

  snapshot = useUIState.getState();
  assert.equal(snapshot.actionSheetScope, 'quotes');
  assert.equal(snapshot.scopedActionSheets.quotes?.title, tappedSymbolConfig.title);
  assert.equal(snapshot.preloadedScopedActionSheets.chart?.title, 'Symbols');

  useUIState.getState().hideQuotesActionSheet();

  snapshot = useUIState.getState();
  assert.equal(snapshot.actionSheetScope, 'quotes');
  assert.equal(snapshot.scopedActionSheets.quotes, null);
  assert.equal(snapshot.preloadedScopedActionSheets.quotes?.title, firstSymbolConfig.title);

  useUIState.getState().preloadScopedActionSheet('chart', {
    title: 'Symbols updated',
    actions: [{ label: 'ETHUSD' }],
  });

  snapshot = useUIState.getState();
  assert.equal(snapshot.actionSheetScope, 'chart');
  assert.equal(snapshot.preloadedScopedActionSheets.chart?.title, 'Symbols updated');
});

test('an inactive Quotes preload replaces a retained Chart preload scope', () => {
  useUIState.getState().preloadScopedActionSheet('chart', {
    title: 'Select Symbol',
    visualKey: 'chart.symbolPicker',
    actions: [{ label: 'EURUSD' }],
  });
  useUIState.getState().showChartActionSheet({
    title: 'Drawing Tools',
    entryMotion: 'mt5Slide',
    actions: [{ label: 'Trend Line' }],
  });
  useUIState.getState().hideChartActionSheet();

  let snapshot = useUIState.getState();
  assert.equal(snapshot.actionSheetScope, 'chart');
  assert.equal(snapshot.scopedActionSheets.chart, null);

  useUIState.getState().preloadQuotesActionSheet({
    title: 'EURUSD: Euro / US Dollar',
    visualKey: 'quotes.EURUSD',
    actions: [{ label: 'New Order' }],
  });

  snapshot = useUIState.getState();
  assert.equal(snapshot.actionSheetScope, 'quotes');
  assert.equal(snapshot.preloadedScopedActionSheets.quotes?.visualKey, 'quotes.EURUSD');
});

test('identical chart menu reopens publish a fresh request without changing retained content', () => {
  const drawingTools: ActionSheetConfig = {
    title: 'Drawing Tools',
    instantOpen: true,
    entryMotion: 'instant',
    actions: [{ label: 'Trend Line' }],
  };
  const more: ActionSheetConfig = {
    instantOpen: true,
    entryMotion: 'mt5Slide',
    actions: [{ label: 'Fullscreen' }],
  };
  for (const config of [drawingTools, more]) {
    useUIState.getState().showChartActionSheet(config);
    const beforeClose = useUIState.getState();
    useUIState.getState().hideChartActionSheet();
    useUIState.getState().showChartActionSheet(config);
    const afterReopen = useUIState.getState();
    assert.strictEqual(afterReopen.scopedActionSheets.chart, beforeClose.scopedActionSheets.chart);
    assert.ok(afterReopen.actionSheetOpenRevision > beforeClose.actionSheetOpenRevision,
      'React must receive an opening signal even when closed=false never renders');

    const revision = afterReopen.actionSheetOpenRevision;
    useUIState.getState().preloadScopedActionSheet('chart', drawingTools);
    useUIState.getState().preloadQuotesActionSheet({ actions: [{ label: 'Quote' }] });
    assert.equal(useUIState.getState().actionSheetOpenRevision, revision,
      'background preloads must not restart or reveal a menu');
  }
});

test('every shared menu opener advances its request while dismissals preserve it', () => {
  const config: ActionSheetConfig = { instantOpen: true, actions: [{ label: 'Action' }] };
  const state = useUIState.getState();
  const openers = [
    () => state.showActionSheet(config),
    () => state.showScopedActionSheet('chart', config),
    () => state.showQuotesActionSheet(config),
    () => state.showChartActionSheet(config),
    () => state.showTradeActionSheet(config),
    () => state.showHistoryActionSheet(config),
    () => state.showAccountsActionSheet(config),
    () => state.showBrokerDetailActionSheet(config),
  ];
  for (const open of openers) {
    const before = useUIState.getState().actionSheetOpenRevision;
    open();
    assert.equal(useUIState.getState().actionSheetOpenRevision, before + 1);
    state.hideActionSheet();
    assert.equal(useUIState.getState().actionSheetOpenRevision, before + 1);
  }
});
