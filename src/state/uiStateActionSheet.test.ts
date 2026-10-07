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
