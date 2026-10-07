import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChartInitSignature,
  readChartInitContextEpoch,
  shouldAcceptChartDataPaint,
  shouldAcceptChartReady,
} from './chartReadyContext';

const CURRENT_XAUUSD_M1 = {
  configSig: 'candles-grid-dark',
  dataContextSig: 'XAUUSD-M1',
  dataContextEpoch: 4,
};

test('round-trips the selection epoch through the echoed init signature', () => {
  const signature = buildChartInitSignature(4, 'XAUUSD-M1:candles-grid-dark:snapshot');
  assert.equal(signature, 'context-epoch=4|XAUUSD-M1:candles-grid-dark:snapshot');
  assert.equal(readChartInitContextEpoch(signature), 4);
  assert.equal(readChartInitContextEpoch('legacy-signature'), -1);
});

test('accepts an older candle snapshot acknowledgement for the active XAUUSD context', () => {
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: buildChartInitSignature(4, 'candles-grid-dark:older-xauusd-snapshot'),
        configSig: 'candles-grid-dark',
        dataContextSig: 'XAUUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      CURRENT_XAUUSD_M1,
    ),
    true,
  );
});

test('rejects a delayed acknowledgement from the previously selected symbol', () => {
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: buildChartInitSignature(4, 'candles-grid-dark:gbpusd-snapshot'),
        configSig: 'candles-grid-dark',
        dataContextSig: 'GBPUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      CURRENT_XAUUSD_M1,
    ),
    false,
  );
});

test('rejects missing init identity or a stale visual shell', () => {
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: '',
        configSig: 'candles-grid-dark',
        dataContextSig: 'XAUUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      CURRENT_XAUUSD_M1,
    ),
    false,
  );
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: 'legacy-xauusd-snapshot',
        configSig: 'candles-grid-dark',
        dataContextSig: 'XAUUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      CURRENT_XAUUSD_M1,
    ),
    false,
  );
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: buildChartInitSignature(4, 'light-shell:xauusd-snapshot'),
        configSig: 'light-shell',
        dataContextSig: 'XAUUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      CURRENT_XAUUSD_M1,
    ),
    false,
  );
});

test('rejects an acknowledgement that no longer owns the latest dispatched context', () => {
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: buildChartInitSignature(4, 'candles-grid-dark:xauusd-snapshot'),
        configSig: 'candles-grid-dark',
        dataContextSig: 'XAUUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      {
        configSig: 'candles-grid-dark',
        dataContextSig: 'BTCUSD-M1',
        dataContextEpoch: 4,
      },
    ),
    false,
  );
});

test('rejects a delayed A1 acknowledgement after a rapid A to B to A2 switch', () => {
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: 'context-epoch=1|XAUUSD-M1:older-snapshot',
        configSig: 'candles-grid-dark',
        dataContextSig: 'XAUUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      CURRENT_XAUUSD_M1,
    ),
    false,
  );
  assert.equal(
    shouldAcceptChartReady(
      {
        initSignature: buildChartInitSignature(4, 'XAUUSD-M1:current-snapshot'),
        configSig: 'candles-grid-dark',
        dataContextSig: 'XAUUSD-M1',
      },
      CURRENT_XAUUSD_M1,
      {
        ...CURRENT_XAUUSD_M1,
        dataContextEpoch: 3,
      },
    ),
    false,
  );
});

test('accepts only the latest data-paint token for the selected XAUUSD context', () => {
  const pending = {
    paintToken: 'XAUUSD-M1:8',
    dataContextSig: 'XAUUSD-M1',
  };
  assert.equal(
    shouldAcceptChartDataPaint(pending, pending, 'XAUUSD-M1'),
    true,
  );
  assert.equal(
    shouldAcceptChartDataPaint(
      {
        paintToken: 'XAUUSD-M1:7',
        dataContextSig: 'XAUUSD-M1',
      },
      pending,
      'XAUUSD-M1',
    ),
    false,
  );
  assert.equal(
    shouldAcceptChartDataPaint(
      {
        paintToken: 'GBPUSD-M1:8',
        dataContextSig: 'GBPUSD-M1',
      },
      pending,
      'XAUUSD-M1',
    ),
    false,
  );
});
